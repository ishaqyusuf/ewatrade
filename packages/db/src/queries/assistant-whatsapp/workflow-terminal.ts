import type { Prisma } from "../../../generated/prisma/client"
import { AssistantWhatsAppError } from "./authority"
import type { WhatsAppConversationPrincipal } from "./conversations"
import {
  resolveAssistantWhatsAppWorkflowReceipt,
  whatsAppWorkflowActionIngressContentSchema,
} from "./workflow-action-reviews"

/** Completed Product chats permit only recovery of this exact already-consumed quoted action receipt. */
export async function resolveAssistantWhatsAppWorkflowActionReceiptScope(
  tx: Prisma.TransactionClient,
  principal: WhatsAppConversationPrincipal,
  content: unknown,
  now = new Date(),
) {
  const parsed = whatsAppWorkflowActionIngressContentSchema.safeParse(content)
  if (!parsed.success) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const action = parsed.data
  const review = await tx.assistantWhatsAppWorkflowReview.findFirst({
    where: {
      bindingId: principal.bindingId,
      state: "CONSUMED",
      completedAt: { not: null },
      decision: action.decision,
      ...(action.decision === "confirm"
        ? { confirmDigest: action.decisionDigest }
        : { cancelDigest: action.decisionDigest }),
      reviewOutbox: {
        phoneNumberId: principal.phoneNumberId,
        providerMessageId: action.replyToMessageId,
        state: { in: ["SENT", "DELIVERED", "READ"] },
        deliveryAttempts: {
          some: {
            state: "ACCEPTED",
            providerMessageId: action.replyToMessageId,
          },
        },
      },
    },
    select: { id: true },
  })
  if (!review) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const resolved = await resolveAssistantWhatsAppWorkflowReceipt(
    tx,
    principal,
    review.id,
    now,
  )
  if (resolved.source.purpose !== action.purpose)
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  return resolved
}
