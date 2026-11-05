export type YouTubeErrorCode =
  | "network_error"
  | "bad_request"
  | "quota_exceeded"
  | "key_invalid"
  | "server_error"
  | "circuit_open"
  | "unknown";

/**
 * Normalized error for every failure mode the retry/breaker layer can
 * produce, so callers (job processors) can branch on `code` without
 * re-parsing HTTP status codes or YouTube's error body shape.
 */
export class YouTubeApiError extends Error {
  readonly code: YouTubeErrorCode;
  readonly status?: number;

  constructor(message: string, code: YouTubeErrorCode, status?: number) {
    super(message);
    this.name = "YouTubeApiError";
    this.code = code;
    this.status = status;
  }
}
