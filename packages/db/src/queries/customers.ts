import type { Prisma, PrismaClient } from "../../generated/prisma/client"
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

export async function createCustomer(
  db: PrismaClient,
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

export async function listCustomersPage(
  db: PrismaClient,
  input: {
    cursor?: string
    limit?: number
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
