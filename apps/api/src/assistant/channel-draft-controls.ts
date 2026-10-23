import type { resolveAssistantWhatsAppConversation } from "@ewatrade/db/assistant-whatsapp"
import type { Prisma } from "@ewatrade/db/types"
import { resolveLinkedAssistantIdentity } from "./channel-principal"
import { cancelCurrentWhatsAppEditInTransaction } from "./channel-proposal-edit"
import type { GeneralTransactionContext } from "./general-actions"
import { decideGeneralProposalInTransaction } from "./general-proposals"

type Selected = Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>
export const defaultWhatsAppDraftControlDependencies = () => ({
  resolve: resolveLinkedAssistantIdentity,
  decide: decideGeneralProposalInTransaction,
  cancelEdit: cancelCurrentWhatsAppEditInTransaction,
})

/** Same actor, scope and saved chat only. CANCEL never revokes a channel or changes a business record. */
export async function cancelAssistantWhatsAppCurrentDraft(
  selected: Selected,
  db: Prisma.TransactionClient,
  requestId: string,
  deps = defaultWhatsAppDraftControlDependencies(),
): Promise<string> {
  if (selected.conversation.purpose !== "GENERAL")
    return "Use that saved workflow's exact Cancel option or open it in EwaTrade. Your WhatsApp connection stays active."
  const current = await deps.resolve(db, {
    ...selected.principal,
    bindingId: selected.binding.id,
    selectionGeneration: selected.binding.selectionGeneration,
  })
  const scope = current.scope
  const fresh: GeneralTransactionContext = {
    db,
    session: current.identity,
    tenantContext: current.tenantContext,
    tenantId: scope.tenantId,
    tenantSlug: current.tenantContext.tenant.slug,
    activeStoreId: scope.storeId,
    assistantConversationId: current.conversation.id,
    requestHeaders: new Headers(),
    requestId,
    cfRay: null,
    isInternalRequest: false,
    forcePrimary: true,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: null,
    qaSessionScope: null,
  }
  if (await deps.cancelEdit(fresh))
    return "Draft cancelled. No business record was changed. Your WhatsApp connection stays active."
  const rows = await db.assistantActionProposal.findMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.userId,
      conversationId: current.conversation.id,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true, revision: true },
  })
  if (!rows.length)
    return "There is no pending draft to cancel in this chat. Your WhatsApp connection stays active."
  if (rows.length > 1)
    return "More than one draft is pending in this chat. Use the exact draft's Cancel button, or open this saved chat in EwaTrade. Nothing was cancelled. Your WhatsApp connection stays active."

  const row = rows[0]
  if (!row) throw Error("Draft selection changed.")
  const cancelled = await deps.decide(fresh, {
    proposalId: row.id,
    revision: row.revision,
    decision: "cancel",
  })
  if (cancelled.status !== "CANCELLED")
    throw Error("Draft cancellation changed.")
  return "Draft cancelled. No business record was changed. Your WhatsApp connection stays active."
}
