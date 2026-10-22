/**
 * Circuit breaker. After `threshold` consecutive failures the breaker opens and
 * rejects instantly for `cooldownMs`, so a struggling dependency (the database)
 * is not hammered while it recovers. After the cooldown one trial call is allowed.
 */
export class Breaker {
  private fails = 0;
  private openedAt = 0;
  private trial = false;

  constructor(
    public readonly name: string,
    private readonly threshold = 5,
    private readonly cooldownMs = 20_000,
  ) {}

  get isOpen(): boolean {
    return this.fails >= this.threshold && Date.now() - this.openedAt < this.cooldownMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.fails >= this.threshold) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.cooldownMs) throw new Error(`breaker ${this.name} open`);
      if (this.trial) throw new Error(`breaker ${this.name} half open`);
      this.trial = true;
    }
    try {
      const r = await fn();
      this.fails = 0;
      this.trial = false;
      return r;
    } catch (e) {
      this.fails++;
      this.trial = false;
      if (this.fails >= this.threshold) this.openedAt = Date.now();
      throw e;
    }
  }

  state() {
    return {
      name: this.name,
      open: this.isOpen,
      consecutiveFailures: this.fails,
      retryInMs: this.isOpen ? Math.max(0, this.cooldownMs - (Date.now() - this.openedAt)) : 0,
    };
  }

  reset() {
    this.fails = 0;
    this.trial = false;
    this.openedAt = 0;
  }
}

export const dbBreaker = new Breaker("db", 5, 20_000);
