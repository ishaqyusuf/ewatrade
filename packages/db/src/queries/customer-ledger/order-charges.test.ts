import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  lockPostedCustomerOrderCharge,
  readPostedCustomerOrderCharge,
} from "./order-charges"
const input = {
  book: { id: "book", tenantId: "tenant", currencyCode: "NGN" },
  account: { id: "account", customerId: "customer", currencyCode: "NGN" },
  charge: {
    kind: "ORDER_CHARGE",
    side: "DEBIT",
    accountId: "account",
    tenantId: "tenant",
    sourceKind: "COMMERCIAL_ORDER_BILLED",
    sourceId: "order",
    orderId: "order",
    amountMinor: 1000n,
  },
} as Parameters<typeof readPostedCustomerOrderCharge>[1]
function fixture(totalMinor = 1000, billing = true) {
  const events: string[] = []
  const tx = {
    $queryRaw: async () => {
      events.push("lock")
      return []
    },
    commercialOrder: {
      findFirst: async (args: unknown) => {
        events.push("order")
        expect(args).toEqual({ where: { id: "order", tenantId: "tenant" } })
        return {
          id: "order",
          customerId: "customer",
          currencyCode: "NGN",
          totalMinor,
        }
      },
    },
    financeJournalEntry: {
      findUnique: async (args: unknown) => {
        expect(args).toEqual({
          where: {
            bookId_sourceKind_sourceId: {
              bookId: "book",
              sourceKind: "COMMERCIAL_ORDER_BILLED",
              sourceId: "order",
            },
          },
        })
        return billing ? { id: "journal" } : null
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, events }
}
test("preview reads the posted Order while execution locks before reading", async () => {
  const preview = fixture()
  await readPostedCustomerOrderCharge(preview.tx, input)
  expect(preview.events).toEqual(["order"])
  const execution = fixture()
  await lockPostedCustomerOrderCharge(execution.tx, input)
  expect(execution.events).toEqual(["lock", "order"])
})
test("both paths reject inconsistent totals, missing billing and foreign source before use", async () => {
  for (const read of [
    readPostedCustomerOrderCharge,
    lockPostedCustomerOrderCharge,
  ]) {
    await expect(read(fixture(999).tx, input)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    await expect(read(fixture(1000, false).tx, input)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    for (const change of [
      { tenantId: "other" },
      { sourceId: "other" },
      { accountId: "other" },
    ]) {
      const f = fixture()
      await expect(
        read(f.tx, { ...input, charge: { ...input.charge, ...change } }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(f.events).toEqual([])
    }
  }
})
