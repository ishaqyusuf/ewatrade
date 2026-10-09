/** Admission refusal for a model turn; the route maps it to 429 or 409. */
export class AssistantLimitError extends Error {
  constructor(
    readonly status: 409 | 429,
    readonly code: "ASSISTANT_BUSY" | "RATE_LIMIT_EXCEEDED",
    readonly resetAt: Date,
  ) {
    super(
      code === "RATE_LIMIT_EXCEEDED"
        ? "You're sending messages very quickly. Wait a few minutes and try again."
        : "The assistant is still answering your last message.",
    )
    this.name = "AssistantLimitError"
  }
}

export type AssistantStreamLease = {
  remaining: number
  resetAt: Date
  release: () => void
}

/**
 * Per-user rolling request window plus a concurrency cap (GND pattern). It is
 * process-local: the per-Tenant setup budget in the database stays the durable
 * limit, this only stops one user flooding a running instance.
 */
export class AssistantStreamGuard {
  private readonly buckets = new Map<
    string,
    { startedAt: number; requests: number; active: number }
  >()

  constructor(
    private readonly options = {
      windowMs: 10 * 60 * 1000,
      requestLimit: 100,
      concurrencyLimit: 2,
    },
  ) {}

  acquire(key: string, now = Date.now()): AssistantStreamLease {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { startedAt: now, requests: 0, active: 0 }
      this.buckets.set(key, bucket)
    } else if (now - bucket.startedAt >= this.options.windowMs) {
      // Reset in place: leases still streaming release into the same bucket.
      bucket.startedAt = now
      bucket.requests = 0
    }
    const resetAt = new Date(bucket.startedAt + this.options.windowMs)
    if (bucket.requests >= this.options.requestLimit)
      throw new AssistantLimitError(429, "RATE_LIMIT_EXCEEDED", resetAt)
    if (bucket.active >= this.options.concurrencyLimit)
      throw new AssistantLimitError(409, "ASSISTANT_BUSY", resetAt)
    bucket.requests += 1
    bucket.active += 1
    const held = bucket
    let released = false
    return {
      remaining: Math.max(this.options.requestLimit - held.requests, 0),
      resetAt,
      release: () => {
        if (released) return
        released = true
        held.active = Math.max(held.active - 1, 0)
      },
    }
  }
}
