import { expect, test } from "bun:test"
import {
  availableSearchActions,
  matchParts,
  searchPayment,
} from "./search-display"
test("payment comes from the final status rather than customer names", () => {
  expect(
    searchPayment("Taken by Paid · Unpaid Services · partially paid"),
  ).toEqual({ label: "Part paid", tone: "warn" })
  expect(searchPayment("Taken by Paid · Unpaid Services · paid")?.label).toBe(
    "Paid",
  )
  expect(searchPayment("Taken by Paid · Customer · unknown")).toBeNull()
})
test("only order creation remains available offline", () => {
  const all = [
    { id: "create-order" },
    { id: "create-customer" },
    { id: "invite-staff" },
    { id: "payments-received" },
  ]
  expect(availableSearchActions(all, true)).toEqual([{ id: "create-order" }])
  expect(availableSearchActions(all, false)).toEqual(all)
})
test("highlighting is literal and preserves original text", () => {
  expect(matchParts("Aisha Bello", "BEL")).toEqual(["Aisha ", "Bel", "lo"])
  expect(matchParts("Rice [bag]", "[bag]")).toEqual(["Rice ", "[bag]", ""])
  expect(matchParts("Rice", "")).toEqual(["Rice", "", ""])
})
