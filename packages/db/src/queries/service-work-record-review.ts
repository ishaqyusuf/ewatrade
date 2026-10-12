import type { Prisma } from "../../generated/prisma/client"
import { assertNonClinicalServiceWorkOrder } from "./service-work-order-scope"
import {
  ServiceIntakeReviewError,
  assertAssistantServiceIntakeAuthority,
} from "./service-intake-review"
import {
  type RecordServiceExceptionInput,
  addServiceInternalNoteInTransaction,
  recordServiceExceptionInTransaction,
  serviceIntakeReviewRevision,
} from "./service-work"

type Scope = {
  actorUserId: string
  tenantId: string
  storeId: string
  jobId: string
  lineId?: string
}
export type ServiceWorkRecordReviewInput = Scope &
  (
    | { operation: "note"; body: string }
    | {
        operation: "exception"
        type: RecordServiceExceptionInput["type"]
        description: string
      }
  )
function conflict(message: string): never {
  throw new ServiceIntakeReviewError("CONFLICT", message)
}
/** Preparation reads only; native source and original receipt join the caller's transaction. */
export async function prepareReviewedServiceWorkRecordInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceWorkRecordReviewInput,
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
      currentAssigneeUserId: true,
      handedOffAt: true,
      commercialOrder: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          orderNumber: true,
          customerName: true,
          acceptedCommerceQuoteVersion: {
            select: { quote: { select: { sourceType: true } } },
          },
          prescriptionPickupFulfillment: { select: { id: true } },
          prescriptionDeliveryAddress: { select: { id: true } },
          _count: { select: { prescriptionPaymentIntents: true } },
        },
      },
    },
  })
  if (!job) conflict("Choose an exact saved Service Job at the current Store.")
  if (
    job.commercialOrder.id !== job.commercialOrderId ||
    job.commercialOrder.tenantId !== input.tenantId ||
    job.commercialOrder.storeId !== input.storeId
  )
    conflict("This Service Job has an invalid Order linkage.")
  assertNonClinicalServiceWorkOrder(job.commercialOrder)
  const line = input.lineId
    ? await tx.serviceJobLine.findFirst({
        where: { id: input.lineId, serviceJobId: job.id },
        select: {
          id: true,
          revision: true,
          status: true,
          authorizationStatus: true,
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
  if (
    input.lineId &&
    (!line || line.commercialOrderLine.orderId !== job.commercialOrderId)
  )
    conflict("Choose an exact Job Line belonging to this saved Job and Order.")
  const text = (
    input.operation === "note" ? input.body : input.description
  ).trim()
  if (!text || text.length > (input.operation === "note" ? 4000 : 2000))
    conflict("Enter a nonempty work record within its text limit.")
  const review = {
    operation: input.operation,
    jobId: job.id,
    orderNumber: job.commercialOrder.orderNumber,
    customerName: job.commercialOrder.customerName,
    handedOffAt: job.handedOffAt?.toISOString() ?? null,
    line: line
      ? {
          id: line.id,
          status: line.status,
          authorizationStatus: line.authorizationStatus,
          quantity: line.allocatedQuantity.toString(),
          offeringName:
            line.commercialOrderLine.snapshot?.offeringName ?? "Service",
          variantName:
            line.commercialOrderLine.snapshot?.variantName ?? "Service",
        }
      : null,
    text,
    exceptionType: input.operation === "exception" ? input.type : null,
  }
  const target = {
    id: line?.id ?? job.id,
    revision: serviceIntakeReviewRevision({ actor, job, line, input, review }),
  }
  return {
    target,
    review,
    async execute(clientCommandId: string) {
      const common = {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        jobId: job.id,
        lineId: line?.id,
      }
      if (input.operation === "note") {
        const original = await addServiceInternalNoteInTransaction(tx, {
          ...common,
          body: text,
          clientCommandId,
        })
        // Native upsert retains an original note. A changed-payload key collision
        // must not be presented as recording this newly reviewed text or target.
        if (
          original.serviceJobId !== job.id ||
          original.serviceJobLineId !== (line?.id ?? null) ||
          original.actorUserId !== input.actorUserId ||
          original.body !== text
        )
          conflict(
            "This note command belongs to different saved text, actor or work. Review a new note.",
          )
        return { recordType: "note" as const, original }
      }
      const original = await recordServiceExceptionInTransaction(tx, {
        ...common,
        type: input.type,
        description: text,
      })
      if (
        original.serviceJobId !== job.id ||
        original.serviceJobLineId !== (line?.id ?? null) ||
        original.actorUserId !== input.actorUserId
      )
        conflict(
          "The original exception receipt does not belong to this saved work.",
        )
      return { recordType: "exception" as const, original }
    },
  }
}
