import { createHash } from "node:crypto"

import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"

const COMMAND_ID_MIN_LENGTH = 8
const COMMAND_ID_MAX_LENGTH = 160
const REASON_MAX_LENGTH = 500

// Keep db independent from auth, which depends on db. This is
// canManageSalesOperations's active role set.
const SALES_MANAGER_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"])

type AuthorizationRecord = {
  actorUserId: string
  authorizedAt: Date
  clientOperationId: string
  createdAt: Date
  id: string
  orderId: string
  orderLineId: string
  payloadHash: string
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

function hashPayload(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function serializeAuthorization(source: AuthorizationRecord) {
  return {
    actorUserId: source.actorUserId,
    authorizedAt: source.authorizedAt,
    clientOperationId: source.clientOperationId,
    createdAt: source.createdAt,
    id: source.id,
    orderId: source.orderId,
    orderLineId: source.orderLineId,
    payloadHash: source.payloadHash,
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
      "CLIENT_SCHEMA_UNSUPPORTED: Service release requires schema version 1.",
    )
  }
  const clientOperationId = input.clientOperationId.trim()
  if (
    clientOperationId.length < COMMAND_ID_MIN_LENGTH ||
    clientOperationId.length > COMMAND_ID_MAX_LENGTH
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "A stable Service release command identity is required.",
    )
  }
  const reason = input.reason.trim()
  if (reason.length < 1 || reason.length > REASON_MAX_LENGTH) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Enter a Service release reason between 1 and 500 characters.",
    )
  }
  return { clientOperationId, reason }
}

async function assertActiveSalesManager(
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
      "An active business manager is required to release this Service.",
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
    !SALES_MANAGER_ROLES.has(membership.role)
  ) {
    throw new CatalogError(
      "SERVICE_WORK_NOT_AUTHORIZED",
      "An active business manager is required to release this Service.",
    )
  }
}

/** Creates explicit manager authorization for one immutable charge-only line. */
export async function authorizeCommercialOrderChargeOnlyServiceLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    orderLineId: string
    reason: string
    schemaVersion: number
    tenantId: string
  },
) {
  const normalized = validateInput(input)
  const hash = hashPayload({
    actorUserId: input.actorUserId,
    clientOperationId: normalized.clientOperationId,
    orderLineId: input.orderLineId,
    reason: normalized.reason,
    schemaVersion: input.schemaVersion,
    tenantId: input.tenantId,
  })

  return db
    .$transaction(
      async (tx) => {
        const discovered = await tx.commercialOrderLine.findFirst({
          where: { id: input.orderLineId, order: { tenantId: input.tenantId } },
          select: {
            id: true,
            orderId: true,
            order: { select: { storeId: true, tenantId: true } },
          },
        })
        if (!discovered) {
          throw new CatalogError(
            "ORDER_NOT_FOUND",
            "Service Order line not found.",
          )
        }

        const locked = await lockCommerceFinancialOrder(tx, {
          orderId: discovered.orderId,
          tenantId: input.tenantId,
        })
        if (!locked) {
          throw new CatalogError(
            "ORDER_NOT_FOUND",
            "Commercial Order not found.",
          )
        }
        if (
          discovered.order.tenantId !== input.tenantId ||
          locked.order.storeId !== discovered.order.storeId
        ) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "Service Order linkage changed. Reload before authorizing this release.",
          )
        }

        await assertActiveSalesManager(tx, input)
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
            "Service Order line linkage changed. Reload before authorizing this release.",
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
            serviceAuthorization: true,
            serviceFulfillment: true,
            serviceJobLines: { select: { id: true } },
            order: {
              select: {
                acceptedCommerceQuoteVersion: {
                  select: { quote: { select: { sourceType: true } } },
                },
                completedAt: true,
                id: true,
                prescriptionDeliveryAssignment: { select: { orderId: true } },
                prescriptionPickupFulfillment: { select: { orderId: true } },
                status: true,
                store: { select: { tenantId: true } },
                storeId: true,
                tenantId: true,
              },
            },
          },
        })
        if (!line || line.orderId !== discovered.orderId) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "Service Order line linkage changed. Reload before authorizing this release.",
          )
        }
        if (
          line.order.storeId !== locked.order.storeId ||
          line.order.tenantId !== input.tenantId ||
          line.order.store.tenantId !== input.tenantId
        ) {
          throw new CatalogError("INVALID_ORDER", "Service Order not found.")
        }

        const priorCommand = await tx.commercialServiceAuthorization.findUnique(
          {
            where: {
              tenantId_clientOperationId: {
                clientOperationId: normalized.clientOperationId,
                tenantId: input.tenantId,
              },
            },
          },
        )
        if (priorCommand) {
          if (
            priorCommand.payloadHash !== hash ||
            priorCommand.orderId !== locked.order.id ||
            priorCommand.orderLineId !== line.id
          ) {
            throw new CatalogError(
              "IDEMPOTENCY_MISMATCH",
              "This Service release command identity was used for another request.",
            )
          }
          return serializeAuthorization(priorCommand)
        }

        if (line.serviceAuthorization) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "This Service Order line already has a manager release.",
          )
        }
        if (
          line.kind !== "SERVICE" ||
          !line.snapshot ||
          line.snapshot.serviceWorkPolicy !== "CHARGE_ONLY" ||
          line.snapshot.serviceAuthorizationPolicy !== "MANUAL_RELEASE" ||
          line.serviceJobLines.length > 0
        ) {
          throw new CatalogError(
            "SERVICE_WORK_NOT_AUTHORIZED",
            "Only unallocated CHARGE_ONLY Services with manual-release policy can be released here.",
          )
        }
        if (
          line.serviceFulfillment ||
          line.order.completedAt ||
          !["CONFIRMED", "FULFILLING"].includes(line.order.status)
        ) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "This Order line cannot receive a new Service release in its current state.",
          )
        }
        if (
          line.order.acceptedCommerceQuoteVersion?.quote.sourceType ===
            "PRESCRIPTION_REQUEST" ||
          line.order.prescriptionPickupFulfillment ||
          line.order.prescriptionDeliveryAssignment
        ) {
          throw new CatalogError(
            "INVALID_ORDER",
            "Prescription Orders require their clinical fulfillment source.",
          )
        }

        let quantity: string
        try {
          quantity = parseExactDecimal(line.quantity.toString(), {
            allowZero: false,
            maxScale: 6,
          })
        } catch {
          throw new CatalogError(
            "INVALID_ORDER",
            "The Service Order line has an invalid quantity.",
          )
        }

        const authorization = await tx.commercialServiceAuthorization.create({
          data: {
            actorUserId: input.actorUserId,
            authorizedAt: new Date(),
            clientOperationId: normalized.clientOperationId,
            orderId: line.order.id,
            orderLineId: line.id,
            payloadHash: hash,
            quantity,
            reason: normalized.reason,
            tenantId: input.tenantId,
          },
        })
        return serializeAuthorization(authorization)
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
    .catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This Service release identity or line was already recorded. Reload before retrying.",
        )
      }
      throw error
    })
}
