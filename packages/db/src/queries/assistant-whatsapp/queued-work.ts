import { Prisma } from "../../../generated/prisma/client"
import { cancelAssistantWhatsAppPendingMediaInTransaction } from "./media-source-lifecycle"

/** Selection changes stop queued disclosure. A possible HTTP effect remains reconcilable metadata. */
export async function cancelAssistantWhatsAppQueuedWorkInTransaction(
  tx: Prisma.TransactionClient,
  identityId: string,
  keepBindingId: string | null,
  now = new Date(),
  options: {
    grantId?: string
    includeControls?: boolean
    reason?:
      | "GRANT_REVOKED"
      | "GRANT_EXPIRED"
      | "CHANNEL_DISCONNECTED"
      | "CONSENT_RENEWED"
  } = {},
) {
  const reason = options.reason ?? "SELECTION_CHANGED"
  // Resolve ownership once; nested outbox->inbox->binding predicates create unrelated SSI conflicts.
  const bindings = await tx.assistantWhatsAppBinding.findMany({
    where: {
      identityId,
      ...(keepBindingId ? { id: { not: keepBindingId } } : {}),
      ...(options.grantId ? { grantId: options.grantId } : {}),
    },
    select: { id: true },
  })
  const inbox = bindings.length
    ? await tx.assistantWhatsAppInbox.findMany({
        where: { bindingId: { in: bindings.map((row) => row.id) } },
        select: { id: true, state: true },
      })
    : []
  await cancelAssistantWhatsAppPendingMediaInTransaction(
    tx,
    inbox.map((row) => row.id),
    now,
  )
  if (bindings.length) {
    await tx.assistantWhatsAppActionReview.updateMany({
      where: {
        bindingId: { in: bindings.map((row) => row.id) },
        state: "PENDING",
      },
      data: { state: "CANCELLED", completedAt: now },
    })
    await tx.assistantWhatsAppWorkflowReview.updateMany({
      where: {
        bindingId: { in: bindings.map((row) => row.id) },
        state: "PENDING",
      },
      data: { state: "CANCELLED", completedAt: now },
    })
  }
  if (options.includeControls)
    inbox.push(
      ...(await tx.assistantWhatsAppInbox.findMany({
        where: { kind: "CONTROL", identityId, bindingId: null },
        select: { id: true, state: true },
      })),
    )
  const output = inbox.length
    ? await tx.assistantWhatsAppOutbox.findMany({
        where: {
          inboxId: { in: inbox.map((row) => row.id) },
          OR: [
            { state: { in: ["PENDING", "SENDING"] } },
            { content: { not: null } },
          ],
        },
        select: { id: true, state: true },
      })
    : []
  const pending = output
    .filter((row) => row.state === "PENDING")
    .map((row) => row.id)
  const sending = output
    .filter((row) => row.state === "SENDING")
    .map((row) => row.id)
  const retained = output
    .filter((row) => !["PENDING", "SENDING"].includes(row.state))
    .map((row) => row.id)
  const active = inbox.filter((row) =>
    ["PENDING", "PROCESSING"].includes(row.state),
  )
  const completed = inbox.filter(
    (row) => !["PENDING", "PROCESSING"].includes(row.state),
  )
  if (active.length)
    await tx.assistantWhatsAppInbox.updateMany({
      where: { id: { in: active.map((row) => row.id) } },
      data: {
        state: "CANCELLED",
        content: Prisma.DbNull,
        errorCode: reason,
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    })
  const cleared = completed.length
    ? (
        await tx.assistantWhatsAppInbox.updateMany({
          where: {
            id: { in: completed.map((row) => row.id) },
            content: { not: Prisma.DbNull },
          },
          data: { content: Prisma.DbNull },
        })
      ).count
    : 0
  if (pending.length)
    await tx.assistantWhatsAppOutbox.updateMany({
      where: { id: { in: pending } },
      data: {
        state: "CANCELLED",
        content: null,
        errorCode: reason,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    })
  let attempts = 0
  if (sending.length) {
    attempts = (
      await tx.assistantWhatsAppAttempt.updateMany({
        where: { outboxId: { in: sending }, state: "STARTED" },
        data: { state: "UNKNOWN", errorCode: `${reason}_AFTER_INTENT` },
      })
    ).count
    await tx.assistantWhatsAppOutbox.updateMany({
      where: { id: { in: sending } },
      data: {
        state: "UNKNOWN",
        content: null,
        errorCode: `${reason}_AFTER_INTENT`,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    })
  }
  if (retained.length)
    await tx.assistantWhatsAppOutbox.updateMany({
      where: { id: { in: retained } },
      data: { content: null },
    })
  return {
    inbox: active.length + cleared,
    pending: pending.length,
    uncertain: sending.length,
    attempts,
  }
}
