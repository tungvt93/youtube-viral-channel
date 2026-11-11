import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  /** Max requests allowed within `windowMs`, per rate-limit key. */
  limit: number;
  windowMs: number;
}

/** Marks a route for `RateLimitGuard` (PRD §16.8: rate-limit export and manual-job-trigger endpoints). */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
