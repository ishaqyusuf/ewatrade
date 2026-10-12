import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  getFinanceCashCountReviewInTransaction,
  recordFinanceCashCount,
  recordFinanceCashCountInTransaction,
} from "./cash-counts"
import { financePayloadHash } from "./rules"
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "cash",
  asOf: new Date("2026-01-01T23:59:59.999Z"),
  observedBalanceMinor: "0",
  reference: "Closing count",
  clientCommandId: "command",
}
function fixture() {
  const state = {
    authorized: true,
    bookVisible: true,
    accountVisible: true,
    expected: 100n,
    sequence: 7n,
    accountName: "Front till",
    command: null as null | {
      kind: string
      payloadHash: string
      result: { id: string }
    },
    created: 0,
    nested: 0,
    aggregates: [] as unknown[],
    countData: null as unknown,
  }
  const tx = {
    $transaction: () => {
      state.nested++
      throw Error("Nested transaction")
    },
    $queryRaw: async (query: { strings?: string[] }) =>
      state.bookVisible ? [{ id: "book" }] : [],
    membership: {
      findFirst: async () =>
        state.authorized ? { tenant: { id: "tenant", isActive: true } } : null,
    },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: "book",
        startsAt: new Date("2025-01-01Z"),
        closedThrough: null,
        lastSequence: state.sequence,
        currencyCode: "NGN",
      }),
    },
    financeAccount: {
      findFirst: async () =>
        state.accountVisible
          ? { id: "cash", name: state.accountName, code: "1000", kind: "ASSET" }
          : null,
    },
    financeJournalLine: {
      aggregate: async (query: unknown) => {
        state.aggregates.push(query)
        return { _sum: { debitMinor: state.expected, creditMinor: 0n } }
      },
    },
    financeCommand: {
      findUnique: async () => state.command,
      create: async ({
        data,
      }: {
        data: { kind: string; payloadHash: string; result: { id: string } }
      }) => {
        state.command = data
        return data
      },
    },
    financeReconciliation: {
      create: async ({ data }: { data: unknown }) => {
        state.created++
        state.countData = data
        return { id: "original-count" }
      },
    },
  }
  return { state, tx: tx as unknown as Prisma.TransactionClient }
}
test("review and canonical command share exact original basis without journal or nested transaction", async () => {
  const { tx, state } = fixture()
  const review = await getFinanceCashCountReviewInTransaction(tx, input)
  expect(review.differenceMinor).toBe("-100")
  expect(review.journalEffect).toBe("NONE")
  expect(review.asOf).toBe(input.asOf.toISOString())
  expect(state.aggregates[0]).toMatchObject({
    where: {
      bookId: "book",
      accountId: "cash",
      entry: { sequence: { lte: 7n }, effectiveAt: { lte: input.asOf } },
    },
  })
  expect(await recordFinanceCashCountInTransaction(tx, input)).toEqual({
    id: "original-count",
  })
  expect(state.countData).toMatchObject({
    snapshotSequence: 7n,
    expectedBalanceMinor: 100n,
    observedBalanceMinor: 0n,
    reference: "Closing count",
    actorUserId: "owner",
  })
  state.expected = 500n
  state.sequence = 9n
  expect(await recordFinanceCashCountInTransaction(tx, input)).toEqual({
    id: "original-count",
  })
  expect(state.created).toBe(1)
  expect(state.nested).toBe(0)
  expect(state.command?.payloadHash).toBe(
    financePayloadHash({
      accountId: "cash",
      asOf: input.asOf,
      observedBalanceMinor: 0n,
      reference: "Closing count",
    }),
  )
  await expect(
    recordFinanceCashCountInTransaction(tx, {
      ...input,
      observedBalanceMinor: "1",
    }),
  ).rejects.toThrow("different details")
})
test("review rejects revoked, foreign Book, unavailable account and invalid time", async () => {
  const { tx, state } = fixture()
  state.authorized = false
  await expect(
    getFinanceCashCountReviewInTransaction(tx, input),
  ).rejects.toThrow("Owners and Admins")
  state.authorized = true
  state.bookVisible = false
  await expect(
    getFinanceCashCountReviewInTransaction(tx, input),
  ).rejects.toThrow("book not found")
  state.bookVisible = true
  state.accountVisible = false
  await expect(
    getFinanceCashCountReviewInTransaction(tx, input),
  ).rejects.toThrow("active cash account")
  state.accountVisible = true
  for (const asOf of [
    new Date("2020-01-01Z"),
    new Date("2100-01-01Z"),
    new Date("bad"),
  ])
    await expect(
      getFinanceCashCountReviewInTransaction(tx, { ...input, asOf }),
    ).rejects.toThrow()
  expect(state.created).toBe(0)
})
test("fresh review changes on ledger watermark, posted basis and account rename", async () => {
  const { tx, state } = fixture()
  const original = await getFinanceCashCountReviewInTransaction(tx, input)
  state.sequence++
  expect(await getFinanceCashCountReviewInTransaction(tx, input)).not.toEqual(
    original,
  )
  state.sequence--
  state.expected++
  expect(await getFinanceCashCountReviewInTransaction(tx, input)).not.toEqual(
    original,
  )
  state.expected--
  state.accountName = "Renamed till"
  expect(await getFinanceCashCountReviewInTransaction(tx, input)).not.toEqual(
    original,
  )
})
test("native wrapper retains fresh bounded options", async () => {
  const { tx } = fixture()
  const options: unknown[] = []
  const db = {
    $transaction: async (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
      option: unknown,
    ) => {
      options.push(option)
      return fn(tx)
    },
  } as unknown as PrismaClient
  await recordFinanceCashCount(db, input)
  await recordFinanceCashCount(db, input)
  expect(options).toEqual([
    { maxWait: 10000, timeout: 30000 },
    { maxWait: 10000, timeout: 30000 },
  ])
  expect(options[0]).not.toBe(options[1])
})
