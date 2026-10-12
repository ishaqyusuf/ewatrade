import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  ensureCustomerLedgerAccount,
  ensureCustomerLedgerAccountInTransaction,
} from "../customer-ledger/accounts"
import {
  recordCustomerLedgerOpening,
  recordCustomerLedgerOpeningInTransaction,
} from "../customer-ledger/opening"
import {
  createFinanceBook,
  createFinanceBookInTransaction,
  createFinanceMoneyAccount,
  createFinanceMoneyAccountInTransaction,
} from "../finance/accounts"
import { financePayloadHash } from "../finance/rules"
import {
  getFinanceSupplierPayableAging,
  getFinanceSupplierPayableAgingInTransaction,
} from "../finance/supplier-aging"
import { agingSource } from "../finance/supplier-aging-test-fixture"
import {
  getBusinessPostedProfitReport,
  getBusinessPostedProfitReportInTransaction,
  getBusinessSupplierAgingReport,
  getBusinessSupplierAgingReportInTransaction,
} from "./finance"

const actor = { tenantId: "tenant", actorUserId: "owner" }
const startsAt = new Date("2026-01-01T00:00:00Z")
const opening = {
  ...actor,
  bookId: "book",
  accountId: "account",
  clientCommandId: "opening",
  direction: "DEBT" as const,
  amountMinor: "1000",
  reason: "Original opening",
}
const aging = {
  ...actor,
  bookId: "book",
  supplierId: "supplier",
  asOfDate: "2026-09-30",
}
function fixture(active = true) {
  const calls: string[] = []
  const tx = {
    $transaction: () => {
      throw Error("Nested transaction")
    },
    $queryRaw: async () => {
      calls.push("lock")
      return [{ id: "book" }]
    },
    membership: {
      findFirst: async () => {
        calls.push("authority")
        return active
          ? {
              tenant: {
                id: "tenant",
                isActive: true,
                currencyCode: "NGN",
                timezone: "Africa/Lagos",
              },
            }
          : null
      },
    },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: "book",
        currencyCode: "NGN",
        startsAt,
      }),
      findUnique: async () => ({ id: "book", startsAt }),
      findFirst: async () => ({
        id: "book",
        currencyCode: "NGN",
        startsAt,
        lastSequence: 13n,
      }),
    },
    customerLedgerAccount: {
      findUniqueOrThrow: async () => ({
        id: "account",
        customerId: "customer",
        currencyCode: "NGN",
      }),
    },
  }
  return { tx, calls }
}
const txClient = (tx: object) => tx as Prisma.TransactionClient

// Real canonical helpers, with a transaction client that refuses nesting and no root client available.
const cases = [
  {
    name: "customer account",
    root: ensureCustomerLedgerAccount,
    helper: ensureCustomerLedgerAccountInTransaction,
    input: { ...actor, customerId: "customer", currencyCode: "NGN" },
    repeatable: false,
  },
  {
    name: "customer opening",
    root: recordCustomerLedgerOpening,
    helper: recordCustomerLedgerOpeningInTransaction,
    input: opening,
    repeatable: false,
  },
  {
    name: "Book foundation",
    root: createFinanceBook,
    helper: createFinanceBookInTransaction,
    input: { ...actor, startsAt },
    repeatable: false,
  },
  {
    name: "money account",
    root: createFinanceMoneyAccount,
    helper: createFinanceMoneyAccountInTransaction,
    input: {
      ...actor,
      bookId: "book",
      code: "QA",
      name: "QA cash",
      purpose: "CASH" as const,
    },
    repeatable: false,
  },
  {
    name: "canonical supplier aging",
    root: getFinanceSupplierPayableAging,
    helper: getFinanceSupplierPayableAgingInTransaction,
    input: aging,
    repeatable: true,
  },
  {
    name: "business supplier aging",
    root: getBusinessSupplierAgingReport,
    helper: getBusinessSupplierAgingReportInTransaction,
    input: aging,
    repeatable: true,
  },
  {
    name: "business posted profit",
    root: getBusinessPostedProfitReport,
    helper: getBusinessPostedProfitReportInTransaction,
    input: {
      ...actor,
      bookId: "book",
      from: startsAt,
      through: new Date("2026-09-30T23:59:59Z"),
    },
    repeatable: true,
  },
]
for (const item of cases) {
  test(`G01 ${item.name} transaction boundary retains fresh authority and bounded root wrapper`, async () => {
    const f = fixture(false)
    // Each pair has its corresponding typed input; use closures instead of widening production contracts.
    const runHelper = () =>
      (
        item.helper as (
          tx: Prisma.TransactionClient,
          input: never,
        ) => Promise<unknown>
      )(txClient(f.tx), item.input as never)
    await expect(runHelper()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.calls.at(-1)).toBe("authority")
    let count = 0
    const root = {
      $transaction: async (
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: unknown,
      ) => {
        count++
        expect(options).toEqual({
          maxWait: 10000,
          timeout: 30000,
          ...(item.repeatable ? { isolationLevel: "RepeatableRead" } : {}),
        })
        return work(txClient(f.tx))
      },
    } as unknown as PrismaClient
    await expect(
      (item.root as (db: PrismaClient, input: never) => Promise<unknown>)(
        root,
        item.input as never,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(count).toBe(1)
  })
}

test("G01 opening replay keeps original payload and rejects changed command or revoked authority", async () => {
  const f = fixture()
  const { tenantId: _tenant, actorUserId: _actor, ...payload } = opening
  const command = {
    accountId: "account",
    kind: "OPENING",
    payloadHash: financePayloadHash(payload),
    result: { id: "original" },
  }
  const tx = txClient({
    ...f.tx,
    customerLedgerCommand: { findUnique: async () => command },
  })
  expect(await recordCustomerLedgerOpeningInTransaction(tx, opening)).toEqual({
    id: "original",
  })
  await expect(
    recordCustomerLedgerOpeningInTransaction(tx, {
      ...opening,
      amountMinor: "1001",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    recordCustomerLedgerOpeningInTransaction(
      txClient(fixture(false).tx),
      opening,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("G01 foundation seams refuse foreign customer and conflicting original Book/payment account", async () => {
  const f = fixture()
  await expect(
    ensureCustomerLedgerAccountInTransaction(
      txClient({ ...f.tx, customer: { findFirst: async () => null } }),
      { ...actor, customerId: "foreign", currencyCode: "NGN" },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(
    await createFinanceBookInTransaction(txClient(f.tx), {
      ...actor,
      startsAt,
    }),
  ).toEqual({ id: "book" })
  await expect(
    createFinanceBookInTransaction(txClient(f.tx), {
      ...actor,
      startsAt: new Date("2026-01-02"),
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const money = txClient({
    ...f.tx,
    financeAccount: {
      findUnique: async () => ({
        name: "Different",
        purpose: "CASH",
        archivedAt: null,
        paymentMethods: [],
      }),
    },
  })
  await expect(
    createFinanceMoneyAccountInTransaction(money, {
      ...actor,
      bookId: "book",
      code: "QA",
      name: "Original",
      purpose: "CASH",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

function supplierFixture(size = 13) {
  const f = fixture()
  return txClient({
    ...f.tx,
    financeSupplierAccount: {
      findFirst: async () => ({
        id: "supplier",
        bookId: "book",
        name: "Supplier",
        code: "QA",
      }),
    },
    store: { findMany: async () => [{ id: "store" }] },
    financeSupplierEntry: {
      findMany: async () =>
        Array.from({ length: size }, (_, i) =>
          agingSource({ id: `bill${i}`, sequence: i + 1 }),
        ),
    },
    financeJournalLine: {
      aggregate: async (input: {
        where: { account: { purpose: string } }
      }) => ({
        _sum: {
          debitMinor: 0n,
          creditMinor:
            input.where.account.purpose === "PAYABLE"
              ? BigInt(size * 1000)
              : 0n,
        },
      }),
    },
  })
}
test("G01 canonical supplier seam keeps all13source totals across10+3pages and business adapter", async () => {
  const tx = supplierFixture()
  const first = await getFinanceSupplierPayableAgingInTransaction(tx, {
    ...aging,
    limit: 10,
  })
  expect(first.payableMinor).toBe("13000")
  expect(first.data).toHaveLength(10)
  expect(first.nextCursor).not.toBeNull()
  const next = await getFinanceSupplierPayableAgingInTransaction(tx, {
    ...aging,
    limit: 10,
    snapshotSequence: first.snapshotSequence,
    cursor: first.nextCursor ?? undefined,
  })
  expect(next.payableMinor).toBe(first.payableMinor)
  expect(next.data).toHaveLength(3)
  expect(
    new Set([...first.data, ...next.data].map((row) => row.sourceEntryId)).size,
  ).toBe(13)
  expect(
    (await getBusinessSupplierAgingReportInTransaction(tx, aging)).totals,
  ).toEqual({
    kind: "supplier_aging",
    payableMinor: "13000",
    advanceMinor: "0",
    sourcesRead: "13",
  })
  await expect(
    getFinanceSupplierPayableAgingInTransaction(tx, {
      ...aging,
      snapshotSequence: "14",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await expect(
    getFinanceSupplierPayableAgingInTransaction(tx, {
      ...aging,
      snapshotSequence: "13",
      cursor: {
        sequence: "10",
        bookId: "book",
        asOfDate: aging.asOfDate,
        snapshotSequence: "13",
        supplierId: "foreign",
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})

test("G01 supplier/profit transaction helpers keep complete-source bounds before canonical aggregation", async () => {
  await expect(
    getFinanceSupplierPayableAgingInTransaction(supplierFixture(1001), aging),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const tx = txClient({
    ...fixture().tx,
    financeAccount: {
      findMany: async () =>
        Array.from({ length: 201 }, (_, i) => ({ id: String(i) })),
    },
  })
  await expect(
    getBusinessPostedProfitReportInTransaction(tx, {
      ...actor,
      bookId: "book",
      from: startsAt,
      through: new Date("2026-09-30"),
    }),
  ).rejects.toThrow("staged report")
})

test("G01 roots preserve invalid-input rejection before opening a transaction", async () => {
  const absentRoot = {} as PrismaClient
  const absentTx = {} as Prisma.TransactionClient
  for (const run of [
    () =>
      ensureCustomerLedgerAccount(absentRoot, {
        ...actor,
        customerId: "customer",
        currencyCode: "ngn",
      }),
    () =>
      ensureCustomerLedgerAccountInTransaction(absentTx, {
        ...actor,
        customerId: "customer",
        currencyCode: "ngn",
      }),
    () => recordCustomerLedgerOpening(absentRoot, { ...opening, reason: "" }),
    () =>
      recordCustomerLedgerOpeningInTransaction(absentTx, {
        ...opening,
        reason: "",
      }),
    () =>
      createFinanceBook(absentRoot, {
        ...actor,
        startsAt: new Date("invalid"),
      }),
    () =>
      createFinanceBookInTransaction(absentTx, {
        ...actor,
        startsAt: new Date("invalid"),
      }),
    () =>
      createFinanceMoneyAccount(absentRoot, {
        ...actor,
        bookId: "book",
        code: "",
        name: "QA",
        purpose: "CASH",
      }),
    () =>
      createFinanceMoneyAccountInTransaction(absentTx, {
        ...actor,
        bookId: "book",
        code: "",
        name: "QA",
        purpose: "CASH",
      }),
  ])
    await expect(run()).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})
