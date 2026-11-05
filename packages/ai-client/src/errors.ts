export type GeminiErrorCode =
  | "network_error"
  | "rate_limited"
  | "invalid_request"
  | "server_error"
  | "circuit_open"
  | "invalid_response"
  | "unknown";

/**
 * Normalized error for every failure mode the retry/breaker layer or
 * response-validation layer can produce, so callers (worker processors) can
 * branch on `code` without re-parsing HTTP status codes or Gemini's response
 * shape — same role as `youtube-client`'s `YouTubeApiError`.
 */
export class GeminiApiError extends Error {
  readonly code: GeminiErrorCode;
  readonly status?: number;

  constructor(message: string, code: GeminiErrorCode, status?: number) {
    super(message);
    this.name = "GeminiApiError";
    this.code = code;
    this.status = status;
  }
}
