import { expect, test } from "bun:test"
import { generalInstructions } from "./prompt"

// Home Ask bar, 5 Nov 2026: "Who owes me money?" answered ₦0 from customer
// ledgers while 26 orders were unpaid, and "What's running low?" asked for a
// threshold although products carry a saved low-stock level.
const prompt = generalInstructions({
  businessName: "Jawdah Poultry",
  storeName: "Main",
  currencyCode: "NGN",
  role: "OWNER",
  now: "Thu 5 Nov 2026, 14:30",
  timeZone: "Africa/Lagos",
})

test("who owes me is answered from unpaid orders, not ledger accounts alone", () => {
  expect(prompt).toContain(
    '"Who owes me money?", debtors and who to chase mean money still due on orders: use readOrders with owing:true',
  )
  expect(prompt).toContain("Never answer it from readReceivables alone")
  expect(prompt).toContain("the last 30 days, as Home's unpaid card does")
})

test("running low uses saved levels and never asks for a threshold first", () => {
  expect(prompt).toContain(
    "call readLowStock with no threshold: it uses each product's saved low-stock level",
  )
  expect(prompt).not.toContain("ask for an explicit threshold")
})
