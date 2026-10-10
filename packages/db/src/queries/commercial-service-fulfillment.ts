import { createHash } from "node:crypto"

import { assertChargeOnlyServicePerformance } from "./commercial-service-line-policy"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { runInOwnTransaction } from "./own-transaction"
import { CatalogError } from "./catalog"
import { readCommercialOrderLinesComplete } from "./commercial-order-completion"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"

const FULFILLMENT_COMMAND_ID_MIN_LENGTH = 8
const FULFILLMENT_COMMAND_ID_MAX_LENGTH = 160
const FULFILLMENT_REASON_MAX_LENGTH = 500

// Keep the DB package independent from auth (auth itself depends on DB).
// This is the current canOperatePos role set from packages/auth/src/roles.ts.
const POS_OPERATOR_ROLES = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "OPERATOR",
])

type FulfillmentRecord = {
  actorUserId: string
  clientOperationId: string
  createdAt: Date
  id: string
  orderId: string
  orderLineId: string
  payloadHash: string
  performedAt: Date
  quantity: { toString(): string } | string
  reason: string
  tenantId: string
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function serializeFulfillment(source: FulfillmentRecord) {
  return {
    actorUserId: source.actorUserId,
    clientOperationId: source.clientOperationId,
    createdAt: source.createdAt,
    id: source.id,
    orderId: source.orderId,
    orderLineId: source.orderLineId,
    payloadHash: source.payloadHash,
    performedAt: source.performedAt,
    quantity:
      typeof source.quantity === "string"
        ? source.quantity
        : source.quantity.toString(),
    reason: source.reason,
    tenantId: source.tenantId,
  }
}

function validateInput(input: {
  clientOperationId: string
  reason: string
  schemaVersion: number
}) {
  if (input.schemaVersion !== 1) {
    throw new CatalogError(
      "INVALID_ORDER",
      "CLIENT_SCHEMA_UNSUPPORTED: Service fulfillment requires schema version 1.",
    )
  }
  const clientOperationId = input.clientOperationId.trim()
  if (
    clientOperationId.length < FULFILLMENT_COMMAND_ID_MIN_LENGTH ||
    clientOperationId.length > FULFILLMENT_COMMAND_ID_MAX_LENGTH
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "A stable Service fulfillment command identity is required.",
    )
  }
  const reason = input.reason.trim()
  if (reason.length < 1 || reason.length > FULFILLMENT_REASON_MAX_LENGTH) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Enter a Service fulfillment reason between 1 and 500 characters.",
    )
  }
  return { clientOperationId, reason }
}

async function assertActivePosMember(
  tx: Prisma.TransactionClient,
  input: { actorUserId: string; tenantId: string },
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Membership"
    WHERE "tenantId" = ${input.tenantId}
      AND "userId" = ${input.actorUserId}
    FOR SHARE
  `
  if (rows.length !== 1) {
    throw new CatalogError(
      "SERVICE_WORK_NOT_AUTHORIZED",
      "An active business member with point-of-sale access is required.",
    )
  }
  const membership = await tx.membership.findFirst({
    where: {
      status: "ACTIVE",
      tenantId: input.tenantId,
      userId: input.actorUserId,
    },
    select: { role: true, tenant: { select: { isActive: true } } },
  })
  if (
    !membership?.tenant.isActive ||
    !POS_OPERATOR_ROLES.has(membership.role)
  ) {
    throw new CatalogError(
      "SERVICE_WORK_NOT_AUTHORIZED",
      "An active business member with point-of-sale access is required.",
    )
  }
}

/** Records full performance of one immutable CHARGE_ONLY Service Order line. */
export type FulfillCommercialOrderChargeOnlyServiceLineInput = {
  actorUserId: string
  clientOperationId: string
  orderLineId: string
  reason: string
  schemaVersion: number
  tenantId: string
  /** Optional active-Store fence for transaction-composed callers. */
  storeId?: string
}

export function fulfillCommercialOrderChargeOnlyServiceLine(
  db: PrismaClient,
  input: FulfillCommercialOrderChargeOnlyServiceLineInput,
) {
  return runInOwnTransaction(db, (tx) =>
    fulfillCommercialOrderChargeOnlyServiceLineInTransaction(tx, input),
  )
}

/** Composes the canonical command and its caller's receipt in one transaction. */
export async function fulfillCommercialOrderChargeOnlyServiceLineInTransaction(
  tx: Prisma.TransactionClient,
  input: FulfillCommercialOrderChargeOnlyServiceLineInput,
) {
  const normalized = validateInput(input)
  const hash = payloadHash({
    actorUserId: input.actorUserId,
    clientOperationId: normalized.clientOperationId,
    orderLineId: input.orderLineId,
    reason: normalized.reason,
    schemaVersion: input.schemaVersion,
    tenantId: input.tenantId,
  })

  try {
    const discovered = await tx.commercialOrderLine.findFirst({
      where: { id: input.orderLineId, order: { tenantId: input.tenantId } },
      select: {
        id: true,
        orderId: true,
        order: { select: { storeId: true, tenantId: true } },
      },
    })
    if (!discovered) {
      throw new CatalogError("ORDER_NOT_FOUND", "Service Order line not found.")
    }

    const locked = await lockCommerceFinancialOrder(tx, {
      orderId: discovered.orderId,
      tenantId: input.tenantId,
    })
    if (!locked) {
      throw new CatalogError("ORDER_NOT_FOUND", "Commercial Order not found.")
    }
    if (
      discovered.order.tenantId !== input.tenantId ||
      locked.order.storeId !== discovered.order.storeId ||
      (input.storeId !== undefined && locked.order.storeId !== input.storeId)
    ) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Service Order linkage changed. Reload before recording performance.",
      )
    }

    await assertActivePosMember(tx, input)
    const lineLocks = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "CommercialOrderLine"
    WHERE "id" = ${input.orderLineId}
      AND "orderId" = ${locked.order.id}
    FOR UPDATE
  `
    if (lineLocks.length !== 1) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Service Order line linkage changed. Reload before recording performance.",
      )
    }

    const line = await tx.commercialOrderLine.findFirst({
      where: {
        id: input.orderLineId,
        orderId: locked.order.id,
        order: { tenantId: input.tenantId },
      },
      select: {
        id: true,
        kind: true,
        orderId: true,
        quantity: true,
        snapshot: {
          select: {
            serviceAuthorizationPolicy: true,
            serviceWorkPolicy: true,
          },
        },
        serviceJobLines: { select: { id: true } },
        serviceAuthorization: true,
        serviceFulfillment: true,
        order: {
          select: {
            acceptedCommerceQuoteVersion: {
              select: { quote: { select: { sourceType: true } } },
            },
            amountPaidMinor: true,
            completedAt: true,
            currencyCode: true,
            deliveryDueAt: true,
            id: true,
            paymentStatus: true,
            payments: { select: { id: true } },
            prescriptionDeliveryAssignment: { select: { orderId: true } },
            prescriptionPickupFulfillment: { select: { orderId: true } },
            status: true,
            store: { select: { tenantId: true } },
            storeId: true,
            tenantId: true,
            totalMinor: true,
          },
        },
      },
    })
    if (!line || line.orderId !== discovered.orderId) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Service Order line linkage changed. Reload before recording performance.",
      )
    }
    if (
      line.order.storeId !== locked.order.storeId ||
      line.order.store.tenantId !== input.tenantId
    ) {
      throw new CatalogError("INVALID_ORDER", "Service Order not found.")
    }

    const priorCommand = await tx.commercialServiceFulfillment.findUnique({
      where: {
        tenantId_clientOperationId: {
          clientOperationId: normalized.clientOperationId,
          tenantId: input.tenantId,
        },
      },
    })
    if (priorCommand) {
      if (
        priorCommand.payloadHash !== hash ||
        priorCommand.orderId !== locked.order.id ||
        priorCommand.orderLineId !== line.id
      ) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This Service fulfillment command identity was used for another request.",
        )
      }
      return serializeFulfillment(priorCommand)
    }

    const { quantity, performedAt } = assertChargeOnlyServicePerformance(
      line,
      input,
    )

    const fulfillment = await tx.commercialServiceFulfillment.create({
      data: {
        actorUserId: input.actorUserId,
        clientOperationId: normalized.clientOperationId,
        orderId: line.order.id,
        orderLineId: line.id,
        payloadHash: hash,
        performedAt,
        quantity,
        reason: normalized.reason,
        tenantId: input.tenantId,
      },
    })

    const complete = await readCommercialOrderLinesComplete(
      tx,
      {
        orderId: line.order.id,
        storeId: line.order.storeId,
        tenantId: input.tenantId,
      },
      performedAt,
    )
    await tx.commercialOrder.update({
      data: {
        completedAt: complete
          ? (locked.order.completedAt ?? performedAt)
          : undefined,
        status: complete ? "COMPLETED" : "FULFILLING",
      },
      where: { id: line.order.id },
    })
    return serializeFulfillment(fulfillment)
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This Service fulfillment identity or line was already recorded. Reload before retrying.",
      )
    }
    throw error
  }
}
