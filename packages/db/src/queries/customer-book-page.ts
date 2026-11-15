import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { literalContains } from "./literal-contains"

export type CustomerBookFilter = "all" | "owe" | "ahead"

export type CustomerBookPageRow = {
  /** Saved customer behind the row; statements and edits need it. */
  customerId: string | null
  email: string | null
  firstSeenAt: Date
  id: string
  identityType: "email" | "name" | "phone" | "walk-in"
  lastOrder: {
    createdAt: Date
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  } | null
  lastSeenAt: Date
  name: string
  orderCount: number
  phone: string | null
  totalMinor: string
  /** Only when a currency was asked for and the customer has an account. */
  balance: {
    owedMinor: string
    paidAheadMinor: string
    netMinor: string
  } | null
}

type Cursor = { t: string; id: string }

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    if (
      typeof parsed?.t === "string" &&
      typeof parsed?.id === "string" &&
      !Number.isNaN(Date.parse(parsed.t))
    )
      return parsed
  } catch {}
  return null
}

/** One customer's ledger figures in a currency (same math as the statement). */
function balanceLateral(
  customerId: Prisma.Sql,
  tenantId: string,
  currencyCode: string,
) {
  return Prisma.sql`
    SELECT
      COALESCE(e.debit, 0) - (COALESCE(a.amount, 0) - COALESCE(r.amount, 0)) AS owed,
      COALESCE(e.credit, 0) - (COALESCE(a.amount, 0) - COALESCE(r.amount, 0)) - COALESCE(held.amount, 0) AS ahead,
      COALESCE(e.debit, 0) - COALESCE(e.credit, 0) AS net
    FROM "CustomerLedgerAccount" account
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") FILTER (WHERE side = 'DEBIT') AS debit, SUM("amountMinor") FILTER (WHERE side = 'CREDIT') AS credit
      FROM "CustomerLedgerEntry" WHERE "accountId" = account.id AND sequence <= account."lastSequence") e ON TRUE
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") AS amount FROM "CustomerLedgerAllocation" WHERE "accountId" = account.id AND sequence <= account."lastSequence") a ON TRUE
    LEFT JOIN LATERAL (SELECT SUM(rel."amountMinor") AS amount FROM "CustomerLedgerAllocationRelease" rel
      JOIN "CustomerLedgerAllocation" allocation ON allocation.id = rel."allocationId"
      WHERE allocation."accountId" = account.id AND allocation.sequence <= account."lastSequence" AND rel.sequence <= account."lastSequence") r ON TRUE
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") AS amount FROM "CustomerFundsRefundRequest"
      WHERE "accountId" = account.id AND status = 'RESERVED') held ON TRUE
    WHERE account."tenantId" = ${tenantId} AND account."currencyCode" = ${currencyCode}
      AND account."customerId" = ${customerId}`
}

/**
 * One page of the store's customer book in one statement: everyone who
 * ordered (each order counted under its saved customer — linked, or matched by
 * the same phone/email rule the book always used — else under the contact
 * typed on it; all walk-in sales share one row), plus saved customers who have
 * not ordered (business-wide, left out of own-sales views). Search, the
 * owe / paid-ahead filter and the (last activity, id) cursor run in SQL;
 * balances are computed only for the returned rows.
 */
export async function listCustomerBookPage(
  db: Pick<PrismaClient, "$queryRaw">,
  input: {
    tenantId: string
    storeId: string
    createdByUserId?: string
    includeSavedCustomers: boolean
    /** Balances (and the balance filter) in this currency; omit to skip. */
    currencyCode?: string
    query?: string
    filter?: CustomerBookFilter
    cursor?: string
    limit?: number
  },
): Promise<{ rows: CustomerBookPageRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const cursor = decodeCursor(input.cursor)
  const t = input.tenantId
  const phoneKey = (value: Prisma.Sql) =>
    Prisma.sql`NULLIF(regexp_replace(COALESCE(${value}, ''), '[^0-9+]', '', 'g'), '')`
  const emailKey = (value: Prisma.Sql) =>
    Prisma.sql`NULLIF(lower(btrim(COALESCE(${value}, ''))), '')`
  const query = input.query?.trim()
  const digits = query?.replace(/\D/g, "") ?? ""
  const like = query ? `%${literalContains(query)}%` : null
  const search = like
    ? Prisma.sql`AND (book.name ILIKE ${like} OR book.phone ILIKE ${like} OR book.email ILIKE ${like}${
        digits.length >= 3
          ? Prisma.sql` OR regexp_replace(COALESCE(book.phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`
          : Prisma.empty
      })`
    : Prisma.empty
  const after = cursor
    ? Prisma.sql`AND (book."lastSeenAt", book.id) < (${new Date(cursor.t)}, ${cursor.id})`
    : Prisma.empty
  const filter =
    input.currencyCode && input.filter && input.filter !== "all"
      ? Prisma.sql`JOIN LATERAL (${balanceLateral(Prisma.sql`book."customerId"`, t, input.currencyCode)}) fb ON ${
          input.filter === "owe"
            ? Prisma.sql`fb.owed > 0 AND fb.net > 0`
            : Prisma.sql`fb.ahead > 0 AND fb.net < 0`
        }`
      : Prisma.empty
  const balance = input.currencyCode
    ? Prisma.sql`LEFT JOIN LATERAL (${balanceLateral(Prisma.sql`p."customerId"`, t, input.currencyCode)}) b ON TRUE`
    : Prisma.sql`LEFT JOIN LATERAL (SELECT NULL::bigint AS owed, NULL::bigint AS ahead, NULL::bigint AS net WHERE FALSE) b ON TRUE`
  const unordered = input.includeSavedCustomers
    ? Prisma.sql`
      UNION ALL
      SELECT 'customer:' || c.id, c.id,
        CASE WHEN NULLIF(c.phone, '') IS NOT NULL THEN 'phone' WHEN NULLIF(c.email, '') IS NOT NULL THEN 'email' ELSE 'name' END,
        c.name, NULLIF(c.phone, ''), NULLIF(c.email, ''), 0, '0', c."createdAt", c."createdAt",
        NULL, NULL, NULL, NULL::int
      FROM "Customer" c
      WHERE c."tenantId" = ${t}
        AND NOT EXISTS (SELECT 1 FROM grouped g WHERE g."customerId" = c.id)`
    : Prisma.empty

  const rows = await db.$queryRaw<
    Array<{
      id: string
      customerId: string | null
      identityType: CustomerBookPageRow["identityType"]
      name: string | null
      phone: string | null
      email: string | null
      orderCount: number
      totalMinor: string
      firstSeenAt: Date
      lastSeenAt: Date
      lastOrderNumber: string | null
      lastOrderPaymentStatus: string | null
      lastOrderStatus: string | null
      lastOrderTotalMinor: number | null
      owed: string | null
      ahead: string | null
      net: string | null
    }>
  >(Prisma.sql`
    WITH saved_phone AS (
      SELECT DISTINCT ON (k) k, id FROM (
        SELECT ${phoneKey(Prisma.sql`phone`)} AS k, id, "createdAt" FROM "Customer" WHERE "tenantId" = ${t}
      ) s WHERE k IS NOT NULL ORDER BY k, "createdAt" DESC, id ASC
    ), saved_email AS (
      SELECT DISTINCT ON (k) k, id FROM (
        SELECT ${emailKey(Prisma.sql`email`)} AS k, id, "createdAt" FROM "Customer" WHERE "tenantId" = ${t}
      ) s WHERE k IS NOT NULL ORDER BY k, "createdAt" DESC, id ASC
    ), orders AS (
      SELECT o.id, o."orderNumber", o."paymentStatus"::text AS "paymentStatus", o.status::text AS status,
        o."totalMinor", o."createdAt", o."customerName", o."customerPhone", o."customerEmail",
        COALESCE(o."customerId", sp.id, se.id) AS "resolvedId"
      FROM "CommercialOrder" o
      LEFT JOIN saved_phone sp ON o."customerId" IS NULL AND sp.k = ${phoneKey(Prisma.sql`o."customerPhone"`)}
      LEFT JOIN saved_email se ON o."customerId" IS NULL AND se.k = ${emailKey(Prisma.sql`o."customerEmail"`)}
      WHERE o."tenantId" = ${t} AND o."storeId" = ${input.storeId}
        ${input.createdByUserId ? Prisma.sql`AND o."createdByUserId" = ${input.createdByUserId}` : Prisma.empty}
    ), keyed AS (
      SELECT *, COALESCE(
        'customer:' || "resolvedId",
        NULLIF(LOWER(BTRIM(COALESCE(NULLIF("customerPhone", ''), NULLIF("customerEmail", ''), NULLIF("customerName", '')))), ''),
        'walk-in:all'
      ) AS "identityKey"
      FROM orders
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY "identityKey" ORDER BY "createdAt" DESC, id DESC) AS rk
      FROM keyed
    ), grouped AS (
      SELECT "identityKey",
        COUNT(*)::int AS "orderCount",
        SUM("totalMinor")::text AS "totalMinor",
        MIN("createdAt") AS "firstSeenAt",
        MAX("createdAt") AS "lastSeenAt",
        MAX("customerName") FILTER (WHERE rk = 1) AS "customerName",
        MAX("customerPhone") FILTER (WHERE rk = 1) AS "customerPhone",
        MAX("customerEmail") FILTER (WHERE rk = 1) AS "customerEmail",
        MAX("orderNumber") FILTER (WHERE rk = 1) AS "lastOrderNumber",
        MAX("paymentStatus") FILTER (WHERE rk = 1) AS "lastOrderPaymentStatus",
        MAX(status) FILTER (WHERE rk = 1) AS "lastOrderStatus",
        MAX("totalMinor") FILTER (WHERE rk = 1) AS "lastOrderTotalMinor",
        MAX("resolvedId") AS "customerId"
      FROM ranked GROUP BY "identityKey"
    ), book AS (
      SELECT g."identityKey" AS id, g."customerId",
        CASE
          WHEN g."identityKey" = 'walk-in:all' THEN 'walk-in'
          WHEN COALESCE(NULLIF(c.phone, ''), NULLIF(g."customerPhone", '')) IS NOT NULL THEN 'phone'
          WHEN COALESCE(NULLIF(c.email, ''), NULLIF(g."customerEmail", '')) IS NOT NULL THEN 'email'
          ELSE 'name'
        END AS "identityType",
        COALESCE(NULLIF(c.name, ''), g."customerName") AS name,
        COALESCE(NULLIF(c.phone, ''), NULLIF(g."customerPhone", '')) AS phone,
        COALESCE(NULLIF(c.email, ''), NULLIF(g."customerEmail", '')) AS email,
        g."orderCount", g."totalMinor", g."firstSeenAt", g."lastSeenAt",
        g."lastOrderNumber", g."lastOrderPaymentStatus", g."lastOrderStatus", g."lastOrderTotalMinor"
      FROM grouped g
      LEFT JOIN "Customer" c ON c.id = g."customerId" AND c."tenantId" = ${t}
      ${unordered}
    )
    SELECT p.*, b.owed::text AS owed, b.ahead::text AS ahead, b.net::text AS net
    FROM (
      SELECT book.* FROM book
      ${filter}
      WHERE TRUE ${search} ${after}
      ORDER BY book."lastSeenAt" DESC, book.id DESC
      LIMIT ${limit + 1}
    ) p
    ${balance}
    ORDER BY p."lastSeenAt" DESC, p.id DESC
  `)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return {
    rows: page.map((row) => {
      const walkIn = row.identityType === "walk-in"
      return {
        customerId: row.customerId,
        email: row.email,
        firstSeenAt: row.firstSeenAt,
        id: row.id,
        identityType: row.identityType,
        lastOrder: row.lastOrderNumber
          ? {
              createdAt: row.lastSeenAt,
              orderNumber: row.lastOrderNumber,
              paymentStatus: row.lastOrderPaymentStatus ?? "",
              status: row.lastOrderStatus ?? "",
              totalMinor: Number(row.lastOrderTotalMinor ?? 0),
            }
          : null,
        lastSeenAt: row.lastSeenAt,
        name: walkIn
          ? "Walk-in sales"
          : row.name || row.phone || row.email || "Walk-in customer",
        orderCount: Number(row.orderCount),
        phone: row.phone,
        totalMinor: row.totalMinor,
        balance:
          row.owed !== null && row.ahead !== null && row.net !== null
            ? {
                owedMinor: row.owed,
                paidAheadMinor: row.ahead,
                netMinor: row.net,
              }
            : null,
      }
    }),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ t: last.lastSeenAt.toISOString(), id: last.id })
        : null,
  }
}

/**
 * "Owed to you" for the Customers page: total net owed and how many customers
 * owe, over every customer account in one currency, in one statement.
 */
export async function getCustomerBookOwedSummary(
  db: Pick<PrismaClient, "$queryRaw">,
  input: { tenantId: string; currencyCode: string },
) {
  const [row] = await db.$queryRaw<Array<{ owing: number; owed: string }>>(
    Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE b.owed > 0 AND b.net > 0)::int AS owing,
        COALESCE(SUM(b.net) FILTER (WHERE b.owed > 0 AND b.net > 0), 0)::text AS owed
      FROM "CustomerLedgerAccount" acc
      JOIN LATERAL (${balanceLateral(Prisma.sql`acc."customerId"`, input.tenantId, input.currencyCode)}) b ON TRUE
      WHERE acc."tenantId" = ${input.tenantId} AND acc."currencyCode" = ${input.currencyCode}
    `,
  )
  return { owingCount: Number(row?.owing ?? 0), owedMinor: row?.owed ?? "0" }
}
