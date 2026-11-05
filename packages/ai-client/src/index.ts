export function packageMarker(): string {
  return "@yvi/ai-client";
}

export type {
  AIProvider,
  ClassificationResult,
  ClassifyVideoInput,
  NormalizeTopicsInput,
  NormalizeTopicsOutput,
  TopicNormalizationCandidate,
  TopicNormalizationProposal,
} from "./types";

export { ClassificationResultSchema, NormalizeTopicsResultSchema, TopicNormalizationProposalSchema } from "./schema";

export { buildClassifyPrompt, buildNormalizeTopicsPrompt } from "./prompt";

export { DEFAULT_GEMINI_MODEL, GeminiProvider, MAX_CANDIDATES_PER_NORMALIZATION_RUN } from "./gemini-provider";
export type { GeminiProviderOptions } from "./gemini-provider";

export { GeminiApiError } from "./errors";
export type { GeminiErrorCode } from "./errors";

export { CircuitBreaker } from "./circuit-breaker";
export { backoffWithJitter } from "./retry";
