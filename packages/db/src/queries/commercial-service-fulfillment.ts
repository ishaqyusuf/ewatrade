import { createHash } from "node:crypto"
import { readCommercialServiceEvidence } from "./commercial-service-evidence"
import { assertCommercialServiceLineReview } from "./commercial-service-line-review"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog"
import { readCommercialOrderLinesComplete } from "./commercial-order-completion"
import { assertChargeOnlyServicePerformance } from "./commercial-service-line-policy"
import {
  assertHeldCommerceFinancialOrder,
  lockCommerceFinancialOrder,
} from "./customer-ledger/commerce-locks"
import {
  type RecoveryFulfillmentAuthorization,
  recoveryFulfillmentReviewer,
} from "./offline-recovery-fulfillment-authorization"
import { runInOwnTransaction } from "./own-transaction"

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
  expectedReviewRevision?: string
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
  heldOrder?: NonNullable<
    Awaited<ReturnType<typeof lockCommerceFinancialOrder>>
  >,
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

    if (heldOrder)
      assertHeldCommerceFinancialOrder(tx, heldOrder, {
        tenantId: input.tenantId,
        orderId: discovered.orderId,
      })
    const locked =
      heldOrder ??
      (await lockCommerceFinancialOrder(tx, {
        orderId: discovered.orderId,
        tenantId: input.tenantId,
      }))
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

    const line = await readCommercialServiceEvidence(tx, {
      tenantId: input.tenantId,
      storeId: locked.order.storeId,
      orderLineId: input.orderLineId,
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

    await assertCommercialServiceLineReview(tx, { ...input, action: "fulfill" })
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

/**
 * Records performance of every unperformed catalog-free line in one pass.
 * Caller holds the financial Order lock and has checked the Order can be
 * fulfilled now; status is recomputed by the caller afterwards. System lines
 * are always CHARGE_ONLY / ON_ORDER_CONFIRMATION, so the per-line review and
 * Job checks of the canonical command reduce to the filters below.
 */
export async function fulfillCatalogFreeLinesInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    clientOperationIdPrefix: string
    orderId: string
    reason?: string
    schemaVersion: number
    tenantId: string
  },
  recoveryAuthorization?: RecoveryFulfillmentAuthorization,
) {
  const lines = await tx.commercialOrderLine.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, quantity: true },
    where: {
      kind: "SERVICE",
      order: { tenantId: input.tenantId },
      orderId: input.orderId,
      serviceFulfillment: null,
      serviceJobLines: { none: {} },
      snapshot: {
        customLineRole: { not: null },
        serviceWorkPolicy: "CHARGE_ONLY",
      },
    },
  })
  if (lines.length === 0) return 0
  const authorizerUserId = recoveryAuthorization
    ? await recoveryFulfillmentReviewer(tx, recoveryAuthorization, input)
    : input.actorUserId
  await assertActivePosMember(tx, {
    actorUserId: authorizerUserId,
    tenantId: input.tenantId,
  })
  const performedAt = new Date()
  const rows = lines.map((line) => {
    const normalized = validateInput({
      clientOperationId: `${input.clientOperationIdPrefix}:${line.id}`,
      reason: input.reason?.trim() || "Recorded as fulfilled",
      schemaVersion: input.schemaVersion,
    })
    return {
      actorUserId: input.actorUserId,
      clientOperationId: normalized.clientOperationId,
      orderId: input.orderId,
      orderLineId: line.id,
      payloadHash: payloadHash({
        actorUserId: input.actorUserId,
        clientOperationId: normalized.clientOperationId,
        orderLineId: line.id,
        reason: normalized.reason,
        schemaVersion: input.schemaVersion,
        tenantId: input.tenantId,
      }),
      performedAt,
      quantity: line.quantity,
      reason: normalized.reason,
      tenantId: input.tenantId,
    }
  })
  await tx.commercialServiceFulfillment.createMany({ data: rows })
  return rows.length
}
