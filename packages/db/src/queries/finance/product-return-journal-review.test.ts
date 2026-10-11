import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { reviewProductReturnJournal } from "./product-return-journal-review"
const effectiveAt = new Date("2026-09-01T00:00:00Z")
const accounts = [
  { id: "inventory", code: "1300", kind: "ASSET", purpose: "INVENTORY" },
  { id: "cogs", code: "5000", kind: "EXPENSE", purpose: "COST_OF_SALES" },
]
function fixture(options: { reversed?: boolean; missing?: boolean; corrupt?: boolean } = {}) {
  const db = {
    financeJournalEntry: {
      findUnique: async () => options.missing ? null : ({ id: "gross", storeId: "store", actorUserId: "actor", reversalOfId: null, effectiveAt,
        lines: [
          { account: accounts[1], debitMinor: options.corrupt ? 99n : 100n, creditMinor: 0n },
          { account: accounts[0], debitMinor: 0n, creditMinor: 100n },
        ],
      }),
      findFirst: async () => options.reversed ? { id: "reversal" } : null,
      findMany: async () => [],
    },
    productReturn: { findMany: async () => [] },
    financeAccount: { findMany: async () => accounts },
  }
  return db as unknown as Prisma.TransactionClient
}
const input = {
  tenantId: "tenant", bookId: "book", productReturnId: "", sourceCostMinor: 40n,
  order: { id: "order", storeId: "store", createdByUserId: "actor", completedAt: effectiveAt },
  resolveGross: async () => ({ input: { lines: [{ amountMinor: "100" }] } }) as unknown as Awaited<ReturnType<Parameters<typeof reviewProductReturnJournal>[1]["resolveGross"]>>,
}

test("read-only eligibility returns reserved account identities and original cost ceiling", async () => {
  expect(await reviewProductReturnJournal(fixture(), input)).toEqual({ grossEffectiveAt: effectiveAt, inventoryAccountId: "inventory", costOfSalesAccountId: "cogs", grossAmount: 100n, priorReturnCost: 0n })
})
test("missing gross and zero cost do not promise a journal", async () => {
  expect(await reviewProductReturnJournal(fixture({ missing: true }), input)).toBeNull()
  expect(await reviewProductReturnJournal(fixture(), { ...input, sourceCostMinor: 0n })).toBeNull()
})
test("reversed gross, inconsistent accounts and excess returned cost refuse", async () => {
  await expect(reviewProductReturnJournal(fixture({ reversed: true }), input)).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(reviewProductReturnJournal(fixture({ corrupt: true }), input)).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(reviewProductReturnJournal(fixture(), { ...input, sourceCostMinor: 101n })).rejects.toMatchObject({ code: "CONFLICT" })
})
