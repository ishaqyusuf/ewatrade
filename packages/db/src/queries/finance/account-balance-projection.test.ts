import { afterAll, expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import {
  type FinanceAccount,
  Prisma,
  type PrismaClient,
} from "../../../generated/prisma/client"
import {
  CommercialPaymentMethod,
  FinanceAccountKind,
  FinanceAccountPurpose,
} from "../../../generated/prisma/enums"
import { getFinanceAccountBalanceProjection } from "./account-balance-projection"
import { getFinanceAccountBalances } from "./reads"

// Disposable PostgreSQL only. No application client, profile, socket or live data.
const memory = await PGlite.create()
afterAll(() => memory.close())
for (const [name, values] of Object.entries({
  FinanceAccountKind,
  FinanceAccountPurpose,
  CommercialPaymentMethod,
}))
  await memory.exec(
    `CREATE TYPE "${name}" AS ENUM (${Object.values(values)
      .map((value) => `'${value}'`)
      .join(",")})`,
  )
await memory.exec(`
 CREATE TABLE "FinanceAccount" (id text PRIMARY KEY,"bookId" text,code text,name text,kind "FinanceAccountKind",purpose "FinanceAccountPurpose","archivedAt" timestamp(3),"paymentMethods" "CommercialPaymentMethod"[],"paymentsPausedAt" timestamp(3),"mobileMoney" boolean,"bankName" text,"bankAccountNumber" text,"bankAccountHolder" text,"createdAt" timestamp(3));
 CREATE UNIQUE INDEX ON "FinanceAccount" ("bookId",code);
 CREATE UNIQUE INDEX ON "FinanceAccount" ("bookId",id);
 CREATE TABLE "FinanceJournalEntry" (id text PRIMARY KEY,"bookId" text,sequence bigint,"effectiveAt" timestamp(3));
 CREATE UNIQUE INDEX ON "FinanceJournalEntry" ("bookId",id);
 CREATE UNIQUE INDEX ON "FinanceJournalEntry" ("bookId",sequence);
 CREATE INDEX ON "FinanceJournalEntry" ("bookId","effectiveAt",sequence);
 CREATE TABLE "FinanceJournalLine" (id text PRIMARY KEY,"bookId" text,"entryId" text,"accountId" text,"debitMinor" bigint,"creditMinor" bigint);
 CREATE INDEX ON "FinanceJournalLine" ("bookId","accountId","entryId");
`)
const at = new Date("2026-10-01T00:00:00Z")
const methods = Object.values(CommercialPaymentMethod).slice(0, 2)
const kinds = Object.values(FinanceAccountKind)
for (const [index, kind] of [...kinds, "ASSET", "ASSET"].entries()) {
  await memory.query(
    `INSERT INTO "FinanceAccount" VALUES ($1,'book-a',$2,$3,$4,'OTHER',$5,$6,$7,$8,'Inert bank','00001234','Inert holder',$9)`,
    [
      `account-${index}`,
      `${1000 + index}`,
      `Inert ${kind}`,
      kind,
      index === 5 ? at : null,
      `{${methods.join(",")}}`,
      index === 5 ? at : null,
      index === 5,
      at,
    ],
  )
}
await memory.exec(
  `INSERT INTO "FinanceAccount" VALUES ('other','book-b','1000','Other','ASSET','OTHER',NULL,'{}',NULL,false,NULL,NULL,NULL,'2026-10-01')`,
)
const entries = [
  ["before", 1, "2026-09-30T23:59:59.999Z"],
  ["floor", 2, "2026-10-01T00:00:00Z"],
  ["month", 3, "2026-10-30T00:00:00Z"],
  ["future", 4, "2026-11-01T00:00:00Z"],
  ["late", 9, "2026-10-15T00:00:00Z"],
] as const
for (const [id, sequence, date] of entries)
  await memory.query(
    `INSERT INTO "FinanceJournalEntry" VALUES ($1,'book-a',$2,$3)`,
    [id, sequence, date],
  )
for (let i = 0; i < 6; i++) {
  for (const [entry, debit, credit] of [
    ["before", i === 0 ? "9007199254740993" : `${i + 10}`, "0"],
    ["floor", "0", "3"],
    ["month", "13", "7"],
    ["future", "0", "5"],
    ["late", "999999", "0"],
  ])
    await memory.query(
      `INSERT INTO "FinanceJournalLine" VALUES ($1,'book-a',$2,$3,$4,$5)`,
      [`${i}-${entry}`, entry, `account-${i}`, debit, credit],
    )
}
await memory.exec(
  `INSERT INTO "FinanceJournalEntry" VALUES ('other-entry','book-b',1,'2026-10-01'); INSERT INTO "FinanceJournalLine" VALUES ('other-line','book-b','other-entry','other',123,0)`,
)

type LegacySum = { accountId: string; debit: string; credit: string }
async function legacy(bookId: string, snapshot: bigint, monthStart: Date) {
  // Prisma's ordinary model read decodes native enums/arrays to their JS values.
  const accounts = (
    await memory.query<FinanceAccount>(
      `SELECT id,"bookId",code,name,kind::text AS kind,purpose::text AS purpose,
      "archivedAt","paymentMethods"::text[] AS "paymentMethods","paymentsPausedAt", "mobileMoney",
      "bankName","bankAccountNumber","bankAccountHolder","createdAt"
      FROM "FinanceAccount" WHERE "bookId"=$1 ORDER BY code ASC`,
      [bookId],
    )
  ).rows
  const aggregate = async (monthly: boolean) =>
    (
      await memory.query<LegacySum>(
        `
    SELECT line."accountId", SUM(line."debitMinor")::text AS debit, SUM(line."creditMinor")::text AS credit
    FROM "FinanceJournalLine" line JOIN "FinanceJournalEntry" entry ON entry."bookId"=line."bookId" AND entry.id=line."entryId"
    WHERE line."bookId"=$1 AND entry.sequence<=$2 ${monthly ? 'AND entry."effectiveAt">=$3' : ""} GROUP BY line."accountId"`,
        monthly
          ? [bookId, snapshot.toString(), monthStart]
          : [bookId, snapshot.toString()],
      )
    ).rows
  const totals = new Map(
    (await aggregate(false)).map((row) => [row.accountId, row]),
  )
  const months = new Map(
    (await aggregate(true)).map((row) => [row.accountId, row]),
  )
  return accounts.map((account) => {
    const debit = BigInt(totals.get(account.id)?.debit ?? "0")
    const credit = BigInt(totals.get(account.id)?.credit ?? "0")
    return {
      ...account,
      debitMinor: debit.toString(),
      creditMinor: credit.toString(),
      monthDebitMinor: months.get(account.id)?.debit ?? "0",
      monthCreditMinor: months.get(account.id)?.credit ?? "0",
      balanceMinor: (account.kind === "ASSET" || account.kind === "EXPENSE"
        ? debit - credit
        : credit - debit
      ).toString(),
    }
  })
}
function reader(
  options: {
    denied?: boolean
    inactive?: boolean
    missingBook?: boolean
    failure?: Error
    snapshot?: bigint
  } = {},
) {
  const events: string[] = []
  const queries: Prisma.Sql[] = []
  const columns: Array<{ name: string; dataTypeID: number }> = []
  const tx = {
    $queryRaw: async (
      query: Prisma.Sql | TemplateStringsArray,
      ...values: unknown[]
    ) => {
      if (!("text" in query)) {
        events.push("membership-lock")
        expect(values).toEqual(["tenant-a", "owner"])
        return []
      }
      events.push("projection")
      queries.push(query)
      if (options.failure) throw options.failure
      const result = await memory.query(query.text, query.values)
      columns.push(...result.fields)
      return result.rows
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
        expect(args).toEqual({ where: { id: "book-a", tenantId: "tenant-a" } })
        return options.missingBook
          ? null
          : {
              id: "book-a",
              currencyCode: "NGN",
              startsAt: at,
              lastSequence: options.snapshot ?? 4n,
            }
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
  return {
    db,
    tx: tx as unknown as Prisma.TransactionClient,
    events,
    queries,
    columns,
  }
}
const actor = { tenantId: "tenant-a", actorUserId: "owner", bookId: "book-a" }

test("actual balance reader uses one projection after unchanged authority/Book gates", async () => {
  const { db, events, queries } = reader()
  const result = await getFinanceAccountBalances(db, actor)
  expect(events).toEqual(["membership-lock", "authority", "book", "projection"])
  expect(queries).toHaveLength(1)
  expect(result).toEqual({
    snapshotSequence: "4",
    currencyCode: "NGN",
    startsAt: at,
    monthStart: result.monthStart,
    accounts: await legacy("book-a", 4n, result.monthStart),
  })
  expect([
    result.monthStart.getUTCDate(),
    result.monthStart.getUTCHours(),
    result.monthStart.getUTCMinutes(),
  ]).toEqual([1, 0, 0])
})
test("all account kinds, month/snapshot boundaries and other Books match the three-read reference", async () => {
  for (const bookId of ["book-a", "book-b", "empty-book"])
    for (const snapshot of [0n, 1n, 2n, 3n, 4n, 9n])
      for (const monthStart of [at, new Date("2026-11-01T00:00:00Z")]) {
        const { tx, queries } = reader()
        const result = await getFinanceAccountBalanceProjection(tx, {
          bookId,
          snapshot,
          monthStart,
        })
        expect(result).toEqual(await legacy(bookId, snapshot, monthStart))
        expect(queries).toHaveLength(1)
      }
})
test("exact large money, zero/archived accounts and current account metadata survive", async () => {
  const { tx } = reader()
  const rows = await getFinanceAccountBalanceProjection(tx, {
    bookId: "book-a",
    snapshot: 4n,
    monthStart: at,
  })
  expect(rows[0]?.debitMinor).toBe("9007199254741006")
  expect(rows[0]?.balanceMinor).toBe("9007199254740991")
  expect(rows[0]?.monthDebitMinor).toBe("13")
  expect(rows[0]?.monthCreditMinor).toBe("15") // Future-effective committed entries were already included.
  expect(rows[5]).toMatchObject({
    archivedAt: at,
    paymentsPausedAt: at,
    mobileMoney: true,
    paymentMethods: methods,
    bankAccountNumber: "00001234",
  })
  expect(rows[6]).toMatchObject({
    debitMinor: "0",
    creditMinor: "0",
    balanceMinor: "0",
  })
  expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
    [
      ...Object.values(Prisma.FinanceAccountScalarFieldEnum),
      "debitMinor",
      "creditMinor",
      "monthDebitMinor",
      "monthCreditMinor",
      "balanceMinor",
    ].sort(),
  )
})
test("SQL casts native enums and enum arrays to portable text columns without changing values", async () => {
  const { tx, columns } = reader()
  await getFinanceAccountBalanceProjection(tx, {
    bookId: "book-a",
    snapshot: 4n,
    monthStart: at,
  })
  for (const name of [
    "kind",
    "purpose",
    "totalDebit",
    "totalCredit",
    "monthDebit",
    "monthCredit",
  ])
    expect(columns.find((column) => column.name === name)?.dataTypeID).toBe(25)
  expect(
    columns.find((column) => column.name === "paymentMethods")?.dataTypeID,
  ).toBe(1009)
})
test("known authority/Book failures perform no balance query and SQL failures propagate", async () => {
  for (const options of [
    { denied: true },
    { inactive: true },
    { missingBook: true },
  ]) {
    const { db, queries } = reader(options)
    await expect(getFinanceAccountBalances(db, actor)).rejects.toMatchObject({
      code: "missingBook" in options ? "NOT_FOUND" : "FORBIDDEN",
    })
    expect(queries).toHaveLength(0)
  }
  const failure = new Error("inert SQL failure")
  const { db } = reader({ failure })
  await expect(getFinanceAccountBalances(db, actor)).rejects.toBe(failure)
})
test("parameters do not become SQL and consecutive snapshots are not cached", async () => {
  const { tx, queries } = reader()
  const injected = "book-a' OR true --"
  expect(
    await getFinanceAccountBalanceProjection(tx, {
      bookId: injected,
      snapshot: 4n,
      monthStart: at,
    }),
  ).toEqual([])
  expect(queries[0]?.text).not.toContain(injected)
  expect(queries[0]?.values).toContain(injected)
  const earlier = await getFinanceAccountBalanceProjection(tx, {
    bookId: "book-a",
    snapshot: 4n,
    monthStart: at,
  })
  const later = await getFinanceAccountBalanceProjection(tx, {
    bookId: "book-a",
    snapshot: 9n,
    monthStart: at,
  })
  expect(
    BigInt(later[0]?.debitMinor ?? "0") - BigInt(earlier[0]?.debitMinor ?? "0"),
  ).toBe(999999n)
  expect(queries).toHaveLength(3)
  const options = { snapshot: 4n }
  const root = reader(options)
  const first = await getFinanceAccountBalances(root.db, actor)
  options.snapshot = 9n
  const second = await getFinanceAccountBalances(root.db, actor)
  expect(
    BigInt(second.accounts[0]?.debitMinor ?? "0") -
      BigInt(first.accounts[0]?.debitMinor ?? "0"),
  ).toBe(999999n)
  expect(root.queries).toHaveLength(2)
  expect(root.events).toEqual([
    "membership-lock",
    "authority",
    "book",
    "projection",
    "membership-lock",
    "authority",
    "book",
    "projection",
  ])
})
