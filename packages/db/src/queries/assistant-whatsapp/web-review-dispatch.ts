import {
  assistantReviewLinkTokenSchema,
  renderWhatsAppWebReview,
} from "@ewatrade/assistant/channels/review-links"
import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"
import type { DbClient } from "../types"
import { assistantWhatsAppActionPayloadDigest } from "./action-reviews"
import {
  assistantReviewShortOutboxId,
  createAssistantReviewShortLocator,
  readAssistantReviewLinkToken,
} from "./web-review-token"

/** Dispatch rechecks the exact current draft; expired/edited/cancelled links are never sent as fresh reviews. */
export async function resolveAssistantWhatsAppWebReviewDispatch(
  db: DbClient,
  input: {
    content: string
    outboxId?: string
    inboxId: string
    bindingId: string
    conversationId: string
    actorUserId: string
    tenantId: string
    storeId: string
    scopeLabel: string
    messageId: string
    trustedAppOrigin: string
    now: Date
  },
): Promise<{ body: string; expiresAt: number } | undefined> {
  const href = input.content.match(/^Review draft: (\S+)$/m)?.[1]
  if (!href) return undefined
  let token: string
  try {
    const url = new URL(href)
    const parsed = assistantReviewLinkTokenSchema.safeParse(
      url.searchParams.get("token"),
    )
    if (!parsed.success) return undefined
    token = parsed.data
  } catch {
    return undefined
  }
  const source = readAssistantReviewLinkToken(token)
  if (
    !source ||
    source.expiresAt <= input.now.getTime() ||
    source.inboxId !== input.inboxId ||
    source.bindingId !== input.bindingId
  )
    return undefined
  const message = await db.assistantMessage.findFirst({
    where: {
      id: input.messageId,
      conversationId: input.conversationId,
      role: "assistant",
    },
    select: { parts: true },
  })
  if (!Array.isArray(message?.parts)) return undefined
  const references = message.parts.flatMap((part) => {
    const parsed = generalStoredPartSchema.safeParse(part)
    return parsed.success &&
      parsed.data.type === "data-general-proposal-reference"
      ? [parsed.data.data]
      : []
  })
  if (
    references.length !== 1 ||
    references[0]?.proposalId !== source.proposalId ||
    references[0]?.revision !== (source.originRevision ?? source.revision) ||
    references[0]?.payloadHash !==
      (source.originPayloadHash ?? source.payloadHash)
  )
    return undefined
  const proposal = await db.assistantActionProposal.findFirst({
    where: {
      id: source.proposalId,
      revision: source.revision,
      payloadHash: source.payloadHash,
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      conversationId: input.conversationId,
      status: "PENDING",
      expiresAt: { gt: input.now },
    },
  })
  if (
    !proposal ||
    assistantWhatsAppActionPayloadDigest(proposal.payload) !==
      source.payloadHash ||
    source.expiresAt > proposal.expiresAt.getTime()
  )
    return undefined
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: input.trustedAppOrigin,
    scopeLabel: input.scopeLabel,
  })
  if (body !== input.content) return undefined
  if (input.outboxId?.startsWith("wa-review_")) {
    const locator = createAssistantReviewShortLocator(token)
    if (input.outboxId !== assistantReviewShortOutboxId(locator))
      return undefined
    const shortBody = renderWhatsAppWebReview({
      token: locator,
      trustedAppOrigin: input.trustedAppOrigin,
      scopeLabel: input.scopeLabel,
    })
    return shortBody
      ? { body: shortBody, expiresAt: source.expiresAt }
      : undefined
  }
  return { body, expiresAt: source.expiresAt }
}
