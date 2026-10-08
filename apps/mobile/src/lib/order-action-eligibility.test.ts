import { expect, test } from "bun:test"
import { canRecordOrderPayment } from "./order-action-eligibility"
test("closed orders never offer payment even with an old positive balance", () => {
  expect(
    canRecordOrderPayment({ status: "CANCELLED", balanceDueMinor: 500 }),
  ).toBe(false)
  expect(
    canRecordOrderPayment({ status: "REFUNDED", balanceDueMinor: 500 }),
  ).toBe(false)
  expect(
    canRecordOrderPayment({ status: "CONFIRMED", balanceDueMinor: 500 }),
  ).toBe(true)
  expect(
    canRecordOrderPayment({ status: "COMPLETED", balanceDueMinor: 0 }),
  ).toBe(false)
})
