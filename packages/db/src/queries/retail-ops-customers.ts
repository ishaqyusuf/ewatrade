import { createHash } from "node:crypto"

import { Prisma } from "../generated/prisma/client"
import {
  RetailOpsCustomerEventType as DurableRetailOpsCustomerEventType,
  RetailOpsCustomerIdentityType as DurableRetailOpsCustomerIdentityType,
} from "../generated/prisma/enums"
import type { DbClient } from "./types"

export type RetailOpsCustomerIdentityType = "email" | "name" | "phone"

export type RetailOpsCustomerBookEntry = {
  email: string | null
  firstSeenAt: Date
  id: string
  identityType: RetailOpsCustomerIdentityType
  lastOrder: {
    createdAt: Date
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  lastSeenAt: Date
  name: string
  orderCount: number
  phone: string | null
  totalMinor: number
}

export type RetailOpsCustomerBookInput = {
  actorUserId?: string
  limit?: number
  search?: string
  storeId: string
  tenantId: string
}

export type RecordRetailOpsCustomerUpsertInput = {
  actorUserId?: string
  email?: string
  externalId?: string
  lastSaleExternalId: string
  lastSeenAt?: Date
  name: string
  phone?: string
  storeId: string
  tenantId: string
}

export type RecordRetailOpsSharedLinkCustomerInput = {
  actorUserId?: string
  customerAccountId?: string | null
  email: string
  name: string
  orderId: string
  phone?: string | null
  storeId: string
  tenantId: string
}

export type RecordedRetailOpsCustomerUpsert = {
  customer: {
    email: string | null
    id: string
    identityType: RetailOpsCustomerIdentityType
    lastSeenAt: Date
    name: string
    phone: string | null
  }
  externalId: string | null
  source: {
    orderId: string
    orderNumber: string
    saleExternalId: string
  }
}

type RetailOpsCustomerErrorCode = "SOURCE_SALE_NOT_FOUND"
type RetailOpsCustomerBookEntryWithKey = RetailOpsCustomerBookEntry & {
  identityKey: string
}
type RetailOpsCustomerSourceOrder = {
  createdAt: Date
  id: string
  orderNumber: string
  retailOpsCustomerId: string | null
  totalMinor: number
}
type DurableRetailOpsCustomerEventTypeValue =
  (typeof DurableRetailOpsCustomerEventType)[keyof typeof DurableRetailOpsCustomerEventType]

export class RetailOpsCustomerError extends Error {
  code: RetailOpsCustomerErrorCode

  constructor(code: RetailOpsCustomerErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsCustomerError"
    this.code = code
  }
}

function cleanOptionalText(value: string | null | undefined) {
  const cleaned = value?.trim()

  return cleaned ? cleaned : null
}

function normalizeEmail(value: string | null | undefined) {
  return cleanOptionalText(value)?.toLowerCase() ?? null
}

function normalizeName(value: string | null | undefined) {
  return cleanOptionalText(value)?.replace(/\s+/g, " ") ?? null
}

function normalizePhoneKey(value: string) {
  return value.replace(/[^\d+]/g, "")
}

function normalizePhone(value: string | null | undefined) {
  const phone = cleanOptionalText(value)

  return phone ? normalizePhoneKey(phone) : null
}

function normalizeNameKey(value: string | null | undefined) {
  return normalizeName(value)?.toLowerCase() ?? null
}

function getCustomerIdentity(input: {
  email: string | null
  name: string | null
  phone: string | null
}) {
  if (input.email) {
    return {
      identityType: "email" as const,
      key: `email:${input.email}`,
    }
  }

  const phoneKey = input.phone ? normalizePhoneKey(input.phone) : null

  if (phoneKey) {
    return {
      identityType: "phone" as const,
      key: `phone:${phoneKey}`,
    }
  }

  if (input.name) {
    return {
      identityType: "name" as const,
      key: `name:${input.name.toLowerCase()}`,
    }
  }

  return null
}

function createCustomerBookId(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 24)
}

function isDurableCustomerTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function normalizeExternalId(externalId: string | undefined) {
  const trimmed = externalId?.trim()

  return trimmed || null
}

function getRecordField(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function getStringField(value: unknown) {
  return typeof value === "string" ? value : null
}

function getRetailOpsOrderMetadata(metadata: unknown) {
  const root = getRecordField(metadata)
  const retailOps = getRecordField(root?.retailOps)

  return {
    actorUserId: getStringField(retailOps?.actorUserId),
    shareLinkCreatorUserId: getStringField(retailOps?.shareLinkCreatorUserId),
    source: getStringField(retailOps?.source),
  }
}

function matchesActorScope(
  metadata: ReturnType<typeof getRetailOpsOrderMetadata>,
  actorUserId?: string,
) {
  if (!actorUserId) return true

  if (
    metadata.source === "retail_ops_sale" &&
    metadata.actorUserId === actorUserId
  ) {
    return true
  }

  return (
    metadata.source === "retail_ops_share_link_order_request" &&
    metadata.shareLinkCreatorUserId === actorUserId
  )
}

function matchesSearch(
  input: {
    email: string | null
    name: string | null
    phone: string | null
  },
  search?: string,
) {
  if (!search) return true

  const normalizedSearch = search.toLowerCase()
  const haystack = [input.name, input.email, input.phone]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return haystack.includes(normalizedSearch)
}

function getDisplayName(input: {
  current: RetailOpsCustomerBookEntry
  nextName: string | null
}) {
  if (
    input.nextName &&
    (input.current.name === input.current.email ||
      input.current.name === input.current.phone ||
      input.current.name === "Customer")
  ) {
    return input.nextName
  }

  return input.current.name
}

function getIdentityTypeFromKey(
  identityKey: string,
): RetailOpsCustomerIdentityType {
  if (identityKey.startsWith("email:")) return "email"
  if (identityKey.startsWith("phone:")) return "phone"

  return "name"
}

function getCustomerIdentityRows(input: {
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  customerAccountId?: string | null
  primaryIdentity: ReturnType<typeof getCustomerIdentity>
}) {
  const rows: Array<{
    isPrimary: boolean
    normalizedValue: string
    type: (typeof DurableRetailOpsCustomerIdentityType)[keyof typeof DurableRetailOpsCustomerIdentityType]
    value: string
  }> = []

  if (input.customer.email) {
    rows.push({
      isPrimary: input.primaryIdentity?.identityType === "email",
      normalizedValue: input.customer.email,
      type: DurableRetailOpsCustomerIdentityType.EMAIL,
      value: input.customer.email,
    })
  }

  const phoneKey = input.customer.phone
    ? normalizePhoneKey(input.customer.phone)
    : null

  if (input.customer.phone && phoneKey) {
    rows.push({
      isPrimary: input.primaryIdentity?.identityType === "phone",
      normalizedValue: phoneKey,
      type: DurableRetailOpsCustomerIdentityType.PHONE,
      value: input.customer.phone,
    })
  }

  const nameKey = normalizeNameKey(input.customer.name)

  if (input.customer.name && nameKey) {
    rows.push({
      isPrimary: input.primaryIdentity?.identityType === "name",
      normalizedValue: nameKey,
      type: DurableRetailOpsCustomerIdentityType.NAME,
      value: input.customer.name,
    })
  }

  const customerAccountId = cleanOptionalText(input.customerAccountId)

  if (customerAccountId) {
    rows.push({
      isPrimary: false,
      normalizedValue: customerAccountId,
      type: DurableRetailOpsCustomerIdentityType.PLATFORM_ACCOUNT,
      value: customerAccountId,
    })
  }

  return rows
}

function getLastOrderFromCustomerRow(input: {
  customerId: string
  lastOrderId: string | null
  lastOrderNumber: string | null
  lastSeenAt: Date
  orders: Array<{
    createdAt: Date
    id: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }>
}) {
  const lastOrder = input.orders[0]

  if (lastOrder) return lastOrder

  return {
    createdAt: input.lastSeenAt,
    id: input.lastOrderId ?? input.customerId,
    orderNumber: input.lastOrderNumber ?? "Customer profile",
    paymentStatus: "UNKNOWN",
    status: "CUSTOMER_PROFILE",
    totalMinor: 0,
  }
}

function mergeCustomerBookEntries(
  current: RetailOpsCustomerBookEntryWithKey,
  next: RetailOpsCustomerBookEntryWithKey,
): RetailOpsCustomerBookEntryWithKey {
  const lastOrder =
    next.lastOrder.createdAt > current.lastOrder.createdAt
      ? next.lastOrder
      : current.lastOrder

  return {
    ...current,
    ...next,
    email: next.email ?? current.email,
    firstSeenAt:
      next.firstSeenAt < current.firstSeenAt
        ? next.firstSeenAt
        : current.firstSeenAt,
    identityKey: next.identityKey,
    lastOrder,
    lastSeenAt:
      next.lastSeenAt > current.lastSeenAt
        ? next.lastSeenAt
        : current.lastSeenAt,
    name: getDisplayName({ current: next, nextName: current.name }),
    orderCount: Math.max(current.orderCount, next.orderCount),
    phone: next.phone ?? current.phone,
    totalMinor: Math.max(current.totalMinor, next.totalMinor),
  }
}

function mergeCustomerBookSources(input: {
  durableEntries: RetailOpsCustomerBookEntryWithKey[]
  limit: number
  orderEntries: RetailOpsCustomerBookEntryWithKey[]
}) {
  const byIdentity = new Map<string, RetailOpsCustomerBookEntryWithKey>()

  for (const entry of input.orderEntries) {
    byIdentity.set(entry.identityKey, entry)
  }

  for (const entry of input.durableEntries) {
    const current = byIdentity.get(entry.identityKey)
    byIdentity.set(
      entry.identityKey,
      current ? mergeCustomerBookEntries(current, entry) : entry,
    )
  }

  return Array.from(byIdentity.values())
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .slice(0, input.limit)
}

function toPublicCustomerBookEntries(
  entries: RetailOpsCustomerBookEntryWithKey[],
): RetailOpsCustomerBookEntry[] {
  return entries.map(({ identityKey: _identityKey, ...entry }) => entry)
}

async function getDurableRetailOpsCustomerBook(
  db: DbClient,
  input: RetailOpsCustomerBookInput,
  limit: number,
): Promise<RetailOpsCustomerBookEntryWithKey[] | null> {
  const search = input.search?.trim().toLowerCase()
  const normalizedPhoneSearch = search ? normalizePhoneKey(search) : null
  const where: Prisma.RetailOpsCustomerWhereInput = {
    mergedIntoCustomerId: null,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }

  if (input.actorUserId) {
    where.events = {
      some: {
        actorUserId: input.actorUserId,
      },
    }
  }

  if (search) {
    where.OR = [
      { normalizedEmail: { contains: search } },
      { normalizedName: { contains: search } },
      { email: { contains: search } },
      { name: { contains: input.search } },
      ...(normalizedPhoneSearch
        ? [
            { normalizedPhone: { contains: normalizedPhoneSearch } },
            { phone: { contains: input.search } },
          ]
        : []),
    ]
  }

  try {
    const customers = await db.retailOpsCustomer.findMany({
      orderBy: { lastSeenAt: "desc" },
      select: {
        email: true,
        firstSeenAt: true,
        id: true,
        identities: {
          orderBy: { isPrimary: "desc" },
          select: { type: true },
          take: 1,
        },
        identityKey: true,
        lastOrderId: true,
        lastOrderNumber: true,
        lastSeenAt: true,
        name: true,
        orderCount: true,
        orders: {
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            id: true,
            orderNumber: true,
            paymentStatus: true,
            status: true,
            totalMinor: true,
          },
          take: 1,
        },
        phone: true,
        totalMinor: true,
      },
      take: limit,
      where,
    })

    return customers.map((customer) => {
      const lastOrder = getLastOrderFromCustomerRow({
        customerId: customer.id,
        lastOrderId: customer.lastOrderId,
        lastOrderNumber: customer.lastOrderNumber,
        lastSeenAt: customer.lastSeenAt,
        orders: customer.orders,
      })
      const identityType =
        customer.identities[0]?.type === DurableRetailOpsCustomerIdentityType.EMAIL
          ? "email"
          : customer.identities[0]?.type ===
              DurableRetailOpsCustomerIdentityType.PHONE
            ? "phone"
            : getIdentityTypeFromKey(customer.identityKey)

      return {
        email: customer.email,
        firstSeenAt: customer.firstSeenAt,
        id: customer.id,
        identityKey: customer.identityKey,
        identityType,
        lastOrder,
        lastSeenAt: customer.lastSeenAt,
        name: customer.name,
        orderCount: customer.orderCount,
        phone: customer.phone,
        totalMinor: customer.totalMinor,
      }
    })
  } catch (error) {
    if (isDurableCustomerTableUnavailable(error)) return null
    throw error
  }
}

async function getOrderDerivedRetailOpsCustomerBook(
  db: DbClient,
  input: RetailOpsCustomerBookInput,
  limit: number,
): Promise<RetailOpsCustomerBookEntryWithKey[]> {
  const orderLookbackLimit = Math.max(limit * 10, 250)
  const orders = await db.order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: { not: "CANCELLED" },
      OR: [
        { customerEmail: { not: null } },
        { customerName: { not: null } },
        { customerPhone: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: orderLookbackLimit,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      totalMinor: true,
      createdAt: true,
      metadata: true,
    },
  })

  const grouped = new Map<string, RetailOpsCustomerBookEntryWithKey>()

  for (const order of orders) {
    const metadata = getRetailOpsOrderMetadata(order.metadata)

    if (!matchesActorScope(metadata, input.actorUserId)) {
      continue
    }

    const customer = {
      email: normalizeEmail(order.customerEmail),
      name: normalizeName(order.customerName),
      phone: cleanOptionalText(order.customerPhone),
    }

    if (!matchesSearch(customer, input.search)) {
      continue
    }

    const identity = getCustomerIdentity(customer)

    if (!identity) {
      continue
    }

    const current = grouped.get(identity.key)

    if (!current) {
      grouped.set(identity.key, {
        email: customer.email,
        firstSeenAt: order.createdAt,
        id: createCustomerBookId(identity.key),
        identityKey: identity.key,
        identityType: identity.identityType,
        lastOrder: {
          createdAt: order.createdAt,
          id: order.id,
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          status: order.status,
          totalMinor: order.totalMinor,
        },
        lastSeenAt: order.createdAt,
        name: customer.name ?? customer.email ?? customer.phone ?? "Customer",
        orderCount: 1,
        phone: customer.phone,
        totalMinor: order.totalMinor,
      })
      continue
    }

    grouped.set(identity.key, {
      ...current,
      email: current.email ?? customer.email,
      firstSeenAt:
        order.createdAt < current.firstSeenAt
          ? order.createdAt
          : current.firstSeenAt,
      name: getDisplayName({ current, nextName: customer.name }),
      orderCount: current.orderCount + 1,
      phone: current.phone ?? customer.phone,
      totalMinor: current.totalMinor + order.totalMinor,
    })
  }

  return Array.from(grouped.values()).slice(0, limit)
}

export async function getRetailOpsCustomerBook(
  db: DbClient,
  input: RetailOpsCustomerBookInput,
): Promise<RetailOpsCustomerBookEntry[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const [durableEntries, orderEntries] = await Promise.all([
    getDurableRetailOpsCustomerBook(db, input, limit),
    getOrderDerivedRetailOpsCustomerBook(db, input, limit),
  ])
  const mergedEntries = mergeCustomerBookSources({
    durableEntries: durableEntries ?? [],
    limit,
    orderEntries,
  })

  return toPublicCustomerBookEntries(mergedEntries)
}

function getRetailOpsCustomerMetadata(input: {
  externalId: string | null
  identityKey: string
  saleExternalId: string
}) {
  return {
    externalId: input.externalId,
    identityKey: input.identityKey,
    saleExternalId: input.saleExternalId,
    source: "customer_upsert",
  } satisfies Prisma.InputJsonObject
}

function getRetailOpsSharedLinkCustomerMetadata(input: {
  customerAccountId: string | null
  identityKey: string
  orderId: string
}) {
  return {
    customerAccountId: input.customerAccountId,
    identityKey: input.identityKey,
    orderId: input.orderId,
    source: "shared_link_order_request",
  } satisfies Prisma.InputJsonObject
}

async function createRetailOpsCustomerIdentityRows(
  db: DbClient,
  input: {
    customer: {
      email: string | null
      name: string | null
      phone: string | null
    }
    customerAccountId?: string | null
    customerId: string
    primaryIdentity: ReturnType<typeof getCustomerIdentity>
    storeId: string
    tenantId: string
  },
) {
  const identities = getCustomerIdentityRows({
    customer: input.customer,
    customerAccountId: input.customerAccountId,
    primaryIdentity: input.primaryIdentity,
  })

  if (identities.length === 0) return

  await db.retailOpsCustomerIdentity.createMany({
    data: identities.map((identity) => ({
      ...identity,
      customerId: input.customerId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })),
    skipDuplicates: true,
  })
}

async function recordDurableRetailOpsCustomerFromOrder(
  db: DbClient,
  input: {
    actorUserId?: string
    customer: {
      email: string | null
      name: string | null
      phone: string | null
    }
    customerAccountId?: string | null
    eventMetadata: Prisma.InputJsonObject
    eventType?: DurableRetailOpsCustomerEventTypeValue
    happenedAt?: Date
    identity: NonNullable<ReturnType<typeof getCustomerIdentity>>
    sourceOrder: RetailOpsCustomerSourceOrder
    storeId: string
    tenantId: string
  },
): Promise<RecordedRetailOpsCustomerUpsert["customer"] | null> {
  const happenedAt = input.happenedAt ?? new Date()
  const normalizedName = normalizeNameKey(input.customer.name)
  const normalizedPhone = normalizePhone(input.customer.phone)
  const displayName =
    input.customer.name ??
    input.customer.email ??
    input.customer.phone ??
    "Customer"

  try {
    const existingCustomer = await db.retailOpsCustomer.findUnique({
      select: {
        customerAccountId: true,
        email: true,
        firstSeenAt: true,
        id: true,
        lastOrderId: true,
        lastSeenAt: true,
        name: true,
        orderCount: true,
        phone: true,
        totalMinor: true,
      },
      where: {
        tenantId_storeId_identityKey: {
          identityKey: input.identity.key,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    })
    const shouldAttachOrder =
      !input.sourceOrder.retailOpsCustomerId ||
      input.sourceOrder.retailOpsCustomerId === existingCustomer?.id
    const orderAlreadyLinked =
      input.sourceOrder.retailOpsCustomerId === existingCustomer?.id
    const shouldCountOrder = shouldAttachOrder && !orderAlreadyLinked
    const nextLastSeenAt =
      existingCustomer && existingCustomer.lastSeenAt > happenedAt
        ? existingCustomer.lastSeenAt
        : happenedAt
    const nextFirstSeenAt =
      existingCustomer &&
      existingCustomer.firstSeenAt < input.sourceOrder.createdAt
        ? existingCustomer.firstSeenAt
        : input.sourceOrder.createdAt
    const nextLastOrder =
      existingCustomer?.lastOrderId &&
      existingCustomer.lastSeenAt > input.sourceOrder.createdAt
        ? {
            id: existingCustomer.lastOrderId,
            number: undefined,
          }
        : {
            id: input.sourceOrder.id,
            number: input.sourceOrder.orderNumber,
          }

    const persistedCustomer = existingCustomer
      ? await db.retailOpsCustomer.update({
          data: {
            customerAccountId:
              existingCustomer.customerAccountId ??
              cleanOptionalText(input.customerAccountId),
            email: existingCustomer.email ?? input.customer.email,
            firstSeenAt: nextFirstSeenAt,
            lastOrderId: nextLastOrder.id,
            ...(nextLastOrder.number
              ? { lastOrderNumber: nextLastOrder.number }
              : {}),
            lastSeenAt: nextLastSeenAt,
            name: getDisplayName({
              current: {
                email: existingCustomer.email,
                firstSeenAt: existingCustomer.firstSeenAt,
                id: existingCustomer.id,
                identityType: input.identity.identityType,
                lastOrder: {
                  createdAt: existingCustomer.lastSeenAt,
                  id: existingCustomer.lastOrderId ?? existingCustomer.id,
                  orderNumber: "Customer profile",
                  paymentStatus: "UNKNOWN",
                  status: "CUSTOMER_PROFILE",
                  totalMinor: 0,
                },
                lastSeenAt: existingCustomer.lastSeenAt,
                name: existingCustomer.name,
                orderCount: existingCustomer.orderCount,
                phone: existingCustomer.phone,
                totalMinor: existingCustomer.totalMinor,
              },
              nextName: input.customer.name,
            }),
            normalizedEmail: existingCustomer.email
              ? normalizeEmail(existingCustomer.email)
              : input.customer.email,
            normalizedName,
            normalizedPhone: existingCustomer.phone
              ? normalizePhone(existingCustomer.phone)
              : normalizedPhone,
            orderCount: shouldCountOrder
              ? { increment: 1 }
              : existingCustomer.orderCount,
            phone: existingCustomer.phone ?? input.customer.phone,
            totalMinor: shouldCountOrder
              ? { increment: input.sourceOrder.totalMinor }
              : existingCustomer.totalMinor,
          },
          select: {
            email: true,
            id: true,
            lastSeenAt: true,
            name: true,
            phone: true,
          },
          where: { id: existingCustomer.id },
        })
      : await db.retailOpsCustomer.create({
          data: {
            createdByUserId: input.actorUserId,
            customerAccountId: cleanOptionalText(input.customerAccountId),
            email: input.customer.email,
            firstSeenAt: input.sourceOrder.createdAt,
            identityKey: input.identity.key,
            lastOrderId: input.sourceOrder.id,
            lastOrderNumber: input.sourceOrder.orderNumber,
            lastSeenAt: happenedAt,
            name: displayName,
            normalizedEmail: input.customer.email,
            normalizedName,
            normalizedPhone,
            orderCount: shouldAttachOrder ? 1 : 0,
            phone: input.customer.phone,
            storeId: input.storeId,
            tenantId: input.tenantId,
            totalMinor: shouldAttachOrder ? input.sourceOrder.totalMinor : 0,
          },
          select: {
            email: true,
            id: true,
            lastSeenAt: true,
            name: true,
            phone: true,
          },
        })

    await createRetailOpsCustomerIdentityRows(db, {
      customer: input.customer,
      customerAccountId: input.customerAccountId,
      customerId: persistedCustomer.id,
      primaryIdentity: input.identity,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })

    if (shouldAttachOrder) {
      await db.order.update({
        data: { retailOpsCustomerId: persistedCustomer.id },
        where: { id: input.sourceOrder.id },
      })
    }

    await db.retailOpsCustomerEvent.create({
      data: {
        actorUserId: input.actorUserId,
        customerId: persistedCustomer.id,
        happenedAt,
        metadata: input.eventMetadata,
        orderId: input.sourceOrder.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type:
          input.eventType ??
          (existingCustomer
            ? DurableRetailOpsCustomerEventType.UPDATED
            : DurableRetailOpsCustomerEventType.CREATED),
      },
    })

    return {
      email: persistedCustomer.email,
      id: persistedCustomer.id,
      identityType: input.identity.identityType,
      lastSeenAt: persistedCustomer.lastSeenAt,
      name: persistedCustomer.name,
      phone: persistedCustomer.phone,
    }
  } catch (error) {
    if (isDurableCustomerTableUnavailable(error)) return null
    throw error
  }
}

async function recordDurableRetailOpsCustomerUpsert(
  db: DbClient,
  input: RecordRetailOpsCustomerUpsertInput,
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  },
  identity: NonNullable<ReturnType<typeof getCustomerIdentity>>,
  sourceOrder: RetailOpsCustomerSourceOrder,
): Promise<RecordedRetailOpsCustomerUpsert | null> {
  const externalId = normalizeExternalId(input.externalId)
  const persistedCustomer = await recordDurableRetailOpsCustomerFromOrder(db, {
    actorUserId: input.actorUserId,
    customer,
    eventMetadata: getRetailOpsCustomerMetadata({
      externalId,
      identityKey: identity.key,
      saleExternalId: input.lastSaleExternalId.trim(),
    }),
    happenedAt: input.lastSeenAt,
    identity,
    sourceOrder,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  if (!persistedCustomer) return null

  return {
    customer: persistedCustomer,
    externalId,
    source: {
      orderId: sourceOrder.id,
      orderNumber: sourceOrder.orderNumber,
      saleExternalId: input.lastSaleExternalId.trim(),
    },
  }
}

export async function recordRetailOpsCustomerUpsert(
  db: DbClient,
  input: RecordRetailOpsCustomerUpsertInput,
): Promise<RecordedRetailOpsCustomerUpsert> {
  const customer = {
    email: normalizeEmail(input.email),
    name: normalizeName(input.name),
    phone: cleanOptionalText(input.phone),
  }
  const identity = getCustomerIdentity(customer)
  const lastSaleExternalId = input.lastSaleExternalId.trim()

  const sourceOrder = await db.order.findFirst({
    where: {
      AND: [
        {
          metadata: {
            path: ["retailOps", "source"],
            equals: "retail_ops_sale",
          },
        },
        {
          metadata: {
            path: ["retailOps", "externalId"],
            equals: lastSaleExternalId,
          },
        },
      ],
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      retailOpsCustomerId: true,
      totalMinor: true,
    },
  })

  if (!sourceOrder || !identity) {
    throw new RetailOpsCustomerError(
      "SOURCE_SALE_NOT_FOUND",
      "Synced sale not found for this customer yet.",
    )
  }

  const durableResult = await recordDurableRetailOpsCustomerUpsert(
    db,
    input,
    customer,
    identity,
    sourceOrder,
  )

  if (durableResult) return durableResult

  return {
    customer: {
      email: customer.email,
      id: createCustomerBookId(identity.key),
      identityType: identity.identityType,
      lastSeenAt: input.lastSeenAt ?? new Date(),
      name: customer.name ?? customer.email ?? customer.phone ?? "Customer",
      phone: customer.phone,
    },
    externalId: normalizeExternalId(input.externalId),
    source: {
      orderId: sourceOrder.id,
      orderNumber: sourceOrder.orderNumber,
      saleExternalId: lastSaleExternalId,
    },
  }
}

export async function recordRetailOpsSharedLinkCustomer(
  db: DbClient,
  input: RecordRetailOpsSharedLinkCustomerInput,
) {
  const customer = {
    email: normalizeEmail(input.email),
    name: normalizeName(input.name),
    phone: cleanOptionalText(input.phone),
  }
  const identity = getCustomerIdentity(customer)

  if (!identity) return null

  const sourceOrder = await db.order.findFirst({
    where: {
      id: input.orderId,
      metadata: {
        path: ["retailOps", "source"],
        equals: "retail_ops_share_link_order_request",
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      createdAt: true,
      id: true,
      orderNumber: true,
      retailOpsCustomerId: true,
      totalMinor: true,
    },
  })

  if (!sourceOrder) return null

  return recordDurableRetailOpsCustomerFromOrder(db, {
    actorUserId: input.actorUserId,
    customer,
    customerAccountId: input.customerAccountId,
    eventMetadata: getRetailOpsSharedLinkCustomerMetadata({
      customerAccountId: cleanOptionalText(input.customerAccountId),
      identityKey: identity.key,
      orderId: sourceOrder.id,
    }),
    eventType: DurableRetailOpsCustomerEventType.ORDER_REQUESTED,
    happenedAt: sourceOrder.createdAt,
    identity,
    sourceOrder,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
}
