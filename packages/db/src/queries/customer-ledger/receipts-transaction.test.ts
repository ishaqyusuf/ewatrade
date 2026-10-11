import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { financePayloadHash } from "../finance/rules"
import {
  recordCustomerLedgerReceipt,
  recordCustomerLedgerReceiptInTransaction,
  type RecordCustomerLedgerReceiptInput,
} from "./receipts"
const input: RecordCustomerLedgerReceiptInput = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "account",
  moneyAccountId: "cash",
  clientCommandId: "command",
  amountMinor: "1000",
  method: "CASH",
  description: "Deposit received",
}
function fixture(active = true, mismatched = false, replay = true) {
  const reads: string[] = []
  const { tenantId: _tenant, actorUserId: _actor, ...payload } = input
  const tx = {
    $transaction: () => {
      throw Error("Nested transaction")
    },
    $queryRaw: async () => [{ id: "book" }],
    membership: {
      findFirst: async () => {
        reads.push("authority")
        return active ? { tenant: { isActive: true } } : null
      },
    },
    financeBook: {
      findUniqueOrThrow: async () => ({ id: "book", currencyCode: "NGN" }),
    },
    customerLedgerAccount: {
      findUniqueOrThrow: async () => ({
        id: "account",
        currencyCode: "NGN",
        revision: 4n,
      }),
    },
    customerLedgerCommand: {
      findUnique: async () => {
        reads.push("replay")
        if (!replay) return null
        return {
          accountId: "account",
          kind: "RECEIPT",
          payloadHash: mismatched ? "different" : financePayloadHash(payload),
          result: { id: "receipt" },
        }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, reads }
}
test("caller-owned receipt replays with current authority without nesting or writes", async () => {
  const f = fixture()
  expect(await recordCustomerLedgerReceiptInTransaction(f.tx, input)).toEqual({
    id: "receipt",
  })
  expect(f.reads).toEqual(["authority", "authority", "replay"])
  await expect(
    recordCustomerLedgerReceiptInTransaction(fixture(true, true).tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
test("root receipt retains bounded transaction and revoked membership cannot replay", async () => {
  const f = fixture()
  let count = 0
  const db = {
    $transaction: async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: unknown,
    ) => {
      count++
      expect(options).toEqual({ maxWait: 10000, timeout: 30000 })
      return work(f.tx)
    },
  } as unknown as PrismaClient
  expect(await recordCustomerLedgerReceipt(db, input)).toEqual({
    id: "receipt",
  })
  expect(count).toBe(1)
  const denied = fixture(false)
  await expect(
    recordCustomerLedgerReceiptInTransaction(denied.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(denied.reads).toEqual(["authority"])
})

test("caller-owned new receipt refuses a stale reviewed account revision before effects", async () => {
  const f = fixture(true, false, false)
  await expect(
    recordCustomerLedgerReceiptInTransaction(f.tx, {
      ...input,
      expectedRevision: "3",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.reads).toEqual(["authority", "authority", "replay"])
})
