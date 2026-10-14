import { expect, test } from "bun:test"
import { withCustomerMessageDraftLease } from "./customer-message-draft-guard"
import { AssistantStreamGuard } from "./stream-guard"

test("busy composition refuses before quota/provider work and releases a failed lease", async () => {
  const guard = new AssistantStreamGuard({
    windowMs: 600_000,
    requestLimit: 100,
    concurrencyLimit: 1,
  })
  const held = guard.acquire("actor")
  let calls = 0
  await expect(
    withCustomerMessageDraftLease(
      "actor",
      async () => {
        calls++
      },
      guard,
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(calls).toBe(0)
  held.release()
  await expect(
    withCustomerMessageDraftLease(
      "actor",
      async () => {
        throw Error("provider failure")
      },
      guard,
    ),
  ).rejects.toThrow("provider failure")
  await expect(
    withCustomerMessageDraftLease("actor", async () => "retry works", guard),
  ).resolves.toBe("retry works")
})

test("rolling admission bounds repeated composition and keeps actors independent", async () => {
  const guard = new AssistantStreamGuard({
    windowMs: 600_000,
    requestLimit: 1,
    concurrencyLimit: 1,
  })
  await withCustomerMessageDraftLease("actor", async () => null, guard)
  let calls = 0
  await expect(
    withCustomerMessageDraftLease(
      "actor",
      async () => {
        calls++
      },
      guard,
    ),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
  expect(calls).toBe(0)
  await expect(
    withCustomerMessageDraftLease("other", async () => "allowed", guard),
  ).resolves.toBe("allowed")
})
