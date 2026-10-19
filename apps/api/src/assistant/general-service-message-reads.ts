import type {
  readServiceManualMessageEditorContextInTransaction,
  readServiceManualMessageOriginalInTransaction,
} from "@ewatrade/db/queries"

type Context = Awaited<
  ReturnType<typeof readServiceManualMessageEditorContextInTransaction>
>
type Original = Awaited<
  ReturnType<typeof readServiceManualMessageOriginalInTransaction>
>
/** Model projections are explicit allowlists; protected client reads show saved contacts. */
export function serviceMessageModelContext(value: Context) {
  return {
    actorUserId: value.actorUserId,
    tenantId: value.tenantId,
    storeId: value.storeId,
    job: { id: value.job.id, revision: value.job.revision },
    order: { id: value.order.id, number: value.order.number },
    recipient: {
      name: value.recipient.name,
      hasPhone: Boolean(value.recipient.phone),
      hasEmail: Boolean(value.recipient.email),
    },
    asOf: value.asOf,
  }
}
export function serviceMessageModelOriginal(value: Original) {
  const phone = value.intent.recipient.phone?.replace(/\D/g, "")
  return {
    actorUserId: value.actorUserId,
    tenantId: value.tenantId,
    storeId: value.storeId,
    job: { id: value.job.id, revision: value.job.revision },
    order: { id: value.order.id, number: value.order.number },
    intent: {
      id: value.intent.id,
      channel: value.intent.channel,
      status: value.intent.status,
      purpose: value.intent.purpose,
      message: value.intent.message,
      recipient: {
        phoneLast4: phone?.slice(-4) || null,
        hasEmail: Boolean(value.intent.recipient.email),
      },
      createdAt: value.intent.createdAt,
      completedAt: value.intent.completedAt,
    },
    share: {
      id: value.share.id,
      channel: value.share.channel,
      note: value.share.note,
      sharedAt: value.share.sharedAt,
      sharedByUserId: value.share.sharedByUserId,
    },
    currentOrderRecipientName: value.currentOrderRecipientName,
    asOf: value.asOf,
    kind: value.kind,
    sending: value.sending,
    delivery: value.delivery,
  }
}
