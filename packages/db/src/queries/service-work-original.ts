import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  PaymentStatus,
  CommerceQuoteSourceType,
} from "../../generated/prisma/enums"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertAssistantServiceIntakeAuthority,
  ServiceIntakeReviewError,
} from "./service-intake-review"

const id = z.string().trim().min(1).max(128)
export const serviceWorkOriginalInput = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("service_work"), jobId: id, eventId: id })
    .strict(),
  z
    .object({ kind: z.literal("service_work_note"), jobId: id, recordId: id })
    .strict(),
  z
    .object({
      kind: z.literal("service_work_exception"),
      jobId: id,
      recordId: id,
    })
    .strict(),
])
export type ServiceWorkOriginalTarget = z.infer<typeof serviceWorkOriginalInput>
type Input = ServiceWorkOriginalTarget & {
  tenantId: string
  storeId: string
  actorUserId: string
}
function unavailable(message: string): never {
  throw new ServiceIntakeReviewError("FORBIDDEN", message)
}
function eventDetails(type: string, payload: Prisma.JsonValue | null) {
  if (["ASSIGNED", "REASSIGNED"].includes(type)) {
    const parsed = z.object({ assigneeUserId: id }).safeParse(payload)
    return parsed.success
      ? { coverage: "recorded" as const, assignment: parsed.data }
      : { coverage: "unavailable" as const }
  }
  if (["DUE_COMMITMENT_CREATED", "DUE_COMMITMENT_REVISED"].includes(type)) {
    const parsed = z
      .object({
        previousPromisedAt: z.iso.datetime({ offset: true }).nullable(),
        promisedAt: z.iso.datetime({ offset: true }),
      })
      .safeParse(payload)
    return parsed.success
      ? { coverage: "recorded" as const, promise: parsed.data }
      : { coverage: "unavailable" as const }
  }
  if (type === "REWORK") {
    const parsed = z
      .object({
        sourceLineId: id,
        quantity: z.string().superRefine((value, ctx) => {
          try {
            parseExactDecimal(value, { allowZero: false, maxScale: 6 })
          } catch {
            ctx.addIssue({
              code: "custom",
              message: "Invalid original rework quantity",
            })
          }
        }),
      })
      .safeParse(payload)
    return parsed.success
      ? { coverage: "recorded" as const, rework: parsed.data }
      : { coverage: "unavailable" as const }
  }
  if (type === "REMOTE_HANDOFF") {
    const parsed = z
      .object({ paymentStatus: z.enum(PaymentStatus) })
      .safeParse(payload)
    return parsed.success
      ? { coverage: "recorded" as const, handoff: parsed.data }
      : { coverage: "unavailable" as const }
  }
  return { coverage: "not_projected" as const }
}

/** Exact original owning record. No mutation, contact graph or provider capability is read. */
export async function getServiceWorkOriginalInTransaction(
  tx: Prisma.TransactionClient,
  input: Input,
) {
  const target = serviceWorkOriginalInput.parse(
    input.kind === "service_work"
      ? { kind: input.kind, jobId: input.jobId, eventId: input.eventId }
      : { kind: input.kind, jobId: input.jobId, recordId: input.recordId },
  )
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  if (actor.role === "MANAGER" && actor.staffAccessMode === "SCOPED")
    unavailable("Scoped Manager Service history access is not available yet.")
  const [store] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Store" WHERE "id"=${input.storeId} AND "tenantId"=${input.tenantId}
      AND "status"='ACTIVE' FOR SHARE
  `
  if (!store) unavailable("The current Store is unavailable.")
  const [lockedJob] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ServiceJob" WHERE "id"=${target.jobId} AND "tenantId"=${input.tenantId}
      AND "storeId"=${input.storeId} FOR SHARE
  `
  if (!lockedJob)
    unavailable("The original Service Job is unavailable at this Store.")
  const job = await tx.serviceJob.findFirst({
    where: {
      id: target.jobId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      revision: true,
      storeId: true,
      commercialOrderId: true,
      currentAssigneeUserId: true,
      createdAt: true,
      completedAt: true,
      cancelledAt: true,
      handedOffAt: true,
      commercialOrder: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
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
  if (
    !job ||
    job.commercialOrder.id !== job.commercialOrderId ||
    job.commercialOrder.tenantId !== input.tenantId ||
    job.commercialOrder.storeId !== input.storeId
  )
    unavailable("This Service Job has an invalid Order linkage.")
  if (
    job.commercialOrder.acceptedCommerceQuoteVersion?.quote.sourceType ===
      CommerceQuoteSourceType.PRESCRIPTION_REQUEST ||
    job.commercialOrder.prescriptionPickupFulfillment ||
    job.commercialOrder.prescriptionDeliveryAddress ||
    job.commercialOrder._count.prescriptionPaymentIntents > 0
  )
    unavailable(
      "Clinical service records require their separate native workflow.",
    )
  const currentJob = {
    jobId: job.id,
    revision: job.revision,
    storeId: job.storeId,
    orderId: job.commercialOrderId,
    currentAssigneeUserId: job.currentAssigneeUserId,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    cancelledAt: job.cancelledAt?.toISOString() ?? null,
    handedOffAt: job.handedOffAt?.toISOString() ?? null,
  }
  async function checkLine(lineId: string | null) {
    if (!lineId) return null
    const line = await tx.serviceJobLine.findFirst({
      where: { id: lineId, serviceJobId: job!.id },
      select: {
        id: true,
        serviceJobId: true,
        revision: true,
        status: true,
        commercialOrderLine: { select: { orderId: true } },
      },
    })
    if (
      !line ||
      line.serviceJobId !== job!.id ||
      line.commercialOrderLine.orderId !== job!.commercialOrderId
    )
      unavailable(
        "The original record's line does not belong to this saved Job and Order.",
      )
    return { lineId: line.id, revision: line.revision, status: line.status }
  }
  const common = {
    jobId: job.id,
    scope: "current_store_original_service_record" as const,
    currentJob,
    asOf: new Date().toISOString(),
    identityCoverage: "recorded_user_references_no_historical_names" as const,
    detail:
      "Original owning record and stored times are separate from the current Job/Line. User references are recorded IDs, not historical display names. No customer/contact/clinical graph, evidence or provider capability is exposed.",
  }
  if (target.kind === "service_work") {
    const event = await tx.serviceWorkEvent.findFirst({
      where: {
        id: target.eventId,
        tenantId: input.tenantId,
        serviceJobId: job.id,
      },
      select: {
        id: true,
        tenantId: true,
        serviceJobId: true,
        serviceJobLineId: true,
        actorUserId: true,
        type: true,
        source: true,
        reason: true,
        payload: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
        effectiveAt: true,
      },
    })
    if (
      !event ||
      event.tenantId !== input.tenantId ||
      event.serviceJobId !== job.id
    )
      unavailable("The exact original work event is unavailable for this Job.")
    return {
      ...common,
      kind: target.kind,
      source: "ServiceWorkEvent" as const,
      currentLine: await checkLine(event.serviceJobLineId),
      original: {
        eventId: event.id,
        jobId: event.serviceJobId,
        lineId: event.serviceJobLineId,
        actorUserId: event.actorUserId,
        type: event.type,
        source: event.source,
        reason: event.reason,
        beforeStatus: event.fromStatus,
        afterStatus: event.toStatus,
        createdAt: event.createdAt.toISOString(),
        effectiveAt: event.effectiveAt.toISOString(),
        details: eventDetails(event.type, event.payload),
      },
    }
  }
  if (target.kind === "service_work_note") {
    const note = await tx.serviceInternalNote.findFirst({
      where: { id: target.recordId, serviceJobId: job.id },
      select: {
        id: true,
        serviceJobId: true,
        serviceJobLineId: true,
        body: true,
        actorUserId: true,
        createdAt: true,
      },
    })
    if (!note || note.serviceJobId !== job.id)
      unavailable(
        "The exact original internal note is unavailable for this Job.",
      )
    return {
      ...common,
      kind: target.kind,
      source: "ServiceInternalNote" as const,
      currentLine: await checkLine(note.serviceJobLineId),
      original: {
        recordId: note.id,
        jobId: note.serviceJobId,
        lineId: note.serviceJobLineId,
        body: note.body,
        actorUserId: note.actorUserId,
        createdAt: note.createdAt.toISOString(),
      },
    }
  }
  const exception = await tx.serviceException.findFirst({
    where: { id: target.recordId, serviceJobId: job.id },
    select: {
      id: true,
      serviceJobId: true,
      serviceJobLineId: true,
      type: true,
      description: true,
      actorUserId: true,
      occurredAt: true,
      createdAt: true,
      outcome: true,
      resolvedAt: true,
      resolvedByUserId: true,
      updatedAt: true,
    },
  })
  if (!exception || exception.serviceJobId !== job.id)
    unavailable("The exact original exception is unavailable for this Job.")
  return {
    ...common,
    kind: target.kind,
    source: "ServiceException" as const,
    currentLine: await checkLine(exception.serviceJobLineId),
    original: {
      recordId: exception.id,
      jobId: exception.serviceJobId,
      lineId: exception.serviceJobLineId,
      type: exception.type,
      description: exception.description,
      actorUserId: exception.actorUserId,
      occurredAt: exception.occurredAt.toISOString(),
      createdAt: exception.createdAt.toISOString(),
    },
    currentException: {
      outcome: exception.outcome,
      resolvedAt: exception.resolvedAt?.toISOString() ?? null,
      resolvedByUserId: exception.resolvedByUserId,
      updatedAt: exception.updatedAt.toISOString(),
    },
    originalOutcomeCoverage: "creation_outcome_not_immutably_recorded" as const,
  }
}

export function getServiceWorkOriginal(db: PrismaClient, input: Input) {
  return db.$transaction(
    (tx) => getServiceWorkOriginalInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: "RepeatableRead",
    },
  )
}
export type ServiceWorkOriginalRecord = Awaited<
  ReturnType<typeof getServiceWorkOriginalInTransaction>
>
