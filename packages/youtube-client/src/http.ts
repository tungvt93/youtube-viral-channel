import { CircuitBreaker } from "./circuit-breaker";
import { YouTubeApiError } from "./errors";
import { backoffWithJitter } from "./retry";

/** Quota cost per call per PRD §6 cost notes, independent of batch size. */
export const QUOTA_COST = {
  search_list: 100,
  videos_list: 1,
  channels_list: 1,
  playlist_items_list: 1,
} as const;

export interface YouTubeErrorBody {
  error?: {
    code?: number;
    errors?: Array<{ reason?: string; domain?: string; message?: string }>;
  };
}

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"]);

function classify403(body: YouTubeErrorBody | undefined): "quota_exceeded" | "key_invalid" {
  const reason = body?.error?.errors?.[0]?.reason;
  if (reason && QUOTA_REASONS.has(reason)) {
    return "quota_exceeded";
  }
  return "key_invalid";
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export interface RequestJsonOptions {
  fetchImpl: typeof fetch;
  breaker: CircuitBreaker;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Performs one logical YouTube Data API call: checks the circuit breaker,
 * retries network timeouts and 5xx with backoff + jitter, and classifies
 * terminal failures (400/403/429) per PRD §17.4 without retrying them.
 */
export async function requestJson<T>(url: URL, options: RequestJsonOptions): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 1; ; attempt++) {
    options.breaker.assertCallAllowed();

    let response: Response;
    try {
      response = await options.fetchImpl(url);
    } catch (networkError) {
      options.breaker.recordFailure();
      if (attempt > maxRetries) {
        const message = networkError instanceof Error ? networkError.message : String(networkError);
        throw new YouTubeApiError(`network error calling YouTube API: ${message}`, "network_error");
      }
      await sleep(backoffWithJitter(attempt));
      continue;
    }

    if (response.ok) {
      options.breaker.recordSuccess();
      return (await response.json()) as T;
    }

    if (response.status >= 500) {
      options.breaker.recordFailure();
      if (attempt > maxRetries) {
        throw new YouTubeApiError(`YouTube API server error (${response.status})`, "server_error", response.status);
      }
      await sleep(backoffWithJitter(attempt));
      continue;
    }

    const body = (await safeReadJson(response)) as YouTubeErrorBody | undefined;
    options.breaker.recordFailure();

    if (response.status === 429) {
      throw new YouTubeApiError("YouTube API quota exceeded (429)", "quota_exceeded", 429);
    }
    if (response.status === 400) {
      throw new YouTubeApiError("YouTube API rejected the request (400)", "bad_request", 400);
    }
    if (response.status === 403) {
      const code = classify403(body);
      throw new YouTubeApiError(`YouTube API forbidden (403): ${code}`, code, 403);
    }
    throw new YouTubeApiError(`unexpected YouTube API status ${response.status}`, "unknown", response.status);
  }
}
