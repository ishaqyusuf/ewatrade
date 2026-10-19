import { renderWhatsAppActionReviewBody } from "@ewatrade/assistant/channels/action-review"
import {
  generalActionSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import type { PrismaClient } from "@ewatrade/db"
import type { WhatsAppInboxLease } from "@ewatrade/db/assistant-whatsapp"
import { createLinkedAssistantContext } from "./channel-principal"
import { buildChannelProposalReview } from "./channel-proposal-review"
import { assertGeneralAction } from "./general-context"

/** Exact committed source, never the newest proposal or generated prose. */
export async function prepareAssistantWhatsAppReview(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  const inbox = await db.assistantWhatsAppInbox.findFirst({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      kind: "TURN",
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
    },
    include: { binding: { include: { identity: true } } },
  })
  if (!inbox?.binding || !inbox.executionAuthorityDigest) return undefined
  const binding = inbox.binding
  const run = await db.assistantRun.findFirst({
    where: {
      requestId: inbox.requestId,
      actorUserId: binding.identity.userId,
      conversationId: binding.conversationId,
      status: "COMPLETED",
    },
    include: { assistantMessage: true },
  })
  if (!run?.assistantMessage || !Array.isArray(run.assistantMessage.parts))
    return undefined
  const references = run.assistantMessage.parts.flatMap((part) => {
    const parsed = generalStoredPartSchema.safeParse(part)
    return parsed.success &&
      parsed.data.type === "data-general-proposal-reference"
      ? [parsed.data.data]
      : []
  })
  if (references.length !== 1) return undefined
  const source = references[0]
  if (!source) return undefined
  const row = await db.assistantActionProposal.findFirst({
    where: {
      id: source.proposalId,
      conversationId: binding.conversationId,
      actorUserId: binding.identity.userId,
      revision: source.revision,
      payloadHash: source.payloadHash,
      status: "PENDING",
    },
  })
  if (!row) return undefined
  const ctx = await createLinkedAssistantContext(
    db,
    {
      kind: "linked_whatsapp",
      phoneNumberId: binding.identity.phoneNumberId,
      senderId: binding.identity.senderId,
      bindingId: binding.id,
      grantId: binding.grantId,
      identityGeneration: binding.identityGeneration,
      grantGeneration: binding.grantGeneration,
      selectionGeneration: binding.selectionGeneration,
    },
    inbox.requestId,
    lease,
  )
  assertGeneralAction(ctx, generalActionSchema.parse(row.payload).action)
  const projection = await buildChannelProposalReview(ctx, row, now.getTime())
  if (projection.kind !== "review") return undefined
  const expiresAt = new Date(
    Math.min(
      Date.parse(projection.review.expiresAt),
      (run.completedAt ?? run.startedAt).getTime() + 5 * 60_000,
      inbox.expiresAt.getTime(),
    ),
  )
  const review = { ...projection.review, expiresAt: expiresAt.toISOString() }
  const rendered = renderWhatsAppActionReviewBody(review, {
    now: now.getTime(),
  })
  return rendered.kind === "review"
    ? {
        source,
        targetRevision: row.targetRevision,
        body: rendered.body,
        expiresAt,
      }
    : undefined
}
