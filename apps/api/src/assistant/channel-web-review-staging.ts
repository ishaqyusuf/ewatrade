import {
  ASSISTANT_REVIEW_LINK_TTL_MS,
  renderWhatsAppWebReview,
} from "@ewatrade/assistant/channels/review-links"
import {
  generalActionSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import type { PrismaClient } from "@ewatrade/db"
import type { WhatsAppInboxLease } from "@ewatrade/db/assistant-whatsapp"
import { createLinkedAssistantContext } from "./channel-principal"
import {
  assertGeneralDraftAction,
  requireGeneralScope,
} from "./general-context"
import { generalProposalWithReview } from "./general-proposals"
import { createAssistantReviewLinkToken } from "./review-link-token"

/** Only the exact proposal emitted by this committed WhatsApp turn receives a web locator. */
export async function prepareAssistantWhatsAppWebReview(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  const inbox = await db.assistantWhatsAppInbox.findFirst({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      kind: "TURN",
      identityId: null,
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
    include: { binding: { include: { identity: true } } },
  })
  const binding = inbox?.binding
  if (
    !inbox ||
    !binding ||
    binding.purpose !== "GENERAL" ||
    !inbox.executionAuthorityDigest
  )
    return undefined
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
      actorUserId: binding.identity.userId,
      conversationId: binding.conversationId,
      revision: source.revision,
      payloadHash: source.payloadHash,
      status: "PENDING",
      expiresAt: { gt: now },
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
  const scope = requireGeneralScope(ctx)
  if (row.tenantId !== scope.tenantId || row.storeId !== scope.storeId)
    return undefined
  assertGeneralDraftAction(ctx, generalActionSchema.parse(row.payload).action)
  const proposal = await generalProposalWithReview(ctx, row)
  if (!proposal.approvalToken) return undefined
  const expiresAt = new Date(
    Math.min(
      row.expiresAt.getTime(),
      (run.completedAt ?? run.startedAt).getTime() +
        ASSISTANT_REVIEW_LINK_TTL_MS,
      inbox.expiresAt.getTime(),
    ),
  )
  if (expiresAt <= now) return undefined
  const token = createAssistantReviewLinkToken({
    version: 1,
    ...source,
    bindingId: binding.id,
    inboxId: inbox.id,
    expiresAt: expiresAt.getTime(),
  })
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin:
      process.env.DASHBOARD_URL ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL ??
      "https://dash.ewatrade.com",
    scopeLabel: `${ctx.tenantContext.tenant.name} · ${ctx.tenantContext.activeStore?.name ?? "Store"}`,
  })
  return body ? { source, body, expiresAt } : undefined
}
