import { catalogFreeLineDisplay } from "@ewatrade/utils/catalog-free-lines"
import type { PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { catalogFreeLineKindForRole } from "./catalog-free-lines"
import type { OrderScope } from "./order-visibility"
import { loadTenantActors } from "./tenant-actors"

export type CommercialOrderTimelineKind =
  | "created"
  | "payment"
  | "refund"
  | "fulfilled"
  | "returned"
  | "changed"
  | "replaced"
  | "cancelled"
  | "completed"

export type CommercialOrderTimelineChange =
  | { field: "customer"; before: string | null; after: string | null }
  | { field: "deliveryDueAt"; before: string | null; after: string | null }
  | { field: "notes"; before: string | null; after: string | null }
  | {
      field: "line"
      label: string
      before: { quantity: string; unitPriceMinor: number | null } | null
      after: { quantity: string; unitPriceMinor: number | null } | null
    }
  | { field: "total"; before: number; after: number }
  | { field: "stockReleased"; label: string; quantity: string }

export type CommercialOrderTimelineItem = {
  id: string
  kind: CommercialOrderTimelineKind
  occurredAt: string
  actor: { id: string; name: string | null } | null
  amountMinor: number | null
  method: string | null
  reference: string | null
  reason: string | null
  disposition: string | null
  lines: { label: string; quantity: string }[]
  changes: CommercialOrderTimelineChange[]
  linkedOrder: { id: string; orderNumber: string } | null
}

type Line = {
  id: string
  kind: string
  snapshot: {
    catalogItemName: string
    inventoryUnitName: string | null
    customLineRole: string | null
    note: string | null
  } | null
}

function lineLabel(line: Line | undefined) {
  if (!line) return "Removed line"
  const kind = catalogFreeLineKindForRole(line.snapshot?.customLineRole)
  if (kind)
    return catalogFreeLineDisplay({ kind, description: line.snapshot?.note })
      .title
  const title = line.snapshot?.catalogItemName ?? "Archived item"
  const unit =
    line.kind === "PRODUCT_UNIT" ? line.snapshot?.inventoryUnitName : null
  return unit ? `${title} - ${unit}` : title
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null
const minor = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null

// Created first and completed last when events share a timestamp.
const KIND_ORDER: Record<CommercialOrderTimelineKind, number> = {
  created: 0,
  changed: 1,
  payment: 2,
  refund: 2,
  fulfilled: 3,
  returned: 4,
  replaced: 5,
  cancelled: 5,
  completed: 6,
}

/**
 * Everything that happened to one order, oldest first, from the immutable rows
 * each command already writes. Staff notes are listed separately.
 */
export async function getCommercialOrderTimeline(
  db: PrismaClient,
  input: { tenantId: string; scope: OrderScope; orderId: string },
) {
  const order = await db.commercialOrder.findFirst({
    where: { ...input.scope, id: input.orderId, tenantId: input.tenantId },
    select: {
      id: true,
      orderNumber: true,
      currencyCode: true,
      status: true,
      createdAt: true,
      createdByUserId: true,
      completedAt: true,
      updatedAt: true,
      lines: {
        select: {
          id: true,
          kind: true,
          quantity: true,
          snapshot: {
            select: {
              catalogItemName: true,
              inventoryUnitName: true,
              customLineRole: true,
              note: true,
            },
          },
          productFulfillments: {
            select: {
              id: true,
              quantity: true,
              createdAt: true,
              stockOperationId: true,
            },
          },
          productReturns: {
            select: {
              id: true,
              quantity: true,
              disposition: true,
              reason: true,
              actorUserId: true,
              createdAt: true,
            },
          },
          serviceFulfillment: {
            select: {
              id: true,
              quantity: true,
              actorUserId: true,
              performedAt: true,
              clientOperationId: true,
            },
          },
        },
      },
      payments: {
        select: {
          id: true,
          type: true,
          method: true,
          amountMinor: true,
          reference: true,
          recordedByUserId: true,
          recordedAt: true,
        },
      },
      amendments: {
        select: {
          id: true,
          kind: true,
          actorUserId: true,
          reason: true,
          createdAt: true,
          beforeSnapshot: true,
          afterSnapshot: true,
          replacementOrder: { select: { id: true, orderNumber: true } },
        },
      },
      replacementAmendments: {
        select: {
          id: true,
          order: { select: { id: true, orderNumber: true } },
        },
      },
    },
  })
  if (!order)
    throw new CatalogError("ORDER_NOT_FOUND", "Commercial Order not found.")

  const lineById = new Map(order.lines.map((line) => [line.id, line]))
  const operationIds = order.lines.flatMap((line) =>
    line.productFulfillments.map((fulfilment) => fulfilment.stockOperationId),
  )
  const [operations, commands] = await Promise.all([
    operationIds.length
      ? db.stockOperation.findMany({
          where: { id: { in: operationIds }, tenantId: input.tenantId },
          select: {
            id: true,
            actorUserId: true,
            clientOperationId: true,
            effectiveAt: true,
          },
        })
      : [],
    db.commercialOrderFulfillmentCommand.findMany({
      where: { orderId: order.id, tenantId: input.tenantId },
      select: {
        id: true,
        actorUserId: true,
        clientOperationId: true,
        createdAt: true,
      },
    }),
  ])
  const operationById = new Map(operations.map((row) => [row.id, row]))
  // Batch fulfil writes one operation per line, named "<command>:<lineId>".
  const commandFor = (clientOperationId: string | undefined) =>
    clientOperationId
      ? commands.find((command) =>
          clientOperationId.startsWith(`${command.clientOperationId}:`),
        )
      : undefined

  type Draft = Omit<CommercialOrderTimelineItem, "actor"> & {
    actorUserId: string | null
  }
  const items: Draft[] = []
  const empty = () => ({
    amountMinor: null,
    method: null,
    reference: null,
    reason: null,
    disposition: null,
    lines: [],
    changes: [],
    linkedOrder: null,
  })
  const replaces = order.replacementAmendments[0]?.order ?? null
  items.push({
    ...empty(),
    id: `created:${order.id}`,
    kind: "created",
    occurredAt: order.createdAt.toISOString(),
    actorUserId: order.createdByUserId,
    linkedOrder: replaces,
  })

  for (const payment of order.payments)
    items.push({
      ...empty(),
      id: `payment:${payment.id}`,
      kind: payment.type === "REFUND" ? "refund" : "payment",
      occurredAt: payment.recordedAt.toISOString(),
      actorUserId: payment.recordedByUserId,
      amountMinor: payment.amountMinor,
      method: payment.method,
      reference: payment.reference,
    })

  const batches = new Map<string, Draft>()
  const fulfilled = (
    key: string,
    occurredAt: Date,
    actorUserId: string | null,
    clientOperationId: string | undefined,
    line: { label: string; quantity: string },
  ) => {
    const command = commandFor(clientOperationId)
    if (command) {
      const batch = batches.get(command.id)
      if (batch) return void batch.lines.push(line)
      const draft: Draft = {
        ...empty(),
        id: `fulfilled:${command.id}`,
        kind: "fulfilled",
        occurredAt: command.createdAt.toISOString(),
        actorUserId: command.actorUserId,
        lines: [line],
      }
      batches.set(command.id, draft)
      return void items.push(draft)
    }
    items.push({
      ...empty(),
      id: `fulfilled:${key}`,
      kind: "fulfilled",
      occurredAt: occurredAt.toISOString(),
      actorUserId,
      lines: [line],
    })
  }

  for (const line of order.lines) {
    const label = lineLabel(line)
    for (const fulfilment of line.productFulfillments) {
      const operation = operationById.get(fulfilment.stockOperationId)
      fulfilled(
        fulfilment.id,
        operation?.effectiveAt ?? fulfilment.createdAt,
        operation?.actorUserId ?? null,
        operation?.clientOperationId,
        { label, quantity: fulfilment.quantity.toString() },
      )
    }
    if (line.serviceFulfillment)
      fulfilled(
        line.serviceFulfillment.id,
        line.serviceFulfillment.performedAt,
        line.serviceFulfillment.actorUserId,
        line.serviceFulfillment.clientOperationId,
        { label, quantity: line.serviceFulfillment.quantity.toString() },
      )
    for (const productReturn of line.productReturns)
      items.push({
        ...empty(),
        id: `returned:${productReturn.id}`,
        kind: "returned",
        occurredAt: productReturn.createdAt.toISOString(),
        actorUserId: productReturn.actorUserId,
        reason: productReturn.reason,
        disposition: productReturn.disposition,
        lines: [{ label, quantity: productReturn.quantity.toString() }],
      })
  }

  let cancelRecorded = false
  for (const amendment of order.amendments) {
    const before = record(amendment.beforeSnapshot)
    const after = record(amendment.afterSnapshot)
    const common = {
      ...empty(),
      occurredAt: amendment.createdAt.toISOString(),
      actorUserId: amendment.actorUserId,
      reason: amendment.reason,
    }
    if (amendment.kind === "METADATA") {
      const next = record(after.metadata)
      const fields = new Set(
        Array.isArray(after.changedFields) ? after.changedFields : [],
      )
      const changes: CommercialOrderTimelineChange[] = []
      if (
        ["customerId", "customerName", "customerPhone", "customerEmail"].some(
          (field) => fields.has(field),
        )
      )
        changes.push({
          field: "customer",
          before:
            text(before.customerName) ??
            text(before.customerPhone) ??
            text(before.customerEmail),
          after:
            text(next.customerName) ??
            text(next.customerPhone) ??
            text(next.customerEmail),
        })
      if (fields.has("deliveryDueAt"))
        changes.push({
          field: "deliveryDueAt",
          before: text(before.deliveryDueAt),
          after: text(next.deliveryDueAt),
        })
      if (fields.has("notes"))
        changes.push({
          field: "notes",
          before: text(before.notes),
          after: text(next.notes),
        })
      items.push({
        ...common,
        id: `changed:${amendment.id}`,
        kind: "changed",
        changes,
      })
    } else if (amendment.kind === "REPLACE") {
      cancelRecorded = true
      const terms = record(after.terms)
      const termLines = Array.isArray(terms.lines) ? terms.lines : []
      const changes: CommercialOrderTimelineChange[] = termLines
        .map(record)
        .filter(
          (row) =>
            String(row.quantity) !== String(row.originalQuantity) ||
            row.unitPriceMinor !== row.originalUnitPriceMinor,
        )
        .map((row) => ({
          field: "line" as const,
          label: lineLabel(lineById.get(String(row.orderLineId))),
          before: {
            quantity: String(row.originalQuantity),
            unitPriceMinor: minor(row.originalUnitPriceMinor),
          },
          after: {
            quantity: String(row.quantity),
            unitPriceMinor: minor(row.unitPriceMinor),
          },
        }))
      const beforeTotal = minor(terms.originalTotalMinor)
      const afterTotal = minor(terms.totalMinor)
      if (
        beforeTotal !== null &&
        afterTotal !== null &&
        beforeTotal !== afterTotal
      )
        changes.push({ field: "total", before: beforeTotal, after: afterTotal })
      items.push({
        ...common,
        id: `replaced:${amendment.id}`,
        kind: "replaced",
        changes,
        linkedOrder: amendment.replacementOrder,
      })
    } else {
      cancelRecorded = true
      const releases = Array.isArray(after.releasedReservations)
        ? after.releasedReservations.map(record)
        : []
      items.push({
        ...common,
        id: `cancelled:${amendment.id}`,
        kind: "cancelled",
        changes: releases.map((release) => ({
          field: "stockReleased" as const,
          label: lineLabel(lineById.get(String(release.orderLineId))),
          quantity: String(release.quantity),
        })),
      })
    }
  }
  // Older paths cancel without an amendment row; show it without inventing a time.
  if (order.status === "CANCELLED" && !cancelRecorded)
    items.push({
      ...empty(),
      id: `cancelled:${order.id}`,
      kind: "cancelled",
      occurredAt: order.updatedAt.toISOString(),
      actorUserId: null,
    })
  if (order.completedAt) {
    // completedAt is stamped a moment before the rows of the same command.
    const done = order.completedAt.getTime()
    const settled = Math.max(
      done,
      ...items
        .map((item) => Date.parse(item.occurredAt))
        .filter((time) => time >= done && time - done < 5000),
    )
    items.push({
      ...empty(),
      id: `completed:${order.id}`,
      kind: "completed",
      occurredAt: new Date(settled).toISOString(),
      actorUserId: null,
    })
  }
  items.sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind],
  )
  // One "fulfil all" writes a row per line in the same instant; show one entry.
  const merged: Draft[] = []
  for (const item of items) {
    const previous = merged.at(-1)
    if (
      previous?.kind === "fulfilled" &&
      item.kind === "fulfilled" &&
      previous.actorUserId === item.actorUserId &&
      Math.abs(Date.parse(item.occurredAt) - Date.parse(previous.occurredAt)) <
        2000
    ) {
      previous.lines.push(...item.lines)
      continue
    }
    merged.push(item)
  }

  const actors = await loadTenantActors(db, {
    tenantId: input.tenantId,
    userIds: merged.flatMap((item) =>
      item.actorUserId ? [item.actorUserId] : [],
    ),
  })
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    currencyCode: order.currencyCode,
    items: merged.map(
      ({ actorUserId, ...item }): CommercialOrderTimelineItem => {
        const actor = actorUserId ? actors.get(actorUserId) : undefined
        return {
          ...item,
          actor: actorUserId
            ? { id: actorUserId, name: actor?.name ?? null }
            : null,
        }
      },
    ),
  }
}
