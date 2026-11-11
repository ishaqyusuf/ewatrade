import {
  orderReviewPageCommandSchema,
  orderReviewPageReferenceSchema,
} from "@ewatrade/assistant/channels/order-review"
import {
  type AssistantStoredMessage,
  beginAssistantRunInTransaction,
  completeAssistantRunInTransaction,
} from "@ewatrade/db/assistant"
import {
  AssistantWhatsAppError,
  type WhatsAppInboxLease,
  advanceNativeOrderReviewPage,
  assertAssistantWhatsAppInboxLease,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  isLinkedWhatsAppIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import { type GeneralContext, assertGeneralAction } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"

const MODEL = {
  provider: "deterministic",
  model: "whatsapp-order-review-page-v1",
  promptVersion: "whatsapp-order-review-page-v1",
}
/** Bound navigation only. It never calls the model, proposal decision or a business command. */
export async function processAssistantWhatsAppOrderReviewPageTurn(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  inbox: { requestId: string; userMessageId: string; content: unknown },
): Promise<boolean> {
  const parsed = orderReviewPageCommandSchema.safeParse(inbox.content)
  const invalid = Boolean(
    inbox.content &&
      typeof inbox.content === "object" &&
      "type" in inbox.content &&
      inbox.content.type === "invalid_order_review_page",
  )
  if (!parsed.success && !invalid) return false
  await inFreshGeneralTransaction(ctx, async (fresh) => {
    if (!isLinkedWhatsAppIdentity(fresh.session))
      throw new AssistantWhatsAppError("UNAUTHORIZED")
    await assertAssistantWhatsAppInboxLease(fresh.db, lease)
    const resolved = await lockLinkedAssistantIdentity(fresh.db, fresh.session)
    await stampAssistantWhatsAppExecution(fresh.db, lease, resolved)
    let reference:
      | ReturnType<typeof orderReviewPageReferenceSchema.parse>
      | undefined
    try {
      assertGeneralAction(fresh, "order_create")
      if (parsed.success)
        reference = orderReviewPageReferenceSchema.parse({
          type: "data-whatsapp-order-review-page",
          data: await advanceNativeOrderReviewPage(
            fresh.db,
            resolved,
            parsed.data,
            lease.inboxId,
          ),
        })
    } catch (error) {
      if (
        !(error instanceof AssistantWhatsAppError) &&
        !(error instanceof TRPCError)
      )
        throw error
    }
    const begun = await beginAssistantRunInTransaction(fresh.db, {
      ...MODEL,
      actorUserId: resolved.scope.userId,
      conversationId: resolved.conversation.id,
      requestId: inbox.requestId,
      userMessage: {
        id: inbox.userMessageId,
        role: "user",
        parts: [
          {
            type: "text",
            text:
              parsed.success && parsed.data.direction === "previous"
                ? "Previous page of this sale review."
                : "Next page of this sale review.",
          },
        ],
      },
    })
    if (begun.replay) return
    const parts: AssistantStoredMessage["parts"] = reference
      ? [
          {
            type: "data-general-proposal-reference",
            data: reference.data.source,
          },
          reference,
        ]
      : [
          {
            type: "text",
            text: "That sale review changed or expired. Nothing was saved. Ask for a fresh review.",
          },
        ]
    await completeAssistantRunInTransaction(fresh.db, {
      ...MODEL,
      runId: begun.run.id,
      tenantId: resolved.scope.tenantId,
      actorUserId: resolved.scope.userId,
      status: "COMPLETED",
      assistantMessage: {
        id: `${inbox.requestId}-order-page`,
        role: "assistant",
        parts,
      },
    })
  })
  return true
}
