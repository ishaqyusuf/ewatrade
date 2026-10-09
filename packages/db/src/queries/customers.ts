import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type { DbClient } from "./types"

export class CustomerDirectoryError extends Error {
  constructor(
    readonly code: "DUPLICATE_CUSTOMER",
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
  input: { tenantId: string },
) {
  return db.customer.count({ where: { tenantId: input.tenantId } })
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
