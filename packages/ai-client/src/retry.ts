/**
 * Exponential backoff with full jitter: a random delay in [0, cap], where
 * cap grows exponentially per attempt. Reimplemented from
 * `@yvi/youtube-client`'s identical helper rather than imported, for the
 * same dependency-direction reason as `./circuit-breaker`.
 */
export function backoffWithJitter(attempt: number, baseMs = 200, maxMs = 5000): number {
  const cap = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.random() * cap;
}
