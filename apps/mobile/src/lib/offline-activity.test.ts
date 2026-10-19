import { expect, test } from "bun:test"
import {
  mobileActivityEvent,
  mobileActivityInputSchema,
} from "@ewatrade/events/mobile-activity"
import { reviewActivity, syncActivity } from "./offline-activity"

test("sync completion requires an exact complete ordinary/recovery acknowledgement", () => {
  for (const statuses of [["APPLIED"], ["approved"], ["APPLIED", "approved"]]) {
    const event = syncActivity({
      outcome: "applied",
      statuses,
      itemCount: statuses.length,
      durationMs: 125.5,
    })
    expect(event).toEqual({
      name: "mobile_sync_result",
      properties: {
        status: "completed",
        item_count: statuses.length,
        duration_ms: 125.5,
      },
    })
    expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
    expect(mobileActivityEvent(event)?.properties.success).toBe(true)
  }
})

test("recognized held, pending and terminal nonapplied responses are partial", () => {
  for (const status of [
    "held",
    "PENDING",
    "REVIEW_REQUIRED",
    "BLOCKED",
    "DISCARDED",
    "rejected",
  ]) {
    for (const statuses of [[status], ["APPLIED", status]]) {
      const event = syncActivity({
        outcome: "applied",
        statuses,
        itemCount: statuses.length,
        durationMs: 0,
      })
      expect(event?.properties.status).toBe("partial")
      expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
      expect(mobileActivityEvent(event)?.properties.success).toBe(false)
    }
  }
})

test("missing, malformed, sparse and unrecognized acknowledgements stay unknown", () => {
  for (const statuses of [
    [],
    ["APPLIED", "APPLIED"],
    [undefined],
    [null],
    ["applied"],
    ["FAILED"],
    ["private-order-id"],
    [{ status: "APPLIED", error: "private-error" }],
    new Array(1),
  ]) {
    const event = syncActivity({
      outcome: "applied",
      statuses,
      itemCount: 1,
      durationMs: 10,
    })
    expect(event?.properties.status).toBe("unknown")
    expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
    expect(JSON.stringify(event)).not.toContain("private")
  }
  expect(
    syncActivity({
      outcome: "applied",
      statuses: ["APPLIED", "private-error"],
      itemCount: 2,
      durationMs: 10,
    })?.properties.status,
  ).toBe("unknown")
  for (const statuses of [undefined, null, {}, "APPLIED"]) {
    const event = Reflect.apply(syncActivity, undefined, [
      { outcome: "applied", statuses, itemCount: 1, durationMs: 10 },
    ])
    expect(event.properties.status).toBe("unknown")
    expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
  }
})

test("failed requests never claim no effects even when responses look applied", () => {
  for (const statuses of [[], ["APPLIED"], ["approved"], [Error("private")]]) {
    const event = syncActivity({
      outcome: "failed",
      statuses,
      itemCount: 1,
      durationMs: 10,
    })
    expect(event?.properties.status).toBe("unknown")
    expect(JSON.stringify(event)).not.toContain("private")
    expect(mobileActivityEvent(event)?.properties.success).toBe(false)
  }
})

test("no work, unsafe counts and invalid durations do not emit", () => {
  for (const itemCount of [
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    2 ** 53,
  ])
    expect(
      syncActivity({
        outcome: "applied",
        statuses: [],
        itemCount,
        durationMs: 1,
      }),
    ).toBeNull()
  for (const durationMs of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])
    expect(
      syncActivity({
        outcome: "applied",
        statuses: ["APPLIED"],
        itemCount: 1,
        durationMs,
      }),
    ).toBeNull()
})

test("bounded measurements preserve coverage checks against the actual count", () => {
  for (const itemCount of [1000, 1001]) {
    const event = syncActivity({
      outcome: "applied",
      statuses: Array.from({ length: itemCount }, () => "APPLIED"),
      itemCount,
      durationMs: 3_600_001,
    })
    expect(event).toEqual({
      name: "mobile_sync_result",
      properties: {
        status: "completed",
        item_count: 1000,
        duration_ms: 3_600_000,
      },
    })
    expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
  }
  expect(
    syncActivity({
      outcome: "applied",
      statuses: Array(1000).fill("APPLIED"),
      itemCount: 1001,
      durationMs: 3_600_000,
    })?.properties.status,
  ).toBe("unknown")
})

test("review actions map only exact public statuses into fixed telemetry vocabulary", () => {
  for (const action of ["approve", "reject", "retry", "discard"] as const) {
    for (const [input, status] of [
      ["APPLIED", "applied"],
      ["approved", "applied"],
      ["REVIEW_REQUIRED", "review_required"],
      ["BLOCKED", "review_required"],
      ["held", "review_required"],
      ["PENDING", "pending"],
      ["DISCARDED", "discarded"],
      ["rejected", "discarded"],
    ] as const) {
      const event = reviewActivity(action, input)
      expect(event).toEqual({
        name: "mobile_offline_review_result",
        properties: { action, status },
      })
      expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
    }
  }
})

test("exceptional and private review results become unknown without inspecting or leaking them", () => {
  const hostile = Object.defineProperty({}, "status", {
    get: () => {
      throw Error("private getter")
    },
  })
  for (const result of [
    undefined,
    null,
    "FAILED",
    "private-error",
    Error("private detail"),
    { status: "approved", commandId: "private-id" },
    hostile,
  ]) {
    const event = reviewActivity("approve", result)
    expect(event).toEqual({
      name: "mobile_offline_review_result",
      properties: { action: "approve", status: "unknown" },
    })
    expect(mobileActivityInputSchema.safeParse(event).success).toBe(true)
    expect(JSON.stringify(event)).not.toContain("private")
  }
})
