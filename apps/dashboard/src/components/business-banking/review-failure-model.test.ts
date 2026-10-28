import { describe, expect, test } from "bun:test"
import { reviewFailure } from "./review-failure-model"

describe("payment review refusals", () => {
  test("preserves a duplicate-transfer refusal and requires a reread", () => {
    const message =
      "This bank transfer was already confirmed on another payment."
    expect(reviewFailure({ code: "CONFLICT", message })).toEqual({
      message,
      refresh: true,
    })
  })

  test("keeps the actual allocation refusal instead of calling it a stale report", () => {
    const message = "Review the received amount and customer-funds allocation."
    expect(reviewFailure({ code: "CONFLICT", message })?.message).toBe(message)
  })

  test("does not equate ordinary payment access with Finance authority", () => {
    expect(
      reviewFailure({ code: "FORBIDDEN", message: "" })?.message,
    ).toContain("Finance access")
    expect(
      reviewFailure({
        code: "FORBIDDEN",
        message: "Only an owner or admin can confirm excess funds.",
      })?.refresh,
    ).toBe(false)
  })

  test("does not repeat links, credentials, control text or oversized errors", () => {
    for (const message of [
      "See https://example.test/private",
      "Bearer example-not-a-real-credential",
      "report token: example-not-a-real-token",
      "first line\ninternal detail",
      "x".repeat(301),
    ]) {
      const result = reviewFailure({ code: "CONFLICT", message })
      expect(result?.message).not.toBe(message)
      expect(result?.refresh).toBe(true)
    }
  })

  test("has no error before a request and a safe fallback for unknown failures", () => {
    expect(reviewFailure(null)).toBeNull()
    expect(reviewFailure({ code: null })?.message).toContain(
      "couldn’t be saved",
    )
  })
})
