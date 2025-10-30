/**
 * Rate limiter configuration for a specific engine
 */
export interface RateLimiterConfig {
  maxRequests: number; // Maximum number of requests allowed
  windowMs: number; // Time window in milliseconds
}

/**
 * Rate limiter state for tracking requests
 */
interface RateLimiterState {
  requests: number[];
  isRateLimited: boolean;
}

/**
 * Rate limiter class to track and enforce rate limits per engine
 */
export class RateLimiter {
  private readonly state: Map<string, RateLimiterState> = new Map();
  private readonly config: Map<string, RateLimiterConfig> = new Map();

  /**
   * Set rate limit configuration for an engine
   */
  setConfig(engine: string, config: RateLimiterConfig): void {
    this.config.set(engine, config);
    if (!this.state.has(engine)) {
      this.state.set(engine, {
        requests: [],
        isRateLimited: false,
      });
    }
  }

  /**
   * Check if an engine is rate limited
   */
  isRateLimited(engine: string): boolean {
    const state = this.state.get(engine);
    return state?.isRateLimited ?? false;
  }

  /**
   * Mark an engine as rate limited (e.g., received 429 response)
   */
  markRateLimited(engine: string, durationMs?: number): void {
    let state = this.state.get(engine);
    if (!state) {
      state = { requests: [], isRateLimited: false };
      this.state.set(engine, state);
    }

    state.isRateLimited = true;

    // Auto-recover after specified duration (default: 5 minutes)
    const recoveryTime = durationMs ?? 5 * 60 * 1000;
    setTimeout(() => {
      state!.isRateLimited = false;
      state!.requests = [];
    }, recoveryTime);
  }

  /**
   * Record a request for an engine
   * Returns true if request is allowed, false if rate limited
   */
  recordRequest(engine: string): boolean {
    const config = this.config.get(engine);
    if (!config) {
      // No rate limit configured for this engine
      return true;
    }

    let state = this.state.get(engine);
    if (!state) {
      state = { requests: [], isRateLimited: false };
      this.state.set(engine, state);
    }

    const now = Date.now();

    // Remove old requests outside the window
    state.requests = state.requests.filter((time) => now - time < config.windowMs);

    // Check if we've exceeded the limit
    if (state.requests.length >= config.maxRequests) {
      return false;
    }

    // Record this request
    state.requests.push(now);
    return true;
  }

  /**
   * Get current request count for an engine within the window
   */
  getRequestCount(engine: string): number {
    const config = this.config.get(engine);
    if (!config) return 0;

    let state = this.state.get(engine);
    if (!state) return 0;

    const now = Date.now();
    state.requests = state.requests.filter((time) => now - time < config.windowMs);
    return state.requests.length;
  }

  /**
   * Reset rate limiter state for an engine
   */
  reset(engine?: string): void {
    if (engine) {
      this.state.delete(engine);
    } else {
      this.state.clear();
    }
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();
