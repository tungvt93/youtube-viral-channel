import { z } from "zod";
import { CircuitBreaker } from "./circuit-breaker";
import { GeminiApiError } from "./errors";
import { buildClassifyPrompt, buildNormalizeTopicsPrompt } from "./prompt";
import { backoffWithJitter } from "./retry";
import { ClassificationResultSchema, NormalizeTopicsResultSchema } from "./schema";
import type {
  AIProvider,
  ClassificationResult,
  ClassifyVideoInput,
  NormalizeTopicsInput,
  NormalizeTopicsOutput,
} from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Verified live against the real Gemini API on 2026-11-06 (a real
 * `generateContent` call against this exact model id returned HTTP 200
 * with `modelVersion: "gemini-2.5-flash"`) — not guessed from training
 * data, per the plan's explicit requirement. Overridable via `GEMINI_MODEL`
 * (see `.env.example`) without a code change if the model is retired.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Caps how many candidate topics one `normalizeTopics` call sends in a single prompt — bounds prompt size/cost per batch (task-local, see plan's "lower frequency" cadence note). */
export const MAX_CANDIDATES_PER_NORMALIZATION_RUN = 40;

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerCooldownMs?: number;
  now?: () => number;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Minimal adapter over the Gemini `generateContent` REST endpoint. Retry,
 * circuit-breaker, and HTTP-status classification are reimplemented locally
 * (`./circuit-breaker`, `./retry`) rather than imported from
 * `@yvi/youtube-client` — the plan flags this as a deliberate
 * dependency-direction choice: `ai-client` and `youtube-client` are peer
 * packages, neither should depend on the other just to share a retry loop.
 */
export class GeminiProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly breaker: CircuitBreaker;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.breaker = new CircuitBreaker({
      failureThreshold: options.circuitBreakerFailureThreshold ?? 5,
      cooldownMs: options.circuitBreakerCooldownMs ?? 60_000,
      now: options.now,
    });
  }

  /**
   * One logical Gemini call: checks the circuit breaker, retries network
   * errors/5xx/429 with backoff + jitter, and classifies terminal failures
   * without retrying them — same orchestration shape as
   * `youtube-client`'s `requestJson`, adapted for Gemini's POST-with-body
   * request and its own status/error-body conventions.
   */
  private async generateContent(prompt: string): Promise<string> {
    const url = new URL(`${API_BASE}/${this.model}:generateContent`);
    url.searchParams.set("key", this.apiKey);
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    for (let attempt = 1; ; attempt++) {
      try {
        this.breaker.assertCallAllowed();
      } catch {
        throw new GeminiApiError("Gemini circuit breaker open", "circuit_open");
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
      } catch (networkError) {
        this.breaker.recordFailure();
        if (attempt > this.maxRetries) {
          const message = networkError instanceof Error ? networkError.message : String(networkError);
          throw new GeminiApiError(`network error calling Gemini API: ${message}`, "network_error");
        }
        await this.sleep(backoffWithJitter(attempt));
        continue;
      }

      if (response.ok) {
        this.breaker.recordSuccess();
        const data = (await response.json()) as GenerateContentResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new GeminiApiError("Gemini response had no candidate text", "invalid_response");
        }
        return text;
      }

      if (response.status >= 500) {
        this.breaker.recordFailure();
        if (attempt > this.maxRetries) {
          throw new GeminiApiError(`Gemini API server error (${response.status})`, "server_error", response.status);
        }
        await this.sleep(backoffWithJitter(attempt));
        continue;
      }

      const errorBody = await safeReadJson(response);
      this.breaker.recordFailure();

      if (response.status === 429) {
        if (attempt > this.maxRetries) {
          throw new GeminiApiError("Gemini API rate limited (429)", "rate_limited", 429);
        }
        await this.sleep(backoffWithJitter(attempt));
        continue;
      }
      if (response.status === 400 || response.status === 403) {
        const message = typeof errorBody === "object" && errorBody !== null ? JSON.stringify(errorBody) : String(response.status);
        throw new GeminiApiError(`Gemini API rejected the request (${response.status}): ${message}`, "invalid_request", response.status);
      }
      throw new GeminiApiError(`unexpected Gemini API status ${response.status}`, "unknown", response.status);
    }
  }

  /**
   * Calls `generateContent`, parses the returned text as JSON, and
   * validates it against `schema`. On a parse or schema-validation
   * failure, makes exactly one "repair" call — re-prompting with the
   * invalid output and the validation error, asking the model to return a
   * corrected JSON object — before giving up (PRD §19.4: schema-only
   * parsing, never trust free-form output). Bounded to one repair attempt
   * so a persistently malformed response fails fast rather than looping.
   */
  private async generateValidatedJson<T extends z.ZodTypeAny>(prompt: string, schema: T): Promise<z.infer<T>> {
    let currentPrompt = prompt;
    let lastError: string = "unknown error";

    for (let repairAttempt = 0; repairAttempt <= 1; repairAttempt++) {
      const text = await this.generateContent(currentPrompt);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        lastError = `response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        currentPrompt = `${prompt}\n\nYour previous response was:\n${text}\n\nThat response failed because: ${lastError}\n\nRespond again with ONLY the corrected JSON object, matching the schema above exactly.`;
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      lastError = result.error.message;
      currentPrompt = `${prompt}\n\nYour previous response was:\n${text}\n\nThat response failed schema validation: ${lastError}\n\nRespond again with ONLY the corrected JSON object, matching the schema above exactly.`;
    }

    throw new GeminiApiError(`Gemini response failed schema validation after a repair attempt: ${lastError}`, "invalid_response");
  }

  async classifyVideo(input: ClassifyVideoInput): Promise<ClassificationResult> {
    const prompt = buildClassifyPrompt(input);
    return this.generateValidatedJson(prompt, ClassificationResultSchema);
  }

  async normalizeTopics(input: NormalizeTopicsInput): Promise<NormalizeTopicsOutput> {
    const candidates = input.candidates.slice(0, MAX_CANDIDATES_PER_NORMALIZATION_RUN);
    if (candidates.length === 0) {
      return { proposals: [] };
    }
    const prompt = buildNormalizeTopicsPrompt(candidates);
    return this.generateValidatedJson(prompt, NormalizeTopicsResultSchema);
  }
}
