import {
  type Prisma,
  ServiceNotificationChannel,
  ServiceNotificationIntentStatus,
} from "../../generated/prisma/client"
import {
  ServiceIntakeReviewError,
  assertAssistantServiceIntakeAuthority,
} from "./service-intake-review"
import { serviceIntakeReviewRevision } from "./service-work"
import { assertNonClinicalServiceWorkOrder } from "./service-work-order-scope"

/**
 * G05: staff-reported manual messages for a Service Job. A record says the
 * staff member has ALREADY shared this exact content with the Order's
 * customer themselves (in person, or from their own phone or email). It is
 * saved as a MANUAL, COMPLETED notification with its share, which the
 * provider dispatcher never selects, so nothing is sent automatically. The
 * message then appears in the customer's tracking history. The recipient is
 * always the Order's own snapshot, never caller input.
 */
export type ServiceManualMessageChannel = "manual" | "sms" | "whatsapp"
export type ServiceManualMessageInput = {
  tenantId: string
  storeId: string
  actorUserId: string
  jobId: string
  channel: ServiceManualMessageChannel
  message: string
  reason?: string
  /** The staff member's explicit statement that they already shared it. */
  alreadyShared: true
}
export const serviceManualMessageAudience = "customer"
export const serviceManualMessagePurpose = "assistant_manual_share"
const shareChannel = {
  manual: ServiceNotificationChannel.MANUAL,
  sms: ServiceNotificationChannel.SMS,
  whatsapp: ServiceNotificationChannel.WHATSAPP,
} as const

function conflict(message: string): never {
  throw new ServiceIntakeReviewError("CONFLICT", message)
}

/** Fresh persisted authority; scoped Managers stay refused (no policy grant). */
async function authority(
  tx: Prisma.TransactionClient,
  input: Pick<
    ServiceManualMessageInput,
    "tenantId" | "storeId" | "actorUserId"
  >,
) {
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  if (actor.role === "MANAGER" && actor.staffAccessMode === "SCOPED")
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "Scoped Manager Service messaging is not available yet.",
    )
  return actor
}

const orderSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  orderNumber: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  acceptedCommerceQuoteVersion: {
    select: { quote: { select: { sourceType: true } } },
  },
  prescriptionPickupFulfillment: { select: { id: true } },
  prescriptionDeliveryAddress: { select: { id: true } },
  _count: { select: { prescriptionPaymentIntents: true } },
} as const

async function authorizedJob(
  tx: Prisma.TransactionClient,
  input: Pick<ServiceManualMessageInput, "tenantId" | "storeId" | "jobId">,
) {
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
      commercialOrder: { select: orderSelect },
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
  return job
}

/**
 * Preview only: validates and describes the record without writing. The
 * review binds job identity and revision, the Order's recipient snapshot,
 * the Store, the channel, the exact message, the reason and the explicit
 * already-shared statement.
 */
export async function reviewServiceManualMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceManualMessageInput,
) {
  const actor = await authority(tx, input)
  const job = await authorizedJob(tx, input)
  if (input.alreadyShared !== true)
    conflict("Record a message only after you have shared it yourself.")
  if (!(input.channel in shareChannel)) conflict("Choose how you shared it.")
  const message = input.message.trim()
  if (!message || message.length > 1000)
    conflict("Enter the exact message you shared (up to 1000 characters).")
  const reason = input.reason?.trim() || null
  if (reason && reason.length > 500) conflict("Keep the reason under 500.")
  const order = job.commercialOrder
  const phone = order.customerPhone?.trim() || null
  if (input.channel !== "manual" && !phone)
    conflict(
      "This Order has no customer phone number, so it cannot have been shared by SMS or WhatsApp.",
    )
  const review = {
    jobId: job.id,
    jobRevision: job.revision,
    storeId: input.storeId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    recipient: {
      name: order.customerName?.trim() || null,
      phone,
      email: order.customerEmail?.trim() || null,
    },
    channel: input.channel,
    message,
    reason,
    alreadyShared: true as const,
  }
  return {
    review,
    target: {
      id: job.id,
      revision: serviceIntakeReviewRevision({ actor, review }),
    },
  }
}
export type ServiceManualMessageReview = Awaited<
  ReturnType<typeof reviewServiceManualMessageInTransaction>
>["review"]

/**
 * Locks the Order (recipient source) for share, then the Job for update, in
 * the established Order-before-Job order. Refuses a Job outside the tenant or
 * Store.
 */
export async function lockServiceManualMessageTargetInTransaction(
  tx: Prisma.TransactionClient,
  input: Pick<ServiceManualMessageInput, "tenantId" | "storeId" | "jobId">,
) {
  const orderRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT o."id" FROM "CommercialOrder" o
    JOIN "ServiceJob" j ON j."commercialOrderId" = o."id"
    WHERE j."id" = ${input.jobId} AND j."tenantId" = ${input.tenantId}
      AND j."storeId" = ${input.storeId} AND o."tenantId" = ${input.tenantId}
    FOR SHARE OF o
  `
  if (orderRows.length !== 1)
    conflict("Choose an exact saved Service Job at the current Store.")
  const jobRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ServiceJob"
    WHERE "id" = ${input.jobId} AND "tenantId" = ${input.tenantId}
      AND "storeId" = ${input.storeId}
    FOR UPDATE
  `
  if (jobRows.length !== 1)
    conflict("Choose an exact saved Service Job at the current Store.")
}

/**
 * Records the staff-reported share. Caller owns the transaction. Locks the
 * Order (recipient source) then the Job, in the established order, re-reads
 * them, and compares with the expected review when given. A replay of the
 * same command key returns the original only if every persisted fact
 * matches; otherwise it is refused and nothing changes.
 */
export async function recordServiceManualMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceManualMessageInput & {
    clientCommandId: string
    expectedReviewRevision?: string
  },
) {
  if (input.clientCommandId.trim().length < 8)
    conflict("A stable command identity is required.")
  await lockServiceManualMessageTargetInTransaction(tx, input)
  const { review, target } = await reviewServiceManualMessageInTransaction(
    tx,
    input,
  )
  if (
    input.expectedReviewRevision !== undefined &&
    input.expectedReviewRevision !== target.revision
  )
    conflict("The Job, its customer or your access changed. Review again.")
  const key = {
    tenantId: input.tenantId,
    businessEventKey: input.clientCommandId,
    audienceKey: serviceManualMessageAudience,
    templatePurpose: serviceManualMessagePurpose,
  }
  const existing = await tx.serviceNotificationIntent.findUnique({
    where: { tenantId_businessEventKey_audienceKey_templatePurpose: key },
    include: { manualShares: true, deliveryAttempts: { select: { id: true } } },
  })
  if (existing) {
    const share = existing.manualShares[0]
    if (
      existing.serviceJobId !== review.jobId ||
      existing.storeId !== review.storeId ||
      existing.channel !== ServiceNotificationChannel.MANUAL ||
      existing.status !== ServiceNotificationIntentStatus.COMPLETED ||
      existing.renderedMessage !== review.message ||
      existing.customerPhone !== review.recipient.phone ||
      existing.customerEmail !== review.recipient.email ||
      existing.createdByUserId !== input.actorUserId ||
      existing.manualShares.length !== 1 ||
      existing.deliveryAttempts.length !== 0 ||
      share?.channel !== shareChannel[review.channel] ||
      share?.note !== review.reason ||
      share?.sharedByUserId !== input.actorUserId
    )
      conflict(
        "This command already recorded a different message, recipient or channel. Review a new record.",
      )
    return { intent: existing, share, review, replayed: true as const }
  }
  const now = new Date()
  const intent = await tx.serviceNotificationIntent.create({
    data: {
      ...key,
      storeId: review.storeId,
      serviceJobId: review.jobId,
      channel: ServiceNotificationChannel.MANUAL,
      status: ServiceNotificationIntentStatus.COMPLETED,
      completedAt: now,
      renderedMessage: review.message,
      customerPhone: review.recipient.phone,
      customerEmail: review.recipient.email,
      createdByUserId: input.actorUserId,
    },
  })
  const share = await tx.serviceManualShare.create({
    data: {
      notificationIntentId: intent.id,
      sharedByUserId: input.actorUserId,
      channel: shareChannel[review.channel],
      note: review.reason,
      sharedAt: now,
    },
  })
  return { intent, share, review, replayed: false as const }
}

/**
 * A Job's message history, newest first and bounded at every level. Only
 * safe fields: no provider keys or attempt IDs. Each message is classified
 * without inferring delivery or consent from snapshots.
 */
export async function listServiceJobMessagesInTransaction(
  tx: Prisma.TransactionClient,
  input: Pick<
    ServiceManualMessageInput,
    "tenantId" | "storeId" | "actorUserId" | "jobId"
  > & { limit?: number },
) {
  await authority(tx, input)
  const job = await authorizedJob(tx, input)
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 20)
  const rows = await tx.serviceNotificationIntent.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      serviceJobId: job.id,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      completedAt: true,
      channel: true,
      status: true,
      templatePurpose: true,
      renderedMessage: true,
      customerPhone: true,
      manualShares: {
        orderBy: [{ sharedAt: "desc" }, { id: "desc" }],
        take: 3,
        select: { channel: true, sharedAt: true, note: true },
      },
      deliveryAttempts: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
        select: { channel: true, status: true, createdAt: true },
      },
    },
  })
  const messages = rows.slice(0, limit).map((row) => {
    const attempts = row.deliveryAttempts
    const kind =
      row.channel === ServiceNotificationChannel.MANUAL
        ? ("staff_reported_share" as const)
        : row.status === ServiceNotificationIntentStatus.CANCELLED
          ? ("cancelled" as const)
          : attempts.some((a) => a.status === "DELIVERED")
            ? ("provider_delivered" as const)
            : attempts.some((a) => a.status === "SENT")
              ? ("provider_sent_unconfirmed" as const)
              : attempts.some((a) => a.status === "FAILED")
                ? ("provider_failed" as const)
                : ("provider_pending" as const)
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      kind,
      channel: row.channel,
      status: row.status,
      purpose: row.templatePurpose,
      message:
        row.renderedMessage.length > 300
          ? `${row.renderedMessage.slice(0, 297)}...`
          : row.renderedMessage,
      recipientPhoneLast4: row.customerPhone
        ? row.customerPhone.replace(/\D/g, "").slice(-4) || null
        : null,
      shares: row.manualShares.map((share) => ({
        channel: share.channel,
        sharedAt: share.sharedAt.toISOString(),
        note: share.note,
      })),
      attempts: attempts.map((attempt) => ({
        channel: attempt.channel,
        status: attempt.status,
        at: attempt.createdAt.toISOString(),
      })),
    }
  })
  return {
    jobId: job.id,
    orderNumber: job.commercialOrder.orderNumber,
    messages,
    hasMore: rows.length > limit,
    asOf: new Date().toISOString(),
  }
}
