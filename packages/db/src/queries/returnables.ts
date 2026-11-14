import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type { ReturnableMovementKind } from "../../generated/prisma/enums"
import { CatalogError } from "./catalog-errors"
import type { OrderScope } from "./order-visibility"
import type { DbClient } from "./types"

export const RETURNABLE_MOVEMENT_MAX_QUANTITY = 100_000
export const RETURNABLE_MOVEMENT_NOTE_MAX_LENGTH = 500

export type ReturnableMovementInput = {
  tenantId: string
  scope: OrderScope
  actorUserId: string
  clientMovementId: string
  customerId: string
  catalogItemId: string
  orderId?: string
  /** Where it was recorded when no order is given; defaults to the scope's Store. */
  storeId?: string
  kind: ReturnableMovementKind
  quantity: number
  note?: string
  source?: "staff" | "assistant"
  occurredAt?: Date
}

const movementSelect = {
  id: true,
  clientMovementId: true,
  payloadHash: true,
  customerId: true,
  catalogItemId: true,
  orderId: true,
  storeId: true,
  kind: true,
  quantity: true,
  occurredAt: true,
  note: true,
  source: true,
  actorUserId: true,
  createdAt: true,
  customer: { select: { name: true } },
  catalogItem: { select: { name: true } },
  order: { select: { orderNumber: true } },
} satisfies Prisma.ReturnableMovementSelect

type MovementRow = Prisma.ReturnableMovementGetPayload<{
  select: typeof movementSelect
}>

function serialize(row: MovementRow) {
  return {
    id: row.id,
    clientMovementId: row.clientMovementId,
    customerId: row.customerId,
    customerName: row.customer.name,
    catalogItemId: row.catalogItemId,
    itemName: row.catalogItem.name,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    storeId: row.storeId,
    kind: row.kind,
    quantity: row.quantity,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note,
    source: row.source,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
  }
}

export type ReturnableMovementRecord = ReturnType<typeof serialize>

function validate(input: ReturnableMovementInput) {
  const clientMovementId = input.clientMovementId.trim()
  const note = input.note?.trim() || undefined
  if (clientMovementId.length < 8 || clientMovementId.length > 160)
    throw new CatalogError(
      "INVALID_RETURNABLE_MOVEMENT",
      "Movement identity must be 8-160 characters.",
    )
  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > RETURNABLE_MOVEMENT_MAX_QUANTITY
  )
    throw new CatalogError(
      "INVALID_RETURNABLE_MOVEMENT",
      "Enter a whole number of items, at least 1.",
    )
  if (note && note.length > RETURNABLE_MOVEMENT_NOTE_MAX_LENGTH)
    throw new CatalogError(
      "INVALID_RETURNABLE_MOVEMENT",
      `Keep the note under ${RETURNABLE_MOVEMENT_NOTE_MAX_LENGTH} characters.`,
    )
  if (input.occurredAt && !Number.isFinite(input.occurredAt.getTime()))
    throw new CatalogError(
      "INVALID_RETURNABLE_MOVEMENT",
      "Choose a valid date.",
    )
  return { clientMovementId, note }
}

function hashPayload(input: ReturnableMovementInput, note?: string) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        catalogItemId: input.catalogItemId,
        customerId: input.customerId,
        kind: input.kind,
        note: note ?? null,
        orderId: input.orderId ?? null,
        quantity: input.quantity,
      }),
    )
    .digest("hex")
}

async function inTransaction<T>(
  db: DbClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return "$transaction" in db
    ? (db as PrismaClient).$transaction(run, {
        maxWait: 10_000,
        timeout: 30_000,
      })
    : run(db)
}

/** Quantity still with the customer: went out minus came back minus written off. */
async function outstanding(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; customerId: string; catalogItemId: string },
) {
  const sums = await tx.returnableMovement.groupBy({
    by: ["kind"],
    _sum: { quantity: true },
    where: input,
  })
  return sums.reduce(
    (total, row) =>
      total + (row.kind === "ISSUED" ? 1 : -1) * (row._sum.quantity ?? 0),
    0,
  )
}

/**
 * Appends one movement; idempotent per client identity. Pass the order
 * creation transaction to issue returnables atomically with an order.
 */
export async function recordReturnableMovement(
  db: DbClient,
  input: ReturnableMovementInput,
): Promise<ReturnableMovementRecord> {
  const { clientMovementId, note } = validate(input)
  const payloadHash = hashPayload(input, note)
  try {
    return await inTransaction(db, async (tx) => {
      const existing = await tx.returnableMovement.findUnique({
        select: movementSelect,
        where: {
          tenantId_clientMovementId: {
            clientMovementId,
            tenantId: input.tenantId,
          },
        },
      })
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new CatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This movement identity was already used with different content.",
          )
        return serialize(existing)
      }
      // One writer per customer at a time, so a return can't overdraw a balance.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Customer"
        WHERE id = ${input.customerId} AND "tenantId" = ${input.tenantId}
        FOR UPDATE`
      if (!locked.length)
        throw new CatalogError("CUSTOMER_NOT_FOUND", "Customer not found.")
      // Shares the lock usage changes take, so the item stays Returnable.
      const items = await tx.$queryRaw<
        Array<{ usage: string; status: string }>
      >`
        SELECT p."usage"::text AS usage, i.status::text AS status
        FROM "CatalogItem" i JOIN "CatalogProduct" p ON p."catalogItemId" = i.id
        WHERE i.id = ${input.catalogItemId} AND i."tenantId" = ${input.tenantId}
        FOR SHARE OF p`
      const item = items[0]
      if (!item || item.usage !== "RETURNABLE")
        throw new CatalogError(
          "RETURNABLE_NOT_FOUND",
          "Choose an item set up as Returnable.",
        )
      let storeId = input.scope.storeId ?? input.storeId ?? null
      if (input.orderId) {
        const order = await tx.commercialOrder.findFirst({
          select: { customerId: true, storeId: true },
          where: {
            ...input.scope,
            id: input.orderId,
            tenantId: input.tenantId,
          },
        })
        if (!order)
          throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
        if (order.customerId !== input.customerId)
          throw new CatalogError(
            "ORDER_CUSTOMER_MISMATCH",
            "That order belongs to another customer.",
          )
        storeId = order.storeId
      }
      if (input.kind === "ISSUED" && item.status === "ARCHIVED")
        throw new CatalogError(
          "RETURNABLE_NOT_FOUND",
          "This returnable is archived. Restore it first.",
        )
      if (input.kind !== "ISSUED") {
        const out = await outstanding(tx, {
          catalogItemId: input.catalogItemId,
          customerId: input.customerId,
          tenantId: input.tenantId,
        })
        if (input.quantity > out)
          throw new CatalogError(
            "RETURNABLE_OVER_BALANCE",
            out
              ? `Only ${out} ${out === 1 ? "is" : "are"} out with this customer.`
              : "Nothing is out with this customer.",
          )
      }
      const created = await tx.returnableMovement.create({
        data: {
          actorUserId: input.actorUserId,
          catalogItemId: input.catalogItemId,
          clientMovementId,
          customerId: input.customerId,
          kind: input.kind,
          note,
          occurredAt: input.occurredAt,
          orderId: input.orderId,
          payloadHash,
          quantity: input.quantity,
          source: input.source ?? "staff",
          storeId,
          tenantId: input.tenantId,
        },
        select: movementSelect,
      })
      return serialize(created)
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      "$transaction" in db
    )
      return recordReturnableMovement(db, input)
    throw error
  }
}

export type ReturnableBalance = {
  customerId: string
  customerName: string
  catalogItemId: string
  itemName: string
  out: number
  /** When the oldest item still out went out (first in, first back). */
  oldestOutAt: string | null
  orderCount: number
}

/** What each customer still holds, per returnable item; outstanding only by default. */
export async function listReturnableBalances(
  db: DbClient,
  input: {
    tenantId: string
    customerId?: string
    catalogItemId?: string
    includeSettled?: boolean
    limit?: number
  },
): Promise<ReturnableBalance[]> {
  const where = {
    tenantId: input.tenantId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.catalogItemId ? { catalogItemId: input.catalogItemId } : {}),
  }
  const sums = await db.returnableMovement.groupBy({
    by: ["customerId", "catalogItemId", "kind"],
    _sum: { quantity: true },
    where,
  })
  const pairs = new Map<
    string,
    { customerId: string; catalogItemId: string; out: number; back: number }
  >()
  for (const row of sums) {
    const key = `${row.customerId}:${row.catalogItemId}`
    const pair = pairs.get(key) ?? {
      back: 0,
      catalogItemId: row.catalogItemId,
      customerId: row.customerId,
      out: 0,
    }
    if (row.kind === "ISSUED") pair.out += row._sum.quantity ?? 0
    else pair.back += row._sum.quantity ?? 0
    pairs.set(key, pair)
  }
  const kept = [...pairs.values()].filter(
    (pair) => input.includeSettled || pair.out - pair.back > 0,
  )
  if (!kept.length) return []
  const [customers, items, issued] = await Promise.all([
    db.customer.findMany({
      select: { id: true, name: true },
      where: {
        id: { in: [...new Set(kept.map((pair) => pair.customerId))] },
        tenantId: input.tenantId,
      },
    }),
    db.catalogItem.findMany({
      select: { id: true, name: true },
      where: {
        id: { in: [...new Set(kept.map((pair) => pair.catalogItemId))] },
        tenantId: input.tenantId,
      },
    }),
    db.returnableMovement.findMany({
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      select: {
        catalogItemId: true,
        customerId: true,
        occurredAt: true,
        orderId: true,
        quantity: true,
      },
      where: {
        ...where,
        customerId: { in: [...new Set(kept.map((pair) => pair.customerId))] },
        kind: "ISSUED",
      },
    }),
  ])
  const customerName = new Map(customers.map((row) => [row.id, row.name]))
  const itemName = new Map(items.map((row) => [row.id, row.name]))
  const balances = kept.map((pair) => {
    // First in, first back: skip what has already been returned or written off.
    let cleared = pair.back
    let oldestOutAt: Date | null = null
    const orders = new Set<string>()
    for (const row of issued) {
      if (
        row.customerId !== pair.customerId ||
        row.catalogItemId !== pair.catalogItemId
      )
        continue
      if (cleared >= row.quantity) {
        cleared -= row.quantity
        continue
      }
      cleared = 0
      oldestOutAt ??= row.occurredAt
      if (row.orderId) orders.add(row.orderId)
    }
    return {
      catalogItemId: pair.catalogItemId,
      customerId: pair.customerId,
      customerName: customerName.get(pair.customerId) ?? "Customer",
      itemName: itemName.get(pair.catalogItemId) ?? "Returnable",
      oldestOutAt: oldestOutAt?.toISOString() ?? null,
      orderCount: orders.size,
      out: pair.out - pair.back,
    }
  })
  return balances
    .sort(
      (a, b) => b.out - a.out || a.customerName.localeCompare(b.customerName),
    )
    .slice(0, Math.min(Math.max(input.limit ?? 200, 1), 500))
}

/** Newest first; filter by customer, order or item. */
export async function listReturnableMovements(
  db: DbClient,
  input: {
    tenantId: string
    customerId?: string
    orderId?: string
    catalogItemId?: string
    cursor?: string
    limit?: number
  },
) {
  const take = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const rows = await db.returnableMovement.findMany({
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: movementSelect,
    take: take + 1,
    where: {
      tenantId: input.tenantId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.catalogItemId ? { catalogItemId: input.catalogItemId } : {}),
    },
  })
  const page = rows.slice(0, take).map(serialize)
  return {
    movements: page,
    nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
  }
}

/** Per item on one order: what went out with it and what came back against it. */
export async function readOrderReturnables(
  db: DbClient,
  input: { tenantId: string; scope: OrderScope; orderId: string },
) {
  const order = await db.commercialOrder.findFirst({
    select: { id: true, customerId: true },
    where: { ...input.scope, id: input.orderId, tenantId: input.tenantId },
  })
  if (!order) throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
  const sums = await db.returnableMovement.groupBy({
    by: ["catalogItemId", "kind"],
    _sum: { quantity: true },
    where: { orderId: order.id, tenantId: input.tenantId },
  })
  if (!sums.length) return { customerId: order.customerId, items: [] }
  const items = await db.catalogItem.findMany({
    select: { id: true, name: true },
    where: {
      id: { in: [...new Set(sums.map((row) => row.catalogItemId))] },
      tenantId: input.tenantId,
    },
  })
  return {
    customerId: order.customerId,
    items: items
      .map((item) => {
        const total = (kind: ReturnableMovementKind) =>
          sums
            .filter((row) => row.catalogItemId === item.id && row.kind === kind)
            .reduce((sum, row) => sum + (row._sum.quantity ?? 0), 0)
        return {
          catalogItemId: item.id,
          itemName: item.name,
          issued: total("ISSUED"),
          returned: total("RETURNED"),
          writtenOff: total("WRITTEN_OFF"),
        }
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName)),
  }
}

/** Usage can't leave Returnable while the ledger holds movements for the item. */
export async function assertReturnableUsageChange(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; catalogItemId: string; from: string; to: string },
) {
  if (input.from !== "RETURNABLE" || input.to === "RETURNABLE") return
  const used = await tx.returnableMovement.findFirst({
    select: { id: true },
    where: { catalogItemId: input.catalogItemId, tenantId: input.tenantId },
  })
  if (used)
    throw new CatalogError(
      "RETURNABLE_IN_USE",
      "This item has returnable history, so it stays Returnable.",
    )
}

/** Items set up as Returnable (not archived), for pickers. */
export async function listReturnableItems(
  db: DbClient,
  input: { tenantId: string },
) {
  return db.catalogItem.findMany({
    orderBy: { name: "asc" },
    select: { id: true, imageUrl: true, name: true },
    take: 50,
    where: {
      kind: "PRODUCT",
      product: { is: { usage: "RETURNABLE" } },
      status: { not: "ARCHIVED" },
      tenantId: input.tenantId,
    },
  })
}
