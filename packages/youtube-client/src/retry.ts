/**
 * Exponential backoff with full jitter: a random delay in [0, cap], where
 * cap grows exponentially per attempt. Keeps retries from synchronizing
 * across concurrent callers.
 */
export function backoffWithJitter(attempt: number, baseMs = 200, maxMs = 5000): number {
  const cap = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.random() * cap;
}
