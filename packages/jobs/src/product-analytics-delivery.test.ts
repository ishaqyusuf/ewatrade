import { expect, test } from "bun:test"
import {
  type AnalyticsDeliveryDependencies,
  dispatchProductAnalyticsEvent,
} from "./product-analytics-delivery"
function fixture() {
  const settled: unknown[] = []
  const sent: unknown[] = []
  const erased: unknown[] = []
  const row = {
    id: crypto.randomUUID(),
    leaseToken: "lease",
    attempts: 2,
    envelope: { eventId: "stable-id" },
    user: { email: "ordinary@example.com" },
    tenant: {
      dataClassification: "LIVE",
      qaPurgeStartedAt: null as Date | null,
    },
  }
  const dependencies: AnalyticsDeliveryDependencies = {
    claim: async () => row,
    deliver: async (envelope) => {
      sent.push(envelope)
    },
    erase: async (id, lease) => {
      erased.push([id, lease])
    },
    settle: async (input) => {
      settled.push(input)
    },
  }
  return { row, settled, sent, erased, dependencies }
}
test("a collector outage releases the lease for retry with the original envelope", async () => {
  const f = fixture()
  f.dependencies.deliver = async () => {
    throw new Error("collector down")
  }
  await expect(
    dispatchProductAnalyticsEvent(f.row.id, true, f.dependencies),
  ).rejects.toThrow("collector down")
  expect(f.settled).toEqual([
    { id: f.row.id, leaseToken: "lease", delivered: false, attempts: 2 },
  ])
  f.dependencies.deliver = async (envelope) => {
    f.sent.push(envelope)
  }
  await dispatchProductAnalyticsEvent(f.row.id, true, f.dependencies)
  expect(f.sent).toEqual([f.row.envelope])
  expect(f.settled.at(-1)).toMatchObject({ delivered: true })
})
test("fresh QA reclassification/purge prevents dispatch and erases the owned envelope", async () => {
  for (const state of ["QA", "PURGING"]) {
    const f = fixture()
    if (state === "QA") f.row.tenant.dataClassification = "QA"
    else f.row.tenant.qaPurgeStartedAt = new Date()
    await dispatchProductAnalyticsEvent(f.row.id, true, f.dependencies)
    expect(f.sent).toHaveLength(0)
    expect(f.erased).toEqual([[f.row.id, "lease"]])
  }
})
test("disabled analytics and another worker's claim cannot send or settle events", async () => {
  const f = fixture()
  let claims = 0
  f.dependencies.claim = async () => {
    claims++
    return null
  }
  await dispatchProductAnalyticsEvent(f.row.id, false, f.dependencies)
  expect(claims).toBe(0)
  await dispatchProductAnalyticsEvent(f.row.id, true, f.dependencies)
  expect(claims).toBe(1)
  expect(f.sent).toHaveLength(0)
  expect(f.settled).toHaveLength(0)
})
