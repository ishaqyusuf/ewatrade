import { areCommercialOrderLinesComplete } from "../commercial-order-completion"
import { factSet, refuse } from "./booking-review-shared"
import { planServiceCommerceBookingWork } from "./booking-work-plan"
import type { BookingTransaction } from "./shared"

export async function workReview(
  tx: BookingTransaction,
  input: { tenantId: string; storeId: string },
  jobId: string,
  orderId: string | null,
  operation: "start" | "complete",
  now: Date,
) {
  const job = await tx.serviceJob.findFirst({
    where: {
      id: jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      commercialOrderId: orderId ?? undefined,
    },
    include: { lines: true },
  })
  if (
    !job ||
    job.id !== jobId ||
    (orderId && job.commercialOrderId !== orderId)
  )
    refuse()
  const plan = planServiceCommerceBookingWork(job.lines, operation)
  const changes = plan.changedLines.map((line) => ({
    id: line.id,
    revision: line.revision,
    fromStatus: line.status,
    toStatus: plan.nextStatus,
    completedAt: operation === "complete" ? "command_time" : "unchanged",
  }))
  const { obligations, wouldCompleteOrder } = await (async () => {
    if (operation === "complete" && orderId && plan.activeLines.length > 0) {
      const rows = await tx.commercialOrderLine.findMany({
        where: {
          orderId,
          order: { tenantId: input.tenantId, storeId: input.storeId },
        },
        select: {
          id: true,
          kind: true,
          quantity: true,
          productFulfillments: { select: { createdAt: true, quantity: true } },
          snapshot: {
            select: {
              serviceAuthorizationPolicy: true,
              serviceWorkPolicy: true,
            },
          },
          serviceAuthorization: {
            select: {
              authorizedAt: true,
              orderId: true,
              orderLineId: true,
              quantity: true,
              tenantId: true,
            },
          },
          serviceFulfillment: {
            select: {
              orderId: true,
              performedAt: true,
              quantity: true,
              tenantId: true,
            },
          },
          serviceJobLines: {
            select: {
              id: true,
              allocatedQuantity: true,
              authorizationStatus: true,
              completedAt: true,
              reworkOfLineId: true,
              status: true,
              serviceJob: {
                select: {
                  commercialOrderId: true,
                  storeId: true,
                  tenantId: true,
                },
              },
            },
          },
        },
      })
      const changed = new Set(changes.map((row) => row.id))
      const projected = rows.map((row) => ({
        ...row,
        serviceJobLines: row.serviceJobLines.map((line) =>
          changed.has(line.id)
            ? { ...line, status: plan.nextStatus, completedAt: now }
            : line,
        ),
      }))
      const wouldCompleteOrder = areCommercialOrderLinesComplete(projected, {
        ...input,
        orderId,
      })
      const obligations = [...rows]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row) => ({
          ...row,
          quantity: row.quantity.toString(),
          productFulfillments: factSet(
            row.productFulfillments.map((f) => ({
              ...f,
              quantity: f.quantity.toString(),
            })),
          ),
          serviceAuthorization: row.serviceAuthorization
            ? {
                ...row.serviceAuthorization,
                quantity: row.serviceAuthorization.quantity.toString(),
              }
            : null,
          serviceFulfillment: row.serviceFulfillment
            ? {
                ...row.serviceFulfillment,
                quantity: row.serviceFulfillment.quantity.toString(),
              }
            : null,
          serviceJobLines: [...row.serviceJobLines]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((line) => ({
              ...line,
              allocatedQuantity: line.allocatedQuantity.toString(),
            })),
        }))
      return { obligations, wouldCompleteOrder }
    }
    return { obligations: null, wouldCompleteOrder: false }
  })()
  return {
    jobId: job.id,
    jobRevision: job.revision,
    lines: [...job.lines]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((line) => ({
        id: line.id,
        revision: line.revision,
        status: line.status,
        authorizationStatus: line.authorizationStatus,
        allocatedQuantity: line.allocatedQuantity.toString(),
        reworkOfLineId: line.reworkOfLineId,
        completedAt: line.completedAt,
      })),
    changes: [...changes].sort((a, b) => a.id.localeCompare(b.id)),
    jobRevisionIncrement: changes.length > 0,
    jobCompletedAt:
      operation === "complete" && changes.length > 0
        ? "command_time"
        : "unchanged",
    obligations,
    wouldCompleteOrder,
  }
}
