import { expect, test } from "bun:test"
import { prepareInventoryCloseoutFinanceInTransaction as prepare } from "./inventory-closeout-posting-source"
import {
  closeoutInput,
  closeoutValuationFixture,
  effectiveAt,
} from "./inventory-closeout-test-fixture"
import { recordInventoryCloseoutFinanceInTransaction as record } from "./posting"

function fixture(options: Parameters<typeof closeoutValuationFixture>[0] = {}) {
  const f = closeoutValuationFixture(options)
  const accounts = [
    {
      id: "expense",
      code: "6000",
      kind: "EXPENSE",
      purpose: "OPERATING_EXPENSE",
    },
    { id: "inventory", code: "1300", kind: "ASSET", purpose: "INVENTORY" },
  ]
  let accountReads = 0
  Object.assign(f.tx, {
    financeAccount: {
      findMany: async () => {
        accountReads++
        return accounts
      },
    },
  })
  return { ...f, accounts, accountReads: () => accountReads }
}

test("approved shortage uses original exact cost, owning date and expense/inventory accounts", async () => {
  const f = fixture({ packaged: true })
  const prepared = await prepare(f.tx, {
    ...closeoutInput,
    expectedBookId: "book",
  })
  expect(prepared?.inputs).toHaveLength(1)
  expect(prepared?.inputs[0]).toMatchObject({
    tenantId: "tenant",
    actorUserId: "finalizer",
    bookId: "book",
    storeId: "store",
    effectiveAt,
    sourceKind: "INVENTORY_CLOSEOUT_SHORTAGE",
    sourceId: "movement",
    lines: [
      { accountId: "expense", side: "DEBIT", amountMinor: "25" },
      { accountId: "inventory", side: "CREDIT", amountMinor: "25" },
    ],
  })
  expect(f.pool()?.valueMinor).toBe(BigInt(76))
  expect(f.accountReads()).toBe(1)
})

test("gain, unknown cost, known zero cost, zero variance and absent Book never request posting accounts", async () => {
  const probes = [
    fixture({ gain: true }),
    fixture({ noPool: true }),
    fixture(),
    fixture({ zero: true }),
    fixture({ noBook: true }),
  ]
  const knownZero = probes[2]
  if (!knownZero) throw new Error("Missing zero-cost fixture")
  knownZero.initialPool.valueMinor = BigInt(0)
  for (const f of probes) {
    const result = await prepare(f.tx, closeoutInput)
    expect(result?.inputs ?? []).toEqual([])
    expect(f.accountReads()).toBe(0)
  }
})

test("required shortage account must be active and have the approved classification", async () => {
  for (const invalid of ["missing", "wrong-purpose", "wrong-kind"]) {
    const f = fixture()
    const expense = f.accounts[0]
    if (!expense) throw new Error("Missing expense account")
    if (invalid === "missing") f.accounts.shift()
    if (invalid === "wrong-purpose") expense.purpose = "OTHER"
    if (invalid === "wrong-kind") expense.kind = "ASSET"
    await expect(prepare(f.tx, closeoutInput)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  }
})

test("closeout composer posts one balanced original-cost journal and saved replay adds no cost or journal", async () => {
  const f = fixture()
  const entries: Array<Record<string, unknown>> = []
  const commands: Array<Record<string, unknown>> = []
  const lines: Array<Record<string, unknown>> = []
  Object.assign(f.tx, {
    store: { findFirst: async () => ({ id: "store" }) },
    financeAccount: {
      findMany: async () => f.accounts,
      count: async () => 2,
    },
    financeBook: {
      findUnique: async () => f.book,
      update: async () => ({ ...f.book, lastSequence: BigInt(1) }),
    },
    financeJournalEntry: {
      findUnique: async () => entries[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const entry = { id: "journal", ...data }
        entries.push(entry)
        return entry
      },
    },
    financeJournalLine: {
      createMany: async ({
        data,
      }: { data: Array<Record<string, unknown>> }) => {
        lines.push(...data)
        return { count: data.length }
      },
    },
    financeCommand: {
      findUnique: async () => commands[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        commands.push(data)
        return data
      },
    },
  })
  await record(f.tx, closeoutInput)
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({
    sourceKind: "INVENTORY_CLOSEOUT_SHORTAGE",
    sourceId: "movement",
    effectiveAt,
  })
  expect(lines).toMatchObject([
    { accountId: "expense", debitMinor: BigInt(25), creditMinor: BigInt(0) },
    { accountId: "inventory", debitMinor: BigInt(0), creditMinor: BigInt(25) },
  ])
  f.book.closedThrough = effectiveAt
  f.balance.revision = 99
  await record(f.tx, closeoutInput)
  expect(entries).toHaveLength(1)
  expect(commands).toHaveLength(1)
  expect(lines).toHaveLength(2)
  expect(f.writes()).toBe(2)
})
