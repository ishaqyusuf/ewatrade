import {
  type GeneralAction,
  type GeneralReceipt,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  CatalogError,
  type ServiceManualMessageInput,
  type ServiceManualMessageReview,
  lockServiceManualMessageTargetInTransaction,
  recordServiceManualMessageInTransaction,
  reviewServiceManualMessageInTransaction,
} from "@ewatrade/db/queries"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type Share = Extract<GeneralAction, { action: "service_message_share" }>

async function operation<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ServiceIntakeReviewError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    if (error instanceof CatalogError)
      throw new TRPCError({
        code: "CONFLICT",
        message: error.message,
        cause: error,
      })
    throw error
  }
}

/** Server-owned command input: recipient, Store and tenant never come from the draft. */
function commandInput(
  ctx: GeneralTransactionContext,
  raw: Share,
): ServiceManualMessageInput {
  const payload = generalActionSchema.parse(raw)
  if (payload.action !== "service_message_share")
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported action." })
  const scope = requireGeneralScope(ctx)
  return {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
    jobId: payload.jobId,
    channel: payload.channel,
    message: payload.message,
    reason: payload.reason,
    alreadyShared: payload.alreadyShared,
  }
}

async function current(
  ctx: GeneralTransactionContext,
  payload: Share,
  lock = false,
) {
  const input = commandInput(ctx, payload)
  return operation(async () => {
    if (lock) await lockServiceManualMessageTargetInTransaction(ctx.db, input)
    return {
      input,
      ...(await reviewServiceManualMessageInTransaction(ctx.db, input)),
    }
  })
}

export const serviceMessageChannelLabel = {
  manual: "in person or another manual way",
  sms: "SMS from your own phone",
  whatsapp: "WhatsApp from your own phone",
} as const

function recipientLabel(review: ServiceManualMessageReview) {
  const contact =
    review.channel === "manual"
      ? (review.recipient.phone ?? review.recipient.email)
      : review.recipient.phone
  return [review.recipient.name ?? "Order customer", contact]
    .filter(Boolean)
    .join(" · ")
}

async function execute(
  ctx: GeneralTransactionContext,
  payload: Share,
  key: string,
  expectedReviewRevision?: string,
): Promise<GeneralReceipt> {
  const input = commandInput(ctx, payload)
  const result = await operation(() =>
    recordServiceManualMessageInTransaction(ctx.db, {
      ...input,
      clientCommandId: key,
      expectedReviewRevision,
    }),
  )
  const r = result.review
  return {
    kind: "service_manual_message",
    recordId: result.intent.id,
    jobId: r.jobId,
    orderId: r.orderId,
    shareId: result.share.id,
    title: "Manual share recorded",
    detail: `${r.orderNumber} · You reported sharing this message by ${serviceMessageChannelLabel[r.channel]} with ${recipientLabel(r)}. Nothing was sent by ewatrade and delivery is not verified. It now appears in the customer's tracking history.`,
  }
}

export const serviceMessageShare: GeneralActionAdapter<Share> = {
  stale:
    "The Job, its customer contact or your access changed. Review this record again.",
  unavailable:
    "This saved Service Job is unavailable for messages at the current Store.",
  async validate(ctx, payload, lock) {
    return (await current(ctx, payload, lock)).target
  },
  async prepareExecution(ctx, payload) {
    const prepared = await current(ctx, payload, true)
    return {
      target: prepared.target,
      execute: (key) => execute(ctx, payload, key, prepared.target.revision),
    }
  },
  async review(ctx, payload) {
    const { review: r, target } = await current(ctx, payload)
    return {
      target,
      lines: [
        `Record that you already shared this message with ${recipientLabel(r)} for ${r.orderNumber}.`,
        `How you shared it: ${serviceMessageChannelLabel[r.channel]}.`,
        `Message: ${r.message}`,
        ...(r.reason ? [`Note: ${r.reason}`] : []),
        "This is a staff-reported record. ewatrade sends nothing, launches no app and does not verify delivery.",
        "The message will appear in the customer's tracking history for this Order.",
      ],
    }
  },
  async execute(ctx, payload, key) {
    return execute(ctx, payload, key)
  },
}
