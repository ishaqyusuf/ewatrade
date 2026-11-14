import { describe, expect, test } from "bun:test"
import {
  IDLE_STOP_MS,
  INBOX_CHECK_MS,
  THREAD_CHECK_MS,
  THREAD_QUIET_AFTER_MS,
  THREAD_QUIET_CHECK_MS,
  boundedCheckInterval,
  setLastUserInputAtForTest,
  threadCheckDelay,
} from "./bounded-refresh"

describe("bounded refresh", () => {
  test("checks the inbox once a minute while someone is using the page", () => {
    const now = 1_000_000_000
    setLastUserInputAtForTest(now - 60_000)
    expect(boundedCheckInterval(null, INBOX_CHECK_MS, now)).toBe(60_000)
  })

  test("stops after the idle limit", () => {
    const now = 1_000_000_000
    setLastUserInputAtForTest(now - IDLE_STOP_MS - 1)
    expect(boundedCheckInterval(null, INBOX_CHECK_MS, now)).toBe(false)
    expect(threadCheckDelay(now, now)).toBeNull()
  })

  test("never repeats a refused read", () => {
    const now = 1_000_000_000
    setLastUserInputAtForTest(now)
    const refused = { data: { httpStatus: 403, code: "FORBIDDEN" } }
    expect(boundedCheckInterval(refused, INBOX_CHECK_MS, now)).toBe(false)
  })

  test("an open conversation slows down after two quiet minutes", () => {
    const now = 1_000_000_000
    setLastUserInputAtForTest(now)
    expect(threadCheckDelay(now - 1_000, now)).toBe(THREAD_CHECK_MS)
    expect(threadCheckDelay(now - THREAD_QUIET_AFTER_MS - 1, now)).toBe(
      THREAD_QUIET_CHECK_MS,
    )
  })
})
