import type { Prisma } from "../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "./commercial-payments"
import { isCommercialOrderFulfillmentAllowed } from "./commercial-order-completion"
import {
  ServiceIntakeReviewError,
  assertAssistantServiceIntakeAuthority,
} from "./service-intake-review"
import { assertNonClinicalServiceWorkOrder } from "./service-work-order-scope"
import {
  type ServiceWorkEventReceipt,
  assertServiceHandoffReady,
  createServiceReworkInTransaction,
  prepareServiceReworkQuantity,
  recordServiceHandoffInTransaction,
  serviceIntakeReviewRevision,
} from "./service-work"

export type ServiceWorkCompletionReviewInput = {
  actorUserId: string
  tenantId: string
  storeId: string
  jobId: string
} & (
  | { operation: "rework"; lineId: string; quantity: string; reason: string }
  | { operation: "handoff"; note?: string }
)
function conflict(message: string): never {
  throw new ServiceIntakeReviewError("CONFLICT", message)
}
/** Fresh read preparation only. GENERAL owns the Serializable receipt transaction. */
export async function prepareReviewedServiceWorkCompletionInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceWorkCompletionReviewInput,
) {
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  if (actor.role === "MANAGER" && actor.staffAccessMode === "SCOPED")
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "Scoped Manager Service lifecycle access is not available yet.",
    )
  const job = await tx.serviceJob.findFirst({
    where: {
      id: input.jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      revision: true,
      storeId: true,
      commercialOrderId: true,
      handedOffAt: true,
      currentAssigneeUserId: true,
      commercialOrder: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          status: true,
          orderNumber: true,
          customerName: true,
          currencyCode: true,
          totalMinor: true,
          amountPaidMinor: true,
          paymentStatus: true,
          acceptedCommerceQuoteVersion: {
            select: { quote: { select: { sourceType: true } } },
          },
          prescriptionPickupFulfillment: { select: { id: true } },
          prescriptionDeliveryAddress: { select: { id: true } },
          _count: {
            select: { payments: true, prescriptionPaymentIntents: true },
          },
        },
      },
      lines: {
        where: input.operation === "rework" ? { id: input.lineId } : undefined,
        orderBy: { id: "asc" },
        take: 101,
        select: {
          id: true,
          revision: true,
          status: true,
          authorizationStatus: true,
          authorizationPolicy: true,
          completedAt: true,
          allocatedQuantity: true,
          reworkOfLineId: true,
          commercialOrderLine: {
            select: {
              orderId: true,
              snapshot: { select: { offeringName: true, variantName: true } },
            },
          },
        },
      },
      notificationIntents: {
        where: { status: { in: ["PENDING", "READY"] } },
        orderBy: { id: "asc" },
        take: 101,
        select: {
          id: true,
          status: true,
          templatePurpose: true,
          scheduledFor: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!job) conflict("Choose an exact saved Service Job at the current Store.")
  const order = job.commercialOrder
  if (
    order.id !== job.commercialOrderId ||
    order.tenantId !== input.tenantId ||
    order.storeId !== input.storeId
  )
    conflict("This Service Job has an invalid Order linkage.")
  assertNonClinicalServiceWorkOrder(order)
  if (job.lines.length > 100 || job.notificationIntents.length > 100)
    conflict(
      "This work exceeds the bounded review. Use the native Service work flow.",
    )
  if (job.lines.some((line) => line.commercialOrderLine.orderId !== order.id))
    conflict("A saved Job Line has an invalid Order linkage.")
  // Native handoff atomically cancels due reminders. Neither command reconciles
  // other outstanding customer updates, and rework has no reminder orchestration.
  const unresolvedUpdates = job.notificationIntents.filter(
    (intent) =>
      input.operation === "rework" || intent.templatePurpose !== "due_reminder",
  )
  if (unresolvedUpdates.length)
    conflict(
      "Outstanding customer reminders or updates require their native reconciliation before this work can be reviewed.",
    )
  const paid = effectiveCommercialAmountPaid({
    totalMinor: order.totalMinor,
    amountPaidMinor: order.amountPaidMinor,
    paymentStatus: order.paymentStatus,
    paymentCount: order._count.payments,
  })
  const obligations =
    input.operation === "handoff"
      ? await tx.commercialOrderLine.findMany({
          where: {
            orderId: order.id,
            order: { tenantId: input.tenantId, storeId: input.storeId },
          },
          orderBy: { id: "asc" },
          take: 101,
          select: {
            id: true,
            kind: true,
            quantity: true,
            snapshot: {
              select: {
                serviceWorkPolicy: true,
                serviceAuthorizationPolicy: true,
              },
            },
            productFulfillments: {
              orderBy: { id: "asc" },
              take: 101,
              select: { id: true, quantity: true, createdAt: true },
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
                performedAt: true,
                orderId: true,
                quantity: true,
                tenantId: true,
              },
            },
            serviceJobLines: {
              orderBy: { id: "asc" },
              take: 101,
              select: {
                id: true,
                revision: true,
                status: true,
                authorizationStatus: true,
                allocatedQuantity: true,
                completedAt: true,
                reworkOfLineId: true,
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
      : []
  if (
    obligations.length > 100 ||
    obligations.some(
      (line) =>
        line.productFulfillments.length > 100 ||
        line.serviceJobLines.length > 100,
    )
  )
    conflict(
      "The original Order obligations exceed this bounded handoff review.",
    )
  if (input.operation === "handoff" && !obligations.length)
    conflict(
      "The original Order obligations are unavailable for handoff review.",
    )
  let quantity: string | null = null
  const reason =
    input.operation === "rework"
      ? input.reason.trim()
      : input.note?.trim() || null
  if (input.operation === "rework") {
    if (!reason || reason.length > 500)
      conflict("Explain the linked rework within 500 characters.")
    const source = job.lines.find((line) => line.id === input.lineId)
    if (!source)
      conflict(
        "Choose the exact completed source Line belonging to this saved Job.",
      )
    quantity = prepareServiceReworkQuantity(source, input.quantity)
  } else {
    if (job.handedOffAt)
      conflict(
        "Handoff is already recorded. Open its original history instead of making another handoff.",
      )
    if (reason && reason.length > 500)
      conflict("Keep the handoff note within 500 characters.")
    if (!isCommercialOrderFulfillmentAllowed(order.status))
      conflict("This Order cannot be handed over in its current state.")
    assertServiceHandoffReady(job.lines)
    if (paid < order.totalMinor)
      conflict(
        "Record the outstanding balance through the Order payment flow with its receiving account before handoff.",
      )
  }
  const review = {
    operation: input.operation,
    jobId: job.id,
    orderId: order.id,
    sourceLineId: input.operation === "rework" ? input.lineId : null,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    currencyCode: order.currencyCode,
    balanceDueMinor: Math.max(0, order.totalMinor - paid),
    quantity,
    reason,
    sourceHandedOffAt: job.handedOffAt?.toISOString() ?? null,
    lines: job.lines.map((line) => ({
      id: line.id,
      revision: line.revision,
      status: line.status,
      authorizationStatus: line.authorizationStatus,
      quantity: line.allocatedQuantity.toString(),
      reworkOfLineId: line.reworkOfLineId,
      completedAt: line.completedAt?.toISOString() ?? null,
      offeringName:
        line.commercialOrderLine.snapshot?.offeringName ?? "Service",
      variantName: line.commercialOrderLine.snapshot?.variantName ?? "Service",
    })),
    cancelledDueReminderCount:
      input.operation === "handoff" ? job.notificationIntents.length : 0,
  }
  const target = {
    id: job.id,
    revision: serviceIntakeReviewRevision({
      actor,
      job,
      obligations,
      input,
      review,
    }),
  }
  return {
    target,
    review,
    async execute(clientCommandId: string) {
      let originalEvent: ServiceWorkEventReceipt | undefined
      const capture = (event: ServiceWorkEventReceipt) => {
        originalEvent = event
      }
      const common = {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        clientCommandId,
      }
      const result =
        input.operation === "rework"
          ? await createServiceReworkInTransaction(
              tx,
              {
                ...common,
                lineId: input.lineId,
                quantity: quantity!,
                reason: reason!,
              },
              capture,
            )
          : await recordServiceHandoffInTransaction(
              tx,
              {
                ...common,
                jobId: job.id,
                expectedRevision: job.revision,
                note: reason ?? undefined,
              },
              capture,
            )
      if (
        !originalEvent ||
        originalEvent.type !==
          (input.operation === "rework" ? "REWORK" : "REMOTE_HANDOFF") ||
        (input.operation === "handoff"
          ? result.id !== job.id
          : result.id === job.id)
      )
        conflict(
          "The native command did not return its original owning work event.",
        )
      return { job: result, event: originalEvent }
    },
  }
}
