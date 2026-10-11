import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  recordFinanceMoneyMovement,
  recordFinanceMoneyMovementInTransaction,
  type FinanceMoneyInput,
} from "./money"
import { financePayloadHash } from "./rules"
const input: FinanceMoneyInput = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  clientCommandId: "command",
  accountId: "cash",
  destinationAccountId: "bank",
  kind: "TRANSFER",
  amountMinor: "100",
  description: "Cash deposited",
  effectiveAt: new Date("2026-10-01"),
}
function fixture(active = true, destination = "bank") {
  const events: string[] = []
  const hash = financePayloadHash({
    sourceKind: "TRANSFER",
    sourceId: "command",
    description: input.description,
    effectiveAt: input.effectiveAt,
    storeId: null,
    lines: [
      {
        accountId: "cash",
        debitMinor: 0n,
        creditMinor: 100n,
        description: null,
      },
      {
        accountId: "bank",
        debitMinor: 100n,
        creditMinor: 0n,
        description: null,
      },
    ],
  })
  const tx = {
    $transaction: () => {
      throw Error("Nested transaction")
    },
    $queryRaw: async () => [{ id: "book" }],
    membership: {
      findFirst: async () => {
        events.push("authority")
        return active ? { tenant: { isActive: true } } : null
      },
    },
    financeBook: { findUniqueOrThrow: async () => ({ id: "book" }) },
    financeAccount: {
      findFirst: async (args: { where: { id: string } }) => ({
        id: args.where.id === "cash" ? "cash" : destination,
      }),
    },
    financeCommand: {
      findUnique: async () => {
        events.push("replay")
        return {
          kind: "POST_JOURNAL",
          payloadHash: hash,
          result: { id: "journal" },
        }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, events }
}
test("money movement caller-owned replay checks authority without nested transactions or effects", async () => {
  const f = fixture()
  expect(await recordFinanceMoneyMovementInTransaction(f.tx, input)).toEqual({
    id: "journal",
  })
  expect(f.events).toEqual(["authority", "authority", "replay"])
  const denied = fixture(false)
  await expect(
    recordFinanceMoneyMovementInTransaction(denied.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(denied.events).toEqual(["authority"])
  await expect(
    recordFinanceMoneyMovementInTransaction(fixture().tx, {
      ...input,
      amountMinor: "101",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
test("money root retains bounded transaction and same-account refusal precedes posting", async () => {
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
  expect(await recordFinanceMoneyMovement(db, input)).toEqual({ id: "journal" })
  expect(count).toBe(1)
  const same = fixture(true, "cash")
  await expect(
    recordFinanceMoneyMovementInTransaction(same.tx, input),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  expect(same.events).toEqual(["authority"])
})
