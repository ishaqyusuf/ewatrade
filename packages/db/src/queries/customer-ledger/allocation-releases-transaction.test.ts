import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { financePayloadHash } from "../finance/rules"
import {
  releaseCustomerLedgerAllocation,
  releaseCustomerLedgerAllocationInTransaction,
  type ReleaseCustomerLedgerAllocationInput,
} from "./allocation-releases"
const input: ReleaseCustomerLedgerAllocationInput = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "account",
  allocationId: "allocation",
  reason: "Correct allocation",
  expectedRevision: "4",
  clientCommandId: "command",
  amountMinor: "1000",
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
          kind: "RELEASE_ALLOCATION",
          payloadHash: mismatched ? "different" : financePayloadHash(payload),
          result: { id: "allocation-releases" },
        }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, reads }
}
test("caller-owned allocation-releases replays with current authority without nesting or writes", async () => {
  const f = fixture()
  expect(
    await releaseCustomerLedgerAllocationInTransaction(f.tx, input),
  ).toEqual({
    id: "allocation-releases",
  })
  expect(f.reads).toEqual(["authority", "authority", "replay"])
  await expect(
    releaseCustomerLedgerAllocationInTransaction(fixture(true, true).tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
test("root allocation-releases retains bounded transaction and revoked membership cannot replay", async () => {
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
  expect(await releaseCustomerLedgerAllocation(db, input)).toEqual({
    id: "allocation-releases",
  })
  expect(count).toBe(1)
  const denied = fixture(false)
  await expect(
    releaseCustomerLedgerAllocationInTransaction(denied.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(denied.reads).toEqual(["authority"])
})

test("caller-owned new allocation-releases refuses a stale reviewed account revision before effects", async () => {
  const f = fixture(true, false, false)
  await expect(
    releaseCustomerLedgerAllocationInTransaction(f.tx, {
      ...input,
      expectedRevision: "3",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.reads).toEqual(["authority", "authority", "replay"])
})
