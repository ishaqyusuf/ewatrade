import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { literalContains } from "./literal-contains"
import type { DbClient } from "./types"

export class CustomerDirectoryError extends Error {
  constructor(
    readonly code:
      | "DUPLICATE_CUSTOMER"
      | "CUSTOMER_NOT_FOUND"
      | "STALE_CUSTOMER"
      | "NO_CUSTOMER_CHANGES"
      | "INVALID_CUSTOMER_CURSOR",
    message: string,
  ) {
    super(message)
    this.name = "CustomerDirectoryError"
  }
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() || null
}

function normalizePhone(value: string | undefined) {
  return value?.replace(/[^\d+]/g, "") || null
}

const customerSelect = {
  createdAt: true,
  email: true,
  id: true,
  name: true,
  phone: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect

export async function getCustomerById(
  db: PrismaClient,
  input: { customerId: string; tenantId: string },
) {
  return db.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: customerSelect,
  })
}

export async function createCustomer(
  db: PrismaClient,
  input: Parameters<typeof createCustomerInTransaction>[1],
) {
  return createCustomerInTransaction(db, input)
}

export async function createCustomerInTransaction(
  db: DbClient,
  input: {
    email?: string
    name: string
    phone?: string
    tenantId: string
  },
) {
  const normalizedEmail = normalizeEmail(input.email)
  const normalizedPhone = normalizePhone(input.phone)
  const duplicateConditions: Prisma.CustomerWhereInput[] = []

  if (normalizedEmail) duplicateConditions.push({ normalizedEmail })
  if (normalizedPhone) duplicateConditions.push({ normalizedPhone })

  if (duplicateConditions.length > 0) {
    const existing = await db.customer.findFirst({
      select: customerSelect,
      where: {
        OR: duplicateConditions,
        tenantId: input.tenantId,
      },
    })

    if (existing) {
      throw new CustomerDirectoryError(
        "DUPLICATE_CUSTOMER",
        "A customer with this phone number or email address already exists.",
      )
    }
  }

  return db.customer.create({
    data: {
      email: input.email?.trim() || null,
      name: input.name.trim(),
      normalizedEmail,
      normalizedPhone,
      phone: input.phone?.trim() || null,
      tenantId: input.tenantId,
    },
    select: customerSelect,
  })
}

/** Optimistic-concurrency revision for an editable customer record. */
export function customerRevision(customer: { updatedAt: Date }) {
  return customer.updatedAt.toISOString()
}

export type CustomerFieldChange = {
  field: "name" | "phone" | "email"
  before: string | null
  after: string | null
}

/**
 * Edit directory details only. Orders keep their own saved customer name, so
 * history is never rewritten. `null` clears an optional field; an omitted
 * field is unchanged. Rejects a stale revision, a duplicate phone or email,
 * and a request that changes nothing.
 */
export async function updateCustomerInTransaction(
  db: DbClient,
  input: {
    customerId: string
    tenantId: string
    expectedRevision: string
    name?: string
    phone?: string | null
    email?: string | null
  },
) {
  const current = await db.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: customerSelect,
  })
  if (!current)
    throw new CustomerDirectoryError(
      "CUSTOMER_NOT_FOUND",
      "This customer is unavailable.",
    )
  if (customerRevision(current) !== input.expectedRevision)
    throw new CustomerDirectoryError(
      "STALE_CUSTOMER",
      "This customer changed. Review the latest details and try again.",
    )
  const next = {
    name: input.name === undefined ? current.name : input.name.trim(),
    phone:
      input.phone === undefined ? current.phone : input.phone?.trim() || null,
    email:
      input.email === undefined ? current.email : input.email?.trim() || null,
  }
  const changes = (["name", "phone", "email"] as const).flatMap((field) =>
    (current[field] ?? null) === next[field]
      ? []
      : [{ field, before: current[field] ?? null, after: next[field] }],
  ) satisfies CustomerFieldChange[]
  if (!next.name)
    throw new CustomerDirectoryError(
      "NO_CUSTOMER_CHANGES",
      "A customer needs a name.",
    )
  if (!changes.length)
    throw new CustomerDirectoryError(
      "NO_CUSTOMER_CHANGES",
      "These details already match the customer.",
    )
  const normalizedEmail = normalizeEmail(next.email ?? undefined)
  const normalizedPhone = normalizePhone(next.phone ?? undefined)
  const duplicateConditions: Prisma.CustomerWhereInput[] = []
  if (normalizedEmail) duplicateConditions.push({ normalizedEmail })
  if (normalizedPhone) duplicateConditions.push({ normalizedPhone })
  if (
    duplicateConditions.length > 0 &&
    (await db.customer.findFirst({
      select: { id: true },
      where: {
        OR: duplicateConditions,
        tenantId: input.tenantId,
        id: { not: current.id },
      },
    }))
  )
    throw new CustomerDirectoryError(
      "DUPLICATE_CUSTOMER",
      "Another customer already uses this phone number or email address.",
    )
  try {
    // The revision is rechecked in the write so concurrent edits cannot both win.
    const updated = await db.customer.updateMany({
      where: {
        id: current.id,
        tenantId: input.tenantId,
        updatedAt: current.updatedAt,
      },
      data: { ...next, normalizedEmail, normalizedPhone },
    })
    if (updated.count !== 1)
      throw new CustomerDirectoryError(
        "STALE_CUSTOMER",
        "This customer changed. Review the latest details and try again.",
      )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new CustomerDirectoryError(
        "DUPLICATE_CUSTOMER",
        "Another customer already uses this phone number or email address.",
      )
    throw error
  }
  const customer = await db.customer.findFirstOrThrow({
    where: { id: current.id, tenantId: input.tenantId },
    select: customerSelect,
  })
  return { customer, changes }
}

export async function ensureOrderCustomerInTransaction(
  db: DbClient,
  input: {
    email?: string
    name?: string
    phone?: string
    tenantId: string
  },
) {
  const name = input.name?.trim()
  if (!name) return null

  const normalizedEmail = normalizeEmail(input.email)
  const normalizedPhone = normalizePhone(input.phone)
  const identityConditions: Prisma.CustomerWhereInput[] = []
  const customerData = {
    email: input.email?.trim() || null,
    name,
    normalizedEmail,
    normalizedPhone,
    phone: input.phone?.trim() || null,
    tenantId: input.tenantId,
  }

  if (normalizedEmail) identityConditions.push({ normalizedEmail })
  if (normalizedPhone) identityConditions.push({ normalizedPhone })

  if (identityConditions.length > 0) {
    await db.customer.createMany({
      data: customerData,
      skipDuplicates: true,
    })
    return db.customer.findFirst({
      select: customerSelect,
      where: {
        OR: identityConditions,
        tenantId: input.tenantId,
      },
    })
  }

  const existing = await db.customer.findFirst({
    select: customerSelect,
    where: {
      OR: [{ name: { equals: name, mode: "insensitive" } }],
      tenantId: input.tenantId,
    },
  })
  return (
    existing ??
    db.customer.create({ data: customerData, select: customerSelect })
  )
}

export async function countCustomers(
  db: PrismaClient,
  input: { tenantId: string; query?: string },
) {
  const query = input.query?.trim()
    ? literalContains(input.query.trim())
    : undefined
  return db.customer.count({
    where: {
      tenantId: input.tenantId,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
  })
}

export type CustomerOrderDirectoryAggregate = {
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
  }
  lastSeenAt: Date
  name: string
  orderCount: number
  phone: string | null
  totalMinor: string
}

/**
 * Aggregates the customer book directly from the complete order history for a
 * single tenant store. Search is applied before grouping so the results keep
 * the same search-scoped totals as the dashboard's previous projection.
 */
export async function listCustomerOrderDirectory(
  db: PrismaClient,
  input: {
    createdByUserId?: string
    query?: string
    storeId: string
    tenantId: string
  },
): Promise<CustomerOrderDirectoryAggregate[]> {
  const query = input.query?.trim()
  const searchFilter = query
    ? Prisma.sql`AND (
        "customerName" ILIKE ${`%${query}%`} OR
        "customerPhone" ILIKE ${`%${query}%`} OR
        "customerEmail" ILIKE ${`%${query}%`}
      )`
    : Prisma.empty
  const customerIdentityKey = Prisma.sql`COALESCE(
    NULLIF(
      LOWER(BTRIM(COALESCE(
        NULLIF("customerPhone", ''),
        NULLIF("customerEmail", ''),
        NULLIF("customerName", '')
      ))),
      ''
    ),
    'walk-in:' || "id"
  )`

  const rows = await db.$queryRaw<
    Array<{
      email: string | null
      firstSeenAt: Date
      id: string
      identityType: CustomerOrderDirectoryAggregate["identityType"]
      lastOrderCreatedAt: Date
      lastOrderNumber: string
      lastOrderPaymentStatus: string
      lastOrderStatus: string
      lastOrderTotalMinor: number
      lastSeenAt: Date
      name: string
      orderCount: number
      phone: string | null
      totalMinor: string
    }>
  >(Prisma.sql`
    WITH matching_orders AS (
      SELECT
        "id",
        "orderNumber",
        "paymentStatus"::text AS "paymentStatus",
        "status"::text AS "status",
        "totalMinor",
        "createdAt",
        "customerName",
        "customerPhone",
        "customerEmail",
        ${customerIdentityKey} AS "identityKey",
        ROW_NUMBER() OVER (
          PARTITION BY ${customerIdentityKey}
          ORDER BY "createdAt" DESC, "id" DESC
        ) AS "recentRank"
      FROM "CommercialOrder"
      WHERE "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
        ${input.createdByUserId ? Prisma.sql`AND "createdByUserId" = ${input.createdByUserId}` : Prisma.empty}
        ${searchFilter}
    ), grouped_orders AS (
      SELECT
        "identityKey",
        COUNT(*)::double precision AS "orderCount",
        SUM("totalMinor")::text AS "totalMinor",
        MIN("createdAt") AS "firstSeenAt",
        MAX("createdAt") AS "lastSeenAt",
        MAX("customerName") FILTER (WHERE "recentRank" = 1) AS "customerName",
        MAX("customerPhone") FILTER (WHERE "recentRank" = 1) AS "customerPhone",
        MAX("customerEmail") FILTER (WHERE "recentRank" = 1) AS "customerEmail",
        MAX("orderNumber") FILTER (WHERE "recentRank" = 1) AS "lastOrderNumber",
        MAX("paymentStatus") FILTER (WHERE "recentRank" = 1) AS "lastOrderPaymentStatus",
        MAX("status") FILTER (WHERE "recentRank" = 1) AS "lastOrderStatus",
        MAX("totalMinor") FILTER (WHERE "recentRank" = 1) AS "lastOrderTotalMinor"
      FROM matching_orders
      GROUP BY "identityKey"
    )
    SELECT
      "identityKey" AS "id",
      CASE
        WHEN "identityKey" LIKE 'walk-in:%' THEN 'walk-in'
        WHEN "customerPhone" IS NOT NULL AND "customerPhone" <> '' THEN 'phone'
        WHEN "customerEmail" IS NOT NULL AND "customerEmail" <> '' THEN 'email'
        ELSE 'name'
      END AS "identityType",
      "customerName" AS "name",
      "customerPhone" AS "phone",
      "customerEmail" AS "email",
      "orderCount",
      "totalMinor",
      "firstSeenAt",
      "lastSeenAt",
      "lastSeenAt" AS "lastOrderCreatedAt",
      "lastOrderNumber",
      "lastOrderPaymentStatus",
      "lastOrderStatus",
      "lastOrderTotalMinor"
    FROM grouped_orders
    ORDER BY "lastSeenAt" DESC, "id" ASC
  `)

  return rows.map((row) => ({
    email: row.email,
    firstSeenAt: row.firstSeenAt,
    id: row.id,
    identityType: row.identityType,
    lastOrder: {
      createdAt: row.lastOrderCreatedAt,
      orderNumber: row.lastOrderNumber,
      paymentStatus: row.lastOrderPaymentStatus,
      status: row.lastOrderStatus,
      totalMinor: row.lastOrderTotalMinor,
    },
    lastSeenAt: row.lastSeenAt,
    name: row.name || row.phone || row.email || "Walk-in customer",
    orderCount: row.orderCount,
    phone: row.phone,
    totalMinor: row.totalMinor,
  }))
}

export async function listCustomersPage(
  db: PrismaClient,
  input: {
    cursor?: string
    limit?: number
    createdByUserId?: string
    query?: string
    tenantId: string
  },
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const query = input.query?.trim()
    ? literalContains(input.query.trim())
    : undefined
  const baseWhere: Prisma.CustomerWhereInput = { tenantId: input.tenantId }
  const where: Prisma.CustomerWhereInput = query
    ? {
        ...baseWhere,
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      }
    : baseWhere
  if (input.cursor) {
    const cursor = await db.customer.findFirst({
      where: { AND: [where, { id: input.cursor }] },
      select: { id: true },
    })
    if (!cursor)
      throw new CustomerDirectoryError(
        "INVALID_CUSTOMER_CURSOR",
        "The customer list changed. Refresh to continue.",
      )
  }
  const [records, totalCount] = await Promise.all([
    db.customer.findMany({
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: customerSelect,
      skip: input.cursor ? 1 : 0,
      take: limit + 1,
      where,
    }),
    db.customer.count({ where: baseWhere }),
  ])
  const hasNextPage = records.length > limit
  const items = hasNextPage ? records.slice(0, limit) : records

  return {
    items,
    nextCursor: hasNextPage ? items.at(-1)?.id : undefined,
    totalCount,
  }
}
