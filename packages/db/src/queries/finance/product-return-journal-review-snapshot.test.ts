import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { lockCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import { consumeProductReturnJournalReview, lockProductReturnJournalReview, rememberProductReturnJournalReview } from "./product-return-journal-review-snapshot"

const scope = { tenantId: "tenant", storeId: "store", orderId: "order", bookId: "book", sourceCostMinor: "40", clientReturnId: "return-command" }
const review = { revision: "review", grossEffectiveAt: new Date("2026-09-01"), inventoryAccountId: "inventory", costOfSalesAccountId: "cogs", grossAmount: 100n, priorReturnCost: 20n }
async function fixture() {
  const tx = {
    commercialOrder: { findFirst: async () => ({ id: "order", currencyCode: "NGN", customerId: null }) },
    $queryRaw: async () => [{ id: "book" }],
  } as unknown as Prisma.TransactionClient
  const held = await lockCommerceFinancialOrder(tx, scope)
  if (!held) throw new Error("Missing lock")
  const mint = (value: typeof review | null = review) => {
    const preview = {}
    rememberProductReturnJournalReview(preview, tx, scope, value)
    return lockProductReturnJournalReview(preview, tx, held, scope)!
  }
  return { tx, held, mint }
}

test("locked journal review preserves the reviewed prior-cost ceiling and is one-use", async () => {
  const { tx, mint } = await fixture()
  const token = mint()
  expect(consumeProductReturnJournalReview(token, tx, scope)).toEqual(review)
  expect(() => consumeProductReturnJournalReview(token, tx, scope)).toThrow()
  expect(consumeProductReturnJournalReview(mint(null), tx, scope)).toBeNull()
})

test("journal reuse rejects forged locks, tokens, changed costs and command scope", async () => {
  const { tx, mint } = await fixture()
  expect(() => lockProductReturnJournalReview({}, tx, {}, scope)).toThrow()
  expect(() => consumeProductReturnJournalReview({}, tx, scope)).toThrow()
  for (const key of ["tenantId", "storeId", "orderId", "bookId", "sourceCostMinor", "clientReturnId"] as const) {
    const token = mint()
    expect(() => consumeProductReturnJournalReview(token, tx, { ...scope, [key]: "changed" })).toThrow()
    expect(() => consumeProductReturnJournalReview(token, tx, scope)).toThrow()
  }
  const other = await fixture()
  const token = mint()
  expect(() => consumeProductReturnJournalReview(token, other.tx, scope)).toThrow()
  expect(() => consumeProductReturnJournalReview(token, tx, scope)).toThrow()
})
