import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { financePayloadHash } from "../finance/rules"
import { refundCustomerLedgerCredit, refundCustomerLedgerCreditInTransaction, type RefundCustomerLedgerCreditInput } from "./refunds"
const input: RefundCustomerLedgerCreditInput = {
  tenantId: "tenant", actorUserId: "actor", bookId: "book", accountId: "account",
  clientCommandId: "command", expectedRevision: "3", creditEntryId: "credit",
  amountMinor: "100", moneyAccountId: "money", method: "CASH", reason: "Customer collected balance",
  effectiveAt: new Date("2026-10-11T10:00:00Z"),
}
function fixture(active = true) {
  let nested = 0
  const reads: string[] = []
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const tx = {
    $transaction: () => { nested++; throw Error("Nested transaction") },
    $queryRaw: async () => [{ id: "book" }],
    membership: { findFirst: async () => { reads.push("authority"); return active ? { tenant: { isActive: true } } : null } },
    financeBook: { findUniqueOrThrow: async () => ({ id: "book", currencyCode: "NGN" }) },
    customerLedgerAccount: { findUniqueOrThrow: async () => ({ id: "account", currencyCode: "NGN", revision: 999n }) },
    customerLedgerCommand: { findUnique: async () => { reads.push("replay"); return { accountId: "account", kind: "REFUND_HELD_CREDIT", payloadHash: financePayloadHash({ ...payload, reason: input.reason, reference: null }), result: { id: "saved-refund" } } } },
  } as unknown as Prisma.TransactionClient
  return { tx, reads, nested: () => nested }
}
test("caller-owned refund replays with current authority without nesting or repeating writes", async () => {
  const f = fixture()
  expect(await refundCustomerLedgerCreditInTransaction(f.tx, input)).toEqual({ id: "saved-refund" })
  expect(f.nested()).toBe(0)
  expect(f.reads).toEqual(["authority", "authority", "replay"])
})
test("root refund opens one bounded transaction and revoked authority cannot replay", async () => {
  const f = fixture()
  let transactions = 0
  const db = { $transaction: async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
    transactions++
    expect(options).toEqual({ maxWait: 10000, timeout: 30000 })
    return work(f.tx)
  } } as unknown as PrismaClient
  expect(await refundCustomerLedgerCredit(db, input)).toEqual({ id: "saved-refund" })
  expect(transactions).toBe(1)
  const revoked = fixture(false)
  await expect(refundCustomerLedgerCreditInTransaction(revoked.tx, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(revoked.reads).toEqual(["authority"])
})
