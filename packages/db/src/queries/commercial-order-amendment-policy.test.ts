import { expect, test } from "bun:test"
import {
  type OrderAmendmentEvidence,
  assessOrderAmendment,
} from "./commercial-order-amendment-policy"
const ordinary: OrderAmendmentEvidence = {
  status: "CONFIRMED",
  paymentStatus: "PENDING",
  amountPaidMinor: 0,
  storeActive: true,
  lineCount: 1,
  inspectedLineCount: 1,
  snapshotsComplete: true,
  paymentCount: 0,
  fulfillmentCount: 0,
  returnCount: 0,
  committedReservationCount: 0,
  ledgerEntryCount: 0,
  serviceAuthorizationCount: 0,
  trackedWorkCount: 0,
  quoteOwned: false,
  prescriptionOwned: false,
  bookingCount: 0,
  intakeOwned: false,
}
test("ordinary unpaid/unfulfilled orders retain immutable commercial snapshots", () => {
  const result = assessOrderAmendment(ordinary)
  expect(result.eligibleForOrdinaryAmendment).toBe(true)
  expect(result.blockers).toEqual([])
  expect(result.commercialTermsStrategy).toBe("linked_replacement")
  expect(result.preserveOriginalSnapshots).toBe(true)
  expect(result.cancellationStrategy).toBe("release_active_reservations")
})
test("refunded net zero and authorized but uncollected payments are not unpaid evidence", () => {
  for (const patch of [
    { paymentCount: 2 },
    { paymentStatus: "REFUNDED" },
    { paymentStatus: "AUTHORIZED" },
    { amountPaidMinor: 1 },
  ]) {
    expect(
      assessOrderAmendment({ ...ordinary, ...patch }).blockers.map(
        (x) => x.code,
      ),
    ).toContain("PAYMENT_HISTORY")
  }
})
test("status alone cannot hide stock commitment, fulfillment or return history", () => {
  for (const key of [
    "committedReservationCount",
    "fulfillmentCount",
    "returnCount",
  ] as const) {
    const result = assessOrderAmendment({ ...ordinary, [key]: 1 })
    expect(result.eligibleForOrdinaryAmendment).toBe(false)
    expect(result.blockers.map((x) => x.code)).toContain("FULFILLMENT_HISTORY")
  }
})
test("terminal and progressed states cannot be changed through ordinary amendment", () => {
  for (const status of [
    "FULFILLING",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
    "READY_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
    "UNKNOWN",
  ]) {
    expect(
      assessOrderAmendment({ ...ordinary, status })
        .eligibleForOrdinaryAmendment,
    ).toBe(false)
  }
})
test("all independent source owners remain visible in the impact policy", () => {
  const result = assessOrderAmendment({
    ...ordinary,
    ledgerEntryCount: 1,
    serviceAuthorizationCount: 1,
    quoteOwned: true,
    prescriptionOwned: true,
    bookingCount: 1,
  })
  expect(result.blockers.map((x) => x.requiredWorkflow)).toEqual([
    "customer_ledger",
    "service_work",
    "quote",
    "prescription",
    "booking",
  ])
  for (const patch of [{ trackedWorkCount: 1 }, { intakeOwned: true }])
    expect(
      assessOrderAmendment({ ...ordinary, ...patch }).blockers.map(
        (x) => x.code,
      ),
    ).toContain("SERVICE_SOURCE")
})
test("missing snapshots, truncated source reads and invalid counts fail closed", () => {
  for (const patch of [
    { snapshotsComplete: false },
    { inspectedLineCount: 0 },
    { lineCount: 0 },
    { lineCount: -1 },
    { paymentCount: Number.NaN },
    { returnCount: 0.5 },
    { amountPaidMinor: -1 },
  ]) {
    expect(
      assessOrderAmendment({ ...ordinary, ...patch }).blockers.map(
        (x) => x.code,
      ),
    ).toContain("INCOMPLETE_EVIDENCE")
  }
})
test("inactive Store blocks all ordinary amendment paths", () => {
  expect(
    assessOrderAmendment({ ...ordinary, storeActive: false }).blockers.map(
      (x) => x.code,
    ),
  ).toContain("STORE_UNAVAILABLE")
})
