export interface CircuitBreakerOptions {
  /** Consecutive failures before the breaker opens. */
  failureThreshold: number;
  /** How long the breaker stays open before allowing a half-open trial call. */
  cooldownMs: number;
  now?: () => number;
}

type CircuitState = "closed" | "open" | "half_open";

/**
 * Minimal consecutive-failure circuit breaker (PRD §17.5). One instance is
 * shared across all calls made through a single YouTubeClient so repeated
 * failures of any endpoint trip it.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.cooldownMs = options.cooldownMs;
    this.now = options.now ?? Date.now;
  }

  /** Throws if the breaker is open and the cooldown has not elapsed yet. */
  assertCallAllowed(): void {
    if (this.state !== "open") {
      return;
    }
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half_open";
      return;
    }
    throw new Error("circuit breaker open");
  }

  recordSuccess(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.state === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
