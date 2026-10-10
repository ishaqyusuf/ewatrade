import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { lockStockTransferReview } from "./inventory-transfer-review-locks"
function fixture(
  options: { transferMissing?: boolean; balanceMissing?: boolean } = {},
) {
  const events: string[] = [],
    queries: Array<{ sql: string; values: unknown[] }> = []
  const tx = {
    store: {
      findMany: async () => [
        { id: "a", currencyCode: "NGN" },
        { id: "b", currencyCode: "NGN" },
      ],
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(" ")
      queries.push({ sql, values })
      if (sql.includes('"FinanceBook"')) {
        events.push("book")
        return [{ id: "book" }]
      }
      if (sql.includes('"StockTransfer"')) {
        events.push("transfer")
        return options.transferMissing ? [] : [{ id: "transfer" }]
      }
      events.push("balances")
      return options.balanceMissing
        ? [{ id: "source" }]
        : [{ id: "source" }, { id: "transit" }, { id: "destination" }]
    },
  } as unknown as Prisma.TransactionClient
  return { tx, events, queries }
}
const input = {
  tenantId: "tenant",
  sourceStoreId: "a",
  targetStoreId: "b",
  transferId: "transfer",
  balanceSourceIds: ["transit", "source", "destination", "source"],
}
test("confirmation coordinates Book, transfer and sorted balances with tenant and Store scope", async () => {
  const f = fixture()
  await lockStockTransferReview(f.tx, input)
  expect(f.events).toEqual(["book", "transfer", "balances"])
  expect(f.queries[1]?.values).toEqual(["transfer", "tenant", "a", "b"])
  expect(f.queries[2]?.sql).toContain('ORDER BY "id" FOR UPDATE')
  expect(f.queries[2]?.values).toEqual([
    expect.objectContaining({ values: ["destination", "source", "transit"] }),
    "tenant",
    expect.objectContaining({ values: ["a", "b"] }),
  ])
})
test("missing transfer or balance prevents confirmation and invalid scope takes no locks", async () => {
  const missing = fixture({ transferMissing: true })
  await expect(lockStockTransferReview(missing.tx, input)).rejects.toThrow(
    "Transfer changed",
  )
  expect(missing.events).toEqual(["book", "transfer"])
  const balance = fixture({ balanceMissing: true })
  await expect(lockStockTransferReview(balance.tx, input)).rejects.toThrow(
    "balances changed",
  )
  const invalid = fixture()
  await expect(
    lockStockTransferReview(invalid.tx, { ...input, balanceSourceIds: [] }),
  ).rejects.toThrow("scope")
  expect(invalid.events).toEqual([])
})
