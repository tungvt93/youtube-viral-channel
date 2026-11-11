import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./rate-limit.decorator";

interface RequestWithOptionalUser {
  user?: { id: string };
}

/**
 * Hand-rolled in-memory per-process rate limiter (PRD §16.8) applied to
 * `POST /videos/export` and `POST /discovery/queries/:id/run` — no new
 * dependency added (`@nestjs/throttler` is not installed anywhere in the
 * monorepo). Resets on process restart and does not coordinate across
 * instances; accepted because `apps/api` runs as a single process in this
 * repo (no `docker-compose.yml`/replica config) — see plan Risks.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithOptionalUser>();
    const key = `${context.getClass().name}.${context.getHandler().name}:${request.user?.id ?? "anonymous"}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;
    const recentHits = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recentHits.length >= options.limit) {
      throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    }

    recentHits.push(now);
    this.hits.set(key, recentHits);
    return true;
  }
}
