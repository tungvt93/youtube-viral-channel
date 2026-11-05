import { randomUUID } from "node:crypto";
import type { Params } from "nestjs-pino";

// Fields follow PRD §22.1: request_id, endpoint, duration_ms, status.
// job_id/queue are worker-only and error_code/quota_estimate are populated
// by business logic landing in later phases, not this HTTP middleware layer.
export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "apiKey",
        "password",
        "*.apiKey",
        "*.password",
        "*.authorization",
      ],
      censor: "[REDACTED]",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    customAttributeKeys: {
      reqId: "request_id",
      responseTime: "duration_ms",
    },
    customProps: (req, res) => ({
      endpoint: req.url,
      status: res.statusCode,
    }),
  },
};
