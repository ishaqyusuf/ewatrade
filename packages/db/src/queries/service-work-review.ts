import type { Prisma } from "../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "./commercial-payments"
import { assertNonClinicalServiceWorkOrder } from "./service-work-order-scope"
import {
  ServiceIntakeReviewError,
  assertAssistantServiceIntakeAuthority,
} from "./service-intake-review"
import {
  type ServiceWorkEventReceipt,
  type TransitionServiceJobLineInput,
  assignServiceJobInTransaction,
  prepareServiceJobLineTransition,
  rescheduleServiceJobInTransaction,
  serviceAssigneeWhere,
  serviceIntakeReviewRevision,
  transitionServiceJobLineInTransaction,
} from "./service-work"

type Scope = { actorUserId: string; tenantId: string; storeId: string }
export type ServiceWorkReviewInput = Scope &
  (
    | {
        operation: "assign"
        jobId: string
        assigneeUserId: string
        reason?: string
      }
    | {
        operation: "reschedule"
        jobId: string
        promisedAt: Date
        reason: string
      }
    | {
        operation: "transition"
        jobId: string
        lineId: string
        toStatus: Exclude<
          TransitionServiceJobLineInput["toStatus"],
          "completed"
        >
        reason?: string
      }
  )
function unavailable(message: string): never {
  throw new ServiceIntakeReviewError("CONFLICT", message)
}

/** Read preparation only; the caller owns the fresh GENERAL Serializable transaction. */
export async function prepareReviewedServiceWorkInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceWorkReviewInput,
) {
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  // Native lifecycle procedures are not yet audited in scoped-staff policy.
  // An active Store assignment alone must not grant these new assistant writes.
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
      currentAssigneeUserId: true,
      handedOffAt: true,
      commercialOrder: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          orderNumber: true,
          currencyCode: true,
          totalMinor: true,
          amountPaidMinor: true,
          paymentStatus: true,
          customerName: true,
          customerPhone: true,
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
      intake: { select: { customerPhone: true, notificationChannel: true } },
      dueCommitments: {
        where: { supersededAt: null },
        orderBy: { effectiveAt: "desc" },
        take: 2,
        select: { id: true, promisedAt: true, effectiveAt: true },
      },
      _count: {
        select: {
          lines: {
            where: {
              status: {
                notIn: ["READY_FOR_HANDOFF", "COMPLETED", "CANCELLED"],
              },
            },
          },
          notificationIntents: {
            where: {
              templatePurpose: "due_reminder",
              status: { in: ["PENDING", "READY"] },
            },
          },
        },
      },
    },
  })
  if (!job) unavailable("Choose an exact Service Job at the current Store.")
  if (
    job.commercialOrder.tenantId !== input.tenantId ||
    job.commercialOrder.storeId !== input.storeId
  )
    unavailable("This Service Job has an invalid Order linkage.")
  assertNonClinicalServiceWorkOrder(job.commercialOrder)
  if (job.dueCommitments.length > 1)
    unavailable(
      "This Job has conflicting current promises. Resolve them in Service work.",
    )
  const assignee =
    input.operation === "assign"
      ? await tx.membership.findFirst({
          where: serviceAssigneeWhere({
            ...input,
            userId: input.assigneeUserId,
          }),
          select: {
            id: true,
            role: true,
            staffAccessRevision: true,
            user: { select: { id: true, name: true } },
          },
        })
      : null
  if (input.operation === "assign" && !assignee)
    unavailable("Choose an active eligible assignee at this Store.")
  const line =
    input.operation === "transition"
      ? await tx.serviceJobLine.findFirst({
          where: { id: input.lineId, serviceJobId: job.id },
          select: {
            id: true,
            revision: true,
            status: true,
            authorizationStatus: true,
            authorizationPolicy: true,
            allocatedQuantity: true,
            commercialOrderLine: {
              select: {
                orderId: true,
                snapshot: { select: { offeringName: true, variantName: true } },
              },
            },
          },
        })
      : null
  if (input.operation === "transition") {
    if (!line || line.commercialOrderLine.orderId !== job.commercialOrderId)
      unavailable(
        "Choose an exact Job Line belonging to this saved Job and Order.",
      )
    prepareServiceJobLineTransition(line, input.toStatus)
  }
  const settings =
    input.operation !== "assign"
      ? await tx.serviceStoreSettings.findUnique({
          where: { storeId: input.storeId },
          select: {
            autoNotifyReminder: true,
            autoNotifyReady: true,
            defaultNotificationChannel: true,
            reminderLeadMinutes: true,
          },
        })
      : null
  const channel =
    job.intake?.notificationChannel ??
    settings?.defaultNotificationChannel ??
    null
  const deliverable = channel === "SMS" || channel === "WHATSAPP"
  // Native ready orchestration is outside transitionServiceJobLine. Do not drop
  // its pending-reminder cancellation or silently dispatch a customer update.
  if (
    input.operation === "transition" &&
    input.toStatus === "ready_for_handoff" &&
    job._count.lines === 1 &&
    (job._count.notificationIntents > 0 ||
      (settings?.autoNotifyReady &&
        deliverable &&
        (job.intake?.customerPhone ?? job.commercialOrder.customerPhone)))
  )
    unavailable(
      "Ready work would change customer reminders or create a ready update. Review it in the Service Job form.",
    )
  if (
    input.operation === "reschedule" &&
    !Number.isFinite(input.promisedAt.getTime())
  )
    unavailable("Choose a valid promised time.")
  const reminder =
    input.operation === "reschedule" &&
    settings?.autoNotifyReminder &&
    job.commercialOrder.customerPhone &&
    deliverable
      ? {
          channel,
          scheduledFor: new Date(
            input.promisedAt.getTime() - settings.reminderLeadMinutes * 60_000,
          ).toISOString(),
        }
      : null
  const amountPaidMinor = effectiveCommercialAmountPaid({
    amountPaidMinor: job.commercialOrder.amountPaidMinor,
    paymentCount: job.commercialOrder._count.payments,
    paymentStatus: job.commercialOrder.paymentStatus,
    totalMinor: job.commercialOrder.totalMinor,
  })
  const review = {
    operation: input.operation,
    jobId: job.id,
    jobRevision: job.revision,
    orderNumber: job.commercialOrder.orderNumber,
    customerName: job.commercialOrder.customerName,
    currencyCode: job.commercialOrder.currencyCode,
    balanceDueMinor: Math.max(
      0,
      job.commercialOrder.totalMinor - amountPaidMinor,
    ),
    currentAssigneeUserId: job.currentAssigneeUserId,
    assignee: assignee
      ? {
          userId: assignee.user.id,
          name: assignee.user.name,
          membershipId: assignee.id,
          accessRevision: assignee.staffAccessRevision,
        }
      : null,
    currentPromise: job.dueCommitments[0]?.promisedAt.toISOString() ?? null,
    promisedAt:
      input.operation === "reschedule" ? input.promisedAt.toISOString() : null,
    line: line
      ? {
          id: line.id,
          revision: line.revision,
          status: line.status,
          authorizationStatus: line.authorizationStatus,
          authorizationPolicy: line.authorizationPolicy,
          quantity: line.allocatedQuantity.toString(),
          offeringName:
            line.commercialOrderLine.snapshot?.offeringName ?? "Service",
          variantName:
            line.commercialOrderLine.snapshot?.variantName ?? "Service",
        }
      : null,
    nextStatus: input.operation === "transition" ? input.toStatus : null,
    replacedReminderCount:
      input.operation === "reschedule" ? job._count.notificationIntents : 0,
    reminder,
    reason: input.reason?.trim() ?? null,
  }
  const target = {
    id: line?.id ?? job.id,
    revision: serviceIntakeReviewRevision({
      actor,
      job,
      assignee,
      line,
      settings,
      input,
      review,
    }),
  }
  return {
    review,
    target,
    async execute(clientCommandId: string) {
      const receipt: { event?: ServiceWorkEventReceipt } = {}
      const capture = (original: ServiceWorkEventReceipt) => {
        receipt.event = original
      }
      const common = {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        reason: input.reason,
      }
      const result =
        input.operation === "assign"
          ? await assignServiceJobInTransaction(
              tx,
              {
                ...common,
                jobId: job.id,
                assigneeUserId: input.assigneeUserId,
                expectedRevision: job.revision,
              },
              capture,
            )
          : input.operation === "reschedule"
            ? await rescheduleServiceJobInTransaction(
                tx,
                {
                  ...common,
                  jobId: job.id,
                  promisedAt: input.promisedAt,
                  reason: input.reason,
                  expectedRevision: job.revision,
                },
                capture,
              )
            : await transitionServiceJobLineInTransaction(
                tx,
                {
                  ...common,
                  lineId: input.lineId,
                  toStatus: input.toStatus,
                  expectedRevision:
                    line?.revision ??
                    unavailable("The selected Job Line is unavailable."),
                  schemaVersion: 1,
                  source: "assistant",
                  clientCommandId,
                },
                capture,
              )
      if (result.id !== job.id)
        unavailable("The original work-history command belongs to another Job.")
      const event = receipt.event
      if (!event)
        unavailable("The original work-history receipt is unavailable.")
      return { job: result, event }
    },
  }
}
