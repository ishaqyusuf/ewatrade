import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { literalContains } from "../literal-contains"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

export type CustomerBalanceFilter = "owe" | "late" | "ahead" | "paid"
export type CustomerBalanceSort = "owed" | "oldest" | "name"

type Row = {
  id: string
  name: string
  phone: string | null
  email: string | null
  owedMinor: string
  creditMinor: string
  owingSince: Date | null
  lastPaidAt: Date | null
  lastPaidMinor: string | null
  sortName: string
}

type Cursor = {
  id: string
  owed?: string
  since?: string | null
  name?: string
}

const LATE_DAYS = 30

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    if (parsed && typeof parsed.id === "string") return parsed as Cursor
  } catch {}
  throw new FinanceError("INVALID_JOURNAL", "Refresh Customer balances.")
}

/**
 * Customer balances directory: every saved customer with what they owe and
 * have paid ahead in the tenant currency (same projection as
 * listCustomerLedgerBalances), when the oldest unpaid charge was made, and
 * their latest payment. Filters and sorts run in SQL with a keyset cursor.
 */
export async function listFinanceCustomerBalanceDirectory(
  db: PrismaClient,
  input: FinanceActor & {
    query?: string
    filter?: CustomerBalanceFilter
    sort?: CustomerBalanceSort
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 30
  const query = input.query?.trim() || undefined
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (query?.length ?? 0) > 160
  )
    throw new FinanceError("INVALID_JOURNAL", "Invalid Customer balance list.")
  const sort = input.sort ?? "owed"
  const cursor = input.cursor ? decodeCursor(input.cursor) : null
  return db.$transaction(
    async (tx) => {
      const tenant = await assertFinanceManager(tx, input)
      return customerBalanceDirectoryInTransaction(tx, {
        ...input,
        currencyCode: tenant.currencyCode,
        query,
        sort,
        cursor,
        limit,
      })
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

/** The directory read inside a caller's transaction, after access is checked. */
export async function customerBalanceDirectoryInTransaction(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: {
    tenantId: string
    currencyCode: string
    query?: string
    filter?: CustomerBalanceFilter
    sort: CustomerBalanceSort
    cursor: Cursor | null
    limit: number
  },
) {
  const { query, sort, cursor, limit } = input
  const tenant = { currencyCode: input.currencyCode }
  const lateBefore = new Date(Date.now() - LATE_DAYS * 86_400_000)
  const search = query
    ? Prisma.sql`AND (c.name ILIKE ${`%${literalContains(query)}%`} OR c.phone ILIKE ${`%${literalContains(query)}%`} OR c.email ILIKE ${`%${literalContains(query)}%`})`
    : Prisma.empty
  const filter =
    input.filter === "owe"
      ? Prisma.sql`AND owed > 0`
      : input.filter === "late"
        ? Prisma.sql`AND owed > 0 AND "owingSince" < ${lateBefore}`
        : input.filter === "ahead"
          ? Prisma.sql`AND credit > 0`
          : input.filter === "paid"
            ? Prisma.sql`AND owed = 0 AND credit = 0`
            : Prisma.empty
  const after = !cursor
    ? Prisma.empty
    : sort === "owed"
      ? Prisma.sql`AND (owed < ${BigInt(cursor.owed ?? "0")} OR (owed = ${BigInt(cursor.owed ?? "0")} AND id > ${cursor.id}))`
      : sort === "name"
        ? Prisma.sql`AND ("sortName" > ${cursor.name ?? ""} OR ("sortName" = ${cursor.name ?? ""} AND id > ${cursor.id}))`
        : cursor.since
          ? Prisma.sql`AND ("owingSince" > ${new Date(cursor.since)} OR ("owingSince" = ${new Date(cursor.since)} AND id > ${cursor.id}) OR "owingSince" IS NULL)`
          : Prisma.sql`AND "owingSince" IS NULL AND id > ${cursor.id}`
  const order =
    sort === "owed"
      ? Prisma.sql`ORDER BY owed DESC, id ASC`
      : sort === "name"
        ? Prisma.sql`ORDER BY "sortName" ASC, id ASC`
        : Prisma.sql`ORDER BY "owingSince" ASC NULLS LAST, id ASC`
  const rowsSql = Prisma.sql`
    WITH rows AS (
      SELECT c.id, c.name, c.phone, c.email, lower(c.name) AS "sortName",
        COALESCE(b.owed, 0) AS owed, COALESCE(b.credit, 0) AS credit,
        CASE WHEN COALESCE(b.owed, 0) > 0 THEN b."owingSince" END AS "owingSince",
        b."lastPaidAt", b."lastPaidMinor"
      FROM "Customer" c
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(e.debit, 0) - (COALESCE(a.amount, 0) - COALESCE(r.amount, 0)) AS owed,
          COALESCE(e.credit, 0) - (COALESCE(a.amount, 0) - COALESCE(r.amount, 0)) AS credit,
          oc."owingSince", lp."effectiveAt" AS "lastPaidAt", lp."amountMinor" AS "lastPaidMinor"
        FROM "CustomerLedgerAccount" account
        LEFT JOIN LATERAL (SELECT SUM("amountMinor") FILTER (WHERE side = 'DEBIT') AS debit, SUM("amountMinor") FILTER (WHERE side = 'CREDIT') AS credit
          FROM "CustomerLedgerEntry" WHERE "accountId" = account.id AND sequence <= account."lastSequence") e ON TRUE
        LEFT JOIN LATERAL (SELECT SUM("amountMinor") AS amount FROM "CustomerLedgerAllocation" WHERE "accountId" = account.id AND sequence <= account."lastSequence") a ON TRUE
        LEFT JOIN LATERAL (SELECT SUM(rel."amountMinor") AS amount FROM "CustomerLedgerAllocationRelease" rel
          JOIN "CustomerLedgerAllocation" allocation ON allocation.id = rel."allocationId"
          WHERE allocation."accountId" = account.id AND allocation.sequence <= account."lastSequence" AND rel.sequence <= account."lastSequence") r ON TRUE
        LEFT JOIN LATERAL (
          SELECT MIN(charge."effectiveAt") AS "owingSince"
          FROM "CustomerLedgerEntry" charge
          WHERE charge."accountId" = account.id AND charge.side = 'DEBIT'
            AND charge.sequence <= account."lastSequence" AND charge."reversalOfId" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "CustomerLedgerEntry" undo
              WHERE undo."reversalOfId" = charge.id AND undo.sequence <= account."lastSequence")
            AND charge."amountMinor" > (
              SELECT COALESCE(SUM(al."amountMinor"), 0) FROM "CustomerLedgerAllocation" al
              WHERE al."accountId" = account.id AND al."chargeEntryId" = charge.id AND al.sequence <= account."lastSequence"
            ) - (
              SELECT COALESCE(SUM(rel."amountMinor"), 0) FROM "CustomerLedgerAllocationRelease" rel
              JOIN "CustomerLedgerAllocation" al ON al.id = rel."allocationId"
              WHERE al."accountId" = account.id AND al."chargeEntryId" = charge.id
                AND al.sequence <= account."lastSequence" AND rel.sequence <= account."lastSequence"
            )
        ) oc ON TRUE
        LEFT JOIN LATERAL (
          SELECT payment."effectiveAt", payment."amountMinor"
          FROM "CustomerLedgerEntry" payment
          WHERE payment."accountId" = account.id AND payment.side = 'CREDIT'
            AND payment.kind IN ('RECEIPT', 'ORDER_PAYMENT')
            AND payment.sequence <= account."lastSequence" AND payment."reversalOfId" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "CustomerLedgerEntry" undo
              WHERE undo."reversalOfId" = payment.id AND undo.sequence <= account."lastSequence")
          ORDER BY payment."effectiveAt" DESC, payment.sequence DESC
          LIMIT 1
        ) lp ON TRUE
        WHERE account."tenantId" = c."tenantId" AND account."customerId" = c.id
          AND account."currencyCode" = ${tenant.currencyCode}
      ) b ON TRUE
      WHERE c."tenantId" = ${input.tenantId} ${search}
    )`
  const [rows, totals] = await Promise.all([
    tx.$queryRaw<Row[]>(Prisma.sql`${rowsSql}
      SELECT id, name, phone, email, "sortName", owed::text AS "owedMinor", credit::text AS "creditMinor",
        "owingSince", "lastPaidAt", "lastPaidMinor"::text AS "lastPaidMinor"
      FROM rows WHERE TRUE ${filter} ${after} ${order} LIMIT ${limit + 1}`),
    tx.$queryRaw<Array<{ count: string; owed: string }>>(Prisma.sql`${rowsSql}
      SELECT COUNT(*)::text AS count, COALESCE(SUM(owed), 0)::text AS owed
      FROM rows WHERE TRUE ${filter}`),
  ])
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    currencyCode: tenant.currencyCode,
    count: Number(totals[0]?.count ?? 0),
    owedMinor: totals[0]?.owed ?? "0",
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({
            id: last.id,
            owed: last.owedMinor,
            since: last.owingSince
              ? new Date(last.owingSince).toISOString()
              : null,
            name: last.sortName,
          })
        : null,
    items: page.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      owedMinor: row.owedMinor,
      paidAheadMinor: row.creditMinor,
      owingSince: row.owingSince,
      lastPaymentAt: row.lastPaidAt,
      lastPaymentMinor: row.lastPaidMinor,
    })),
  }
}
