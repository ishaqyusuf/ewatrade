import { describe, expect, test } from "bun:test"
import { AssistantLimitError, AssistantStreamGuard } from "./stream-guard"

const options = { windowMs: 1_000, requestLimit: 3, concurrencyLimit: 1 }

function refusal(run: () => unknown) {
  try {
    run()
  } catch (error) {
    if (error instanceof AssistantLimitError) return error
    throw error
  }
  throw new Error("expected a refusal")
}

describe("AssistantStreamGuard", () => {
  test("refuses a second concurrent turn for the same user only", () => {
    const guard = new AssistantStreamGuard(options)
    const lease = guard.acquire("user-a", 0)
    expect(refusal(() => guard.acquire("user-a", 1)).status).toBe(409)
    expect(() => guard.acquire("user-b", 1).release()).not.toThrow()
    lease.release()
    expect(() => guard.acquire("user-a", 2).release()).not.toThrow()
  })

  test("refuses with 429 once the window's requests are used, then resets", () => {
    const guard = new AssistantStreamGuard(options)
    for (const at of [0, 1, 2]) guard.acquire("user-a", at).release()
    const error = refusal(() => guard.acquire("user-a", 3))
    expect(error.status).toBe(429)
    expect(error.code).toBe("RATE_LIMIT_EXCEEDED")
    expect(error.resetAt.getTime()).toBe(1_000)
    expect(guard.acquire("user-a", 1_000).remaining).toBe(2)
  })

  test("a lease held across a window reset still frees its slot", () => {
    const guard = new AssistantStreamGuard(options)
    const lease = guard.acquire("user-a", 0)
    expect(refusal(() => guard.acquire("user-a", 1_500)).code).toBe(
      "ASSISTANT_BUSY",
    )
    lease.release()
    lease.release()
    expect(() => guard.acquire("user-a", 1_600).release()).not.toThrow()
  })
})
