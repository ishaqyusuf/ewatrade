import { expect, test } from "bun:test"
import { planStockTransferTransition } from "./inventory-transfer-quantity"
const base = { dispatchedQuantity: "10.5", inTransitQuantity: "10.5", transactionScale: 2, transition: "receive" as const }
test("partial receipt leaves exact outstanding transit and final receipt closes it", () => {
  const first = planStockTransferTransition({ ...base, quantity: "3.25" })
  expect(first).toEqual({ quantity: "3.25", remainingBefore: "10.5", remainingAfter: "7.25", terminal: false, status: "IN_TRANSIT" })
  expect(planStockTransferTransition({ ...base, inTransitQuantity: first.remainingAfter })).toEqual({ quantity: "7.25", remainingBefore: "7.25", remainingAfter: "0", terminal: true, status: "RECEIVED" })
})
test("cancellation returns only remaining transit after earlier receipt", () => {
  expect(planStockTransferTransition({ ...base, inTransitQuantity: "7.25", transition: "cancel" })).toMatchObject({ quantity: "7.25", remainingAfter: "0", status: "CANCELLED" })
  expect(() => planStockTransferTransition({ ...base, quantity: "2", transition: "cancel" })).toThrow("all remaining")
})
test("receipt rejects exhausted transit, over-receipt and invalid precision", () => {
  for (const patch of [{ inTransitQuantity: "0" }, { inTransitQuantity: "11" }, { quantity: "11" }, { quantity: "-1" }, { quantity: "0" }, { quantity: "0.001" }])
    expect(() => planStockTransferTransition({ ...base, ...patch })).toThrow()
})
