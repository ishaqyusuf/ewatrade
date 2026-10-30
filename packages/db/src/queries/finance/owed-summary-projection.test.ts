import { afterAll, beforeEach, expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { listCustomerLedgerBalances } from "../customer-ledger/totals-projection"
import { getFinanceOwedSummary } from "./owed-reads"
import { getFinanceOwedSummaryProjection } from "./owed-summary-projection"
import { listFinanceSupplierBalances } from "./supplier-reads"

// Disposable PostgreSQL only. No app profile, socket, credentials or posting.
const memory = await PGlite.create()
afterAll(() => memory.close())
const schema = `
 CREATE TABLE "Customer" (id text PRIMARY KEY,"tenantId" text,name text,UNIQUE("tenantId",id));
 CREATE TABLE "CustomerLedgerAccount" (id text PRIMARY KEY,"tenantId" text,"customerId" text,"currencyCode" text,"lastSequence" bigint,UNIQUE("tenantId","customerId","currencyCode"),FOREIGN KEY("tenantId","customerId") REFERENCES "Customer"("tenantId",id));
 CREATE TABLE "CustomerLedgerEntry" (id text PRIMARY KEY,"accountId" text REFERENCES "CustomerLedgerAccount",sequence bigint,side text,"amountMinor" bigint,"effectiveAt" timestamp(3),UNIQUE("accountId",sequence));
 CREATE INDEX ON "CustomerLedgerEntry" ("accountId","effectiveAt",sequence);
 CREATE TABLE "CustomerLedgerAllocation" (id text PRIMARY KEY,"accountId" text REFERENCES "CustomerLedgerAccount",sequence bigint,"amountMinor" bigint,"creditEntryId" text,"chargeEntryId" text);
 CREATE INDEX ON "CustomerLedgerAllocation" ("accountId","creditEntryId");
 CREATE INDEX ON "CustomerLedgerAllocation" ("accountId","chargeEntryId");
 CREATE TABLE "CustomerLedgerAllocationRelease" (id text PRIMARY KEY,"allocationId" text REFERENCES "CustomerLedgerAllocation",sequence bigint,"amountMinor" bigint,"createdAt" timestamp(3));
 CREATE INDEX ON "CustomerLedgerAllocationRelease" ("allocationId","createdAt");
 CREATE TABLE "CustomerFundsRefundRequest" (id text PRIMARY KEY,"accountId" text REFERENCES "CustomerLedgerAccount","amountMinor" bigint,status text,"creditEntryId" text);
 CREATE INDEX ON "CustomerFundsRefundRequest" ("accountId","creditEntryId",status);
 CREATE TABLE "FinanceSupplierAccount" (id text PRIMARY KEY,"bookId" text,code text,name text,UNIQUE("bookId",code),UNIQUE("bookId",id));
 CREATE TABLE "FinanceAccount" (id text PRIMARY KEY,"bookId" text,purpose text,UNIQUE("bookId",id));
 CREATE TABLE "FinanceJournalEntry" (id text PRIMARY KEY,"bookId" text,sequence bigint,"effectiveAt" timestamp(3),UNIQUE("bookId",id),UNIQUE("bookId",sequence));
 CREATE TABLE "FinanceJournalLine" (id text PRIMARY KEY,"bookId" text,"entryId" text,"accountId" text,"debitMinor" bigint,"creditMinor" bigint,FOREIGN KEY("bookId","entryId") REFERENCES "FinanceJournalEntry"("bookId",id),FOREIGN KEY("bookId","accountId") REFERENCES "FinanceAccount"("bookId",id));
 CREATE INDEX ON "FinanceJournalLine" ("bookId","accountId","entryId");
 CREATE TABLE "FinanceSupplierEntry" (id text PRIMARY KEY,"bookId" text,"supplierId" text,"journalEntryId" text UNIQUE,"effectiveAt" timestamp(3),FOREIGN KEY("bookId","supplierId") REFERENCES "FinanceSupplierAccount"("bookId",id),FOREIGN KEY("bookId","journalEntryId") REFERENCES "FinanceJournalEntry"("bookId",id));
 CREATE INDEX ON "FinanceSupplierEntry" ("bookId","supplierId","effectiveAt");
`
await memory.exec(schema)
const scopes = [
  { tenantId: "tenant-a", currencyCode: "NGN", bookId: "book-a", prefix: "a" },
  {
    tenantId: "tenant-a",
    currencyCode: "USD",
    bookId: "book-usd",
    prefix: "u",
  },
  { tenantId: "tenant-b", currencyCode: "NGN", bookId: "book-b", prefix: "b" },
]
const input = {
  tenantId: "tenant-a",
  currencyCode: "NGN",
  bookId: "book-a",
  snapshot: 99n,
}
const huge = 9007199254740993n
beforeEach(async () => {
  await memory.exec(
    `TRUNCATE "Customer", "CustomerLedgerAccount", "CustomerLedgerEntry", "CustomerLedgerAllocation", "CustomerLedgerAllocationRelease", "CustomerFundsRefundRequest", "FinanceSupplierAccount", "FinanceAccount", "FinanceJournalEntry", "FinanceJournalLine", "FinanceSupplierEntry" CASCADE`,
  )
  for (const scope of scopes) {
    const p = scope.prefix
    for (const purpose of ["PAYABLE", "SUPPLIER_ADVANCE", "OTHER"])
      await memory.query(`INSERT INTO "FinanceAccount" VALUES ($1,$2,$3)`, [
        `${p}-${purpose}`,
        scope.bookId,
        purpose,
      ])
    for (let i = 0; i < 8; i++) {
      const customer = `${p}-customer-${i}`
      const account = `${p}-ledger-${i}`
      const supplier = `${p}-supplier-${i}`
      const amount = i === 0 ? huge : i === 6 ? 100n : BigInt((i + 1) * 1000)
      await memory.query(`INSERT INTO "Customer" VALUES ($1,$2,$3)`, [
        customer,
        scope.tenantId,
        `O'Neil customer ${p}${i}`,
      ])
      await memory.query(
        `INSERT INTO "CustomerLedgerAccount" VALUES ($1,$2,$3,$4,5)`,
        [account, scope.tenantId, customer, scope.currencyCode],
      )
      const entry = async (sequence: number, side: string, value: bigint) =>
        memory.query(
          `INSERT INTO "CustomerLedgerEntry" VALUES ($1,$2,$3,$4,$5,'2030-01-01')`,
          [`${account}-${sequence}`, account, sequence, side, value],
        )
      if (i !== 7) await entry(1, "DEBIT", amount)
      await entry(2, "CREDIT", huge)
      if (i < 6) await entry(3, "DEBIT", BigInt((i + 1) * 7))
      await entry(9, "DEBIT", 99999999n)
      if (i !== 7) {
        await memory.query(
          `INSERT INTO "CustomerLedgerAllocation" VALUES ($1,$2,2,$3,NULL,NULL),($4,$2,8,999999,NULL,NULL)`,
          [
            `${account}-alloc`,
            account,
            i === 6 ? 100n : BigInt((i + 1) * 100),
            `${account}-late-alloc`,
          ],
        )
        await memory.query(
          `INSERT INTO "CustomerLedgerAllocationRelease" VALUES ($1,$2,9,999999,'2030-01-01'),($3,$4,3,999999,'2030-01-01')`,
          [
            `${account}-late-rel`,
            `${account}-alloc`,
            `${account}-future-alloc-rel`,
            `${account}-late-alloc`,
          ],
        )
        if (i < 6)
          await memory.query(
            `INSERT INTO "CustomerLedgerAllocationRelease" VALUES ($1,$2,3,$3,'2030-01-01')`,
            [`${account}-rel`, `${account}-alloc`, BigInt((i + 1) * 10)],
          )
      }
      await memory.query(
        `INSERT INTO "CustomerFundsRefundRequest" VALUES ($1,$2,$3,'RESERVED',NULL)`,
        [`${account}-refund`, account, huge],
      )
      await memory.query(
        `INSERT INTO "FinanceSupplierAccount" VALUES ($1,$2,$3,$4)`,
        [supplier, scope.bookId, `${i}`, `Supplier ${p}${i}`],
      )
      const post = async (
        sequence: number,
        purpose: string,
        debit: bigint,
        credit: bigint,
      ) => {
        const id = `${supplier}-${sequence}`
        await memory.query(
          `INSERT INTO "FinanceJournalEntry" VALUES ($1,$2,$3,'2030-01-01')`,
          [id, scope.bookId, sequence],
        )
        await memory.query(
          `INSERT INTO "FinanceSupplierEntry" VALUES ($1,$2,$3,$1,'2030-01-01')`,
          [id, scope.bookId, supplier],
        )
        await memory.query(
          `INSERT INTO "FinanceJournalLine" VALUES ($1,$2,$3,$4,$5,$6),($7,$2,$3,$8,$6,$5)`,
          [
            `${id}-line`,
            scope.bookId,
            id,
            `${p}-${purpose}`,
            debit,
            credit,
            `${id}-other`,
            `${p}-OTHER`,
          ],
        )
      }
      if (i !== 7) {
        await post(i * 10 + 1, "PAYABLE", 0n, amount)
        await post(
          i * 10 + 2,
          "PAYABLE",
          i === 6 ? 100n : BigInt((i + 1) * 100),
          0n,
        )
      }
      await post(i * 10 + 3, "SUPPLIER_ADVANCE", huge, 0n)
      if (i < 6) await post(i * 10 + 4, "PAYABLE", 0n, BigInt((i + 1) * 7))
      await post(500 + i, "PAYABLE", 0n, 99999999n)
    }
  }
})
function port() {
  const queries: Prisma.Sql[] = []
  const rows: number[] = []
  const fields: number[] = []
  const tx = {
    $queryRaw: async (q: Prisma.Sql) => {
      queries.push(q)
      const result = await memory.query(q.text, q.values)
      rows.push(result.rows.length)
      fields.push(...result.fields.map((field) => field.dataTypeID))
      return result.rows
    },
  } as unknown as Pick<Prisma.TransactionClient, "$queryRaw">
  return { tx, queries, rows, fields }
}
async function reference(scope: typeof input) {
  const suppliers = (
    await memory.query<{ id: string; name: string }>(
      `SELECT id,name FROM "FinanceSupplierAccount" WHERE "bookId"=$1 ORDER BY id`,
      [scope.bookId],
    )
  ).rows
  const customers = (
    await memory.query<{ id: string; name: string }>(
      `SELECT c.id,c.name FROM "CustomerLedgerAccount" a JOIN "Customer" c ON c.id=a."customerId" AND c."tenantId"=a."tenantId" WHERE a."tenantId"=$1 AND a."currencyCode"=$2 ORDER BY c.id`,
      [scope.tenantId, scope.currencyCode],
    )
  ).rows
  const { tx } = port()
  const supplierBalances = await listFinanceSupplierBalances(tx, {
    bookId: scope.bookId,
    snapshot: scope.snapshot,
    supplierIds: suppliers.map((row) => row.id),
  })
  const customerBalances = await listCustomerLedgerBalances(tx, {
    tenantId: scope.tenantId,
    currencyCode: scope.currencyCode,
    customerIds: customers.map((row) => row.id),
  })
  const summary = (
    parties: { id: string; name: string }[],
    owed: (id: string) => string,
  ) => {
    const positive = parties
      .map((party) => ({ ...party, amount: BigInt(owed(party.id)) }))
      .filter((party) => party.amount > 0n)
    return {
      count: positive.length,
      owedMinor: positive
        .reduce((total, row) => total + row.amount, 0n)
        .toString(),
      top: positive
        .sort((a, b) =>
          a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0,
        )
        .slice(0, 3)
        .map(({ id, name, amount }) => ({
          id,
          name,
          owedMinor: amount.toString(),
        })),
    }
  }
  return {
    customers: summary(
      customers,
      (id) => customerBalances.get(id)?.outstandingDebtMinor ?? "0",
    ),
    suppliers: summary(
      suppliers,
      (id) => supplierBalances.get(id)?.payableMinor ?? "0",
    ),
  }
}
function reader(
  options: {
    denied?: boolean
    inactive?: boolean
    missingBook?: boolean
    failure?: Error
    book?: { id: string; currencyCode: string }
  } = {},
) {
  const io = port()
  const events: string[] = []
  const tx = {
    $queryRaw: async (
      q: Prisma.Sql | TemplateStringsArray,
      ...values: unknown[]
    ) => {
      if (!("text" in q)) {
        events.push("lock")
        expect(values).toEqual(["tenant-a", "owner"])
        return []
      }
      events.push("projection")
      if (options.failure) throw options.failure
      return io.tx.$queryRaw(q)
    },
    membership: {
      findFirst: async (args: unknown) => {
        events.push("authority")
        expect(args).toMatchObject({
          where: {
            tenantId: "tenant-a",
            userId: "owner",
            status: "ACTIVE",
            role: { in: ["OWNER", "ADMIN"] },
          },
        })
        return options.denied
          ? null
          : {
              tenant: {
                id: "tenant-a",
                isActive: !options.inactive,
                currencyCode: "NGN",
                timezone: "UTC",
              },
            }
      },
    },
    financeBook: {
      findFirst: async (args: unknown) => {
        events.push("book")
        expect(args).toEqual({
          where: { id: options.book?.id ?? "book-a", tenantId: "tenant-a" },
          select: { id: true, currencyCode: true, lastSequence: true },
        })
        return options.missingBook
          ? null
          : {
              id: options.book?.id ?? "book-a",
              currencyCode: options.book?.currencyCode ?? "NGN",
              lastSequence: 99n,
            }
      },
    },
    financeSupplierAccount: {
      findMany: async () => {
        throw Error("Unbounded supplier directory is obsolete")
      },
    },
    customerLedgerAccount: {
      findMany: async () => {
        throw Error("Unbounded customer directory is obsolete")
      },
    },
  }
  const db = {
    $transaction: async (work: (tx: unknown) => unknown, opts: unknown) => {
      expect(opts).toEqual({
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "RepeatableRead",
      })
      return work(tx)
    },
  } as unknown as PrismaClient
  return { ...io, db, events }
}
const actor = { tenantId: "tenant-a", actorUserId: "owner", bookId: "book-a" }

test("actual owed reader uses one bounded projection after unchanged authority and Book gates", async () => {
  const f = reader()
  const result = await getFinanceOwedSummary(f.db, actor)
  expect(f.events).toEqual(["lock", "authority", "book", "projection"])
  expect(f.queries).toHaveLength(1)
  expect(f.rows).toEqual([2])
  expect(result).toEqual({ currencyCode: "NGN", ...(await reference(input)) })
  expect(result.customers.top).toHaveLength(3)
  expect(result.suppliers.top).toHaveLength(3)
  expect(result.customers.count).toBe(6)
  expect(result.suppliers.count).toBe(6)
  expect(BigInt(result.customers.owedMinor)).toBeGreaterThan(
    BigInt(Number.MAX_SAFE_INTEGER),
  )
  expect(f.fields).toEqual([25, 25, 25, 3802])
})

test("Book and each Customer-account sequence remain independent across Tenant/currency scopes", async () => {
  let cases = 0
  for (const scope of scopes)
    for (const snapshot of [0n, 35n, 99n])
      for (const sequence of [0, 2, 5]) {
        await memory.query(
          `UPDATE "CustomerLedgerAccount" SET "lastSequence"=$1 WHERE "tenantId"=$2 AND "currencyCode"=$3`,
          [sequence, scope.tenantId, scope.currencyCode],
        )
        const current = {
          tenantId: scope.tenantId,
          currencyCode: scope.currencyCode,
          bookId: scope.bookId,
          snapshot,
        }
        const f = port()
        expect(await getFinanceOwedSummaryProjection(f.tx, current)).toEqual(
          await reference(current),
        )
        expect(f.rows).toEqual([2])
        cases++
      }
  expect(cases).toBe(27)
})

test("empty scopes, zero/negative debts and unrelated credits/advances/refund reservations keep their semantics", async () => {
  const f = port()
  const initial = await getFinanceOwedSummaryProjection(f.tx, input)
  await memory.exec(
    `UPDATE "CustomerLedgerEntry" SET "amountMinor"=1 WHERE id='a-ledger-5-1'; UPDATE "FinanceJournalLine" SET "creditMinor"=1 WHERE id='a-supplier-5-51-line'`,
  )
  const after = await getFinanceOwedSummaryProjection(f.tx, input)
  expect(after).toEqual(await reference(input))
  expect(after.customers.count).toBe(5)
  expect(after.suppliers.count).toBe(5)
  expect(initial.customers.top[0]?.owedMinor).toBe((huge - 83n).toString())
  expect(initial.suppliers.top[0]?.owedMinor).toBe((huge - 93n).toString())
  expect(
    await getFinanceOwedSummaryProjection(f.tx, {
      tenantId: "absent",
      currencyCode: "EUR",
      bookId: "absent",
      snapshot: 0n,
    }),
  ).toEqual({
    customers: { count: 0, owedMinor: "0", top: [] },
    suppliers: { count: 0, owedMinor: "0", top: [] },
  })
})

test("current reads have no cache and ties get a stable ID order", async () => {
  const f = port()
  const first = await getFinanceOwedSummaryProjection(f.tx, input)
  await memory.exec(
    `UPDATE "Customer" SET name='Fresh name' WHERE id='a-customer-0'; UPDATE "CustomerLedgerAccount" SET "lastSequence"=0 WHERE id='a-ledger-0'`,
  )
  const second = await getFinanceOwedSummaryProjection(f.tx, input)
  expect(second).toEqual(await reference(input))
  expect(second.customers.owedMinor).not.toBe(first.customers.owedMinor)
  await memory.exec(
    `UPDATE "CustomerLedgerAccount" SET "lastSequence"=1; UPDATE "CustomerLedgerEntry" SET "amountMinor"=100 WHERE sequence=1`,
  )
  const tied = await getFinanceOwedSummaryProjection(f.tx, input)
  expect(tied.customers.top.map((row) => row.id)).toEqual([
    "a-customer-0",
    "a-customer-1",
    "a-customer-2",
  ])
  expect(tied.customers.top[0]?.name).toBe("Fresh name")
  await memory.exec(`
    UPDATE "FinanceJournalLine" line SET "debitMinor"=0,"creditMinor"=100
      FROM "FinanceJournalEntry" entry WHERE entry.id=line."entryId" AND entry."bookId"='book-a'
      AND entry.sequence<=99 AND line."accountId"='a-PAYABLE';
    UPDATE "FinanceJournalLine" line SET "debitMinor"=100,"creditMinor"=0
      FROM "FinanceJournalEntry" entry WHERE entry.id=line."entryId" AND entry."bookId"='book-a'
      AND entry.sequence<=99 AND line."accountId"='a-OTHER'
      AND EXISTS (SELECT 1 FROM "FinanceJournalLine" payable WHERE payable."entryId"=entry.id AND payable."accountId"='a-PAYABLE');
  `)
  const supplierTies = await getFinanceOwedSummaryProjection(f.tx, input)
  expect(supplierTies.suppliers.top.map((row) => row.id)).toEqual([
    "a-supplier-0",
    "a-supplier-1",
    "a-supplier-2",
  ])
  expect(supplierTies.suppliers.top.map((row) => row.owedMinor)).toEqual([
    "300",
    "300",
    "300",
  ])
})

test("refused Member/Tenant and missing Book never execute a projection; fresh SQL errors propagate", async () => {
  for (const options of [
    { denied: true },
    { inactive: true },
    { missingBook: true },
  ]) {
    const f = reader(options)
    await expect(getFinanceOwedSummary(f.db, actor)).rejects.toMatchObject({
      code: options.missingBook ? "NOT_FOUND" : "FORBIDDEN",
    })
    expect(f.queries).toEqual([])
  }
  const failure = Error("inert projection failure")
  const f = reader({ failure })
  await expect(getFinanceOwedSummary(f.db, actor)).rejects.toBe(failure)
  expect(f.events).toEqual(["lock", "authority", "book", "projection"])
})

test("scope values stay bound and a missing projection cannot silently report zero", async () => {
  const f = port()
  const injected = "book-a' OR true --"
  const result = await getFinanceOwedSummaryProjection(f.tx, {
    tenantId: injected,
    currencyCode: injected,
    bookId: injected,
    snapshot: 0n,
  })
  expect(result).toEqual({
    customers: { count: 0, owedMinor: "0", top: [] },
    suppliers: { count: 0, owedMinor: "0", top: [] },
  })
  expect(f.queries[0]?.text).not.toContain(injected)
  expect(f.queries[0]?.values).toContain(injected)
  const absent = { $queryRaw: async () => [] } as unknown as Pick<
    Prisma.TransactionClient,
    "$queryRaw"
  >
  await expect(getFinanceOwedSummaryProjection(absent, input)).rejects.toThrow(
    "unavailable",
  )
})

test("actual reader uses the selected Book currency instead of the Tenant default", async () => {
  const f = reader({ book: { id: "book-usd", currencyCode: "USD" } })
  const current = { ...input, bookId: "book-usd", currencyCode: "USD" }
  expect(
    await getFinanceOwedSummary(f.db, { ...actor, bookId: "book-usd" }),
  ).toEqual({ currencyCode: "USD", ...(await reference(current)) })
  expect(f.queries).toHaveLength(1)
  expect(f.queries[0]?.values).toContain("USD")
})
