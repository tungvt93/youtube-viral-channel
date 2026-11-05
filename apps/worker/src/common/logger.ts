import pino from "pino";

// Fields follow PRD §22.1: job_id, queue, duration_ms, status, error_code,
// quota_estimate — attached per-job via child loggers once processors land
// (Phase 1+). request_id/endpoint are API-only and not applicable here.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "apiKey",
      "password",
      "authorization",
      "youtubeApiKey",
      "YOUTUBE_API_KEY",
      "*.apiKey",
      "*.password",
      "*.authorization",
      "*.youtubeApiKey",
      "*.YOUTUBE_API_KEY",
    ],
    censor: "[REDACTED]",
  },
});
