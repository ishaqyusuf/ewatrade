import { z } from "zod"
import type { Capability } from "../capabilities/types"
import {
  conversationAppLink,
  generalConversationTargetSchema,
} from "./conversation-links"
import { whatsAppCapabilityEnabled } from "./policy"

/** Complete review adapters exist for these actions only; metadata cannot add one. */
export const nativeWhatsAppReviewActions = [
  "customer_create",
  "customer_update",
  "product_create",
  "sale_record",
  "expense_record_simple",
  "money_in_record",
  "money_transfer_simple",
  "payment_links_create",
] as const

export const capabilityActionHandoffReasonSchema = z.enum([
  "complete_app_review",
  "sensitive_app_review",
  "channel_confirmation_unavailable",
])
export type CapabilityActionHandoffReason = z.infer<
  typeof capabilityActionHandoffReasonSchema
>

/** Display/navigation only: no payload, credentials, claimed permission or invented proposal. */
export const capabilityActionHandoffSchema = z
  .object({
    kind: z.literal("action_app_handoff"),
    version: z.literal(1),
    capabilityId: z.string().min(1).max(160),
    action: z.string().min(1).max(128),
    reason: capabilityActionHandoffReasonSchema,
    conversation: generalConversationTargetSchema,
  })
  .strict()
export type CapabilityActionHandoff = z.infer<
  typeof capabilityActionHandoffSchema
>
export type CapabilityActionChannelClassification =
  | { kind: "planned" }
  | { kind: "unavailable" }
  | { kind: "native_review" }
  | { kind: "app_review"; reason: CapabilityActionHandoffReason }

/** Compatibility classification only. The API must separately check fresh destination authority. */
export function classifyCapabilityAction(
  capability: Capability,
  environment: Record<string, string | undefined> = process.env,
): CapabilityActionChannelClassification {
  if (capability.mode !== "write") return { kind: "unavailable" }
  if (capability.rollout === "planned") return { kind: "planned" }
  if (!capability.clients.includes("dashboard")) return { kind: "unavailable" }
  if (capability.domain === "staff" || capability.id.startsWith("settings."))
    return { kind: "app_review", reason: "sensitive_app_review" }
  const hasCompleteReview = nativeWhatsAppReviewActions.some(
    (action) => action === capability.action,
  )
  if (hasCompleteReview && whatsAppCapabilityEnabled(capability, environment))
    return { kind: "native_review" }
  return {
    kind: "app_review",
    reason: hasCompleteReview
      ? "channel_confirmation_unavailable"
      : "complete_app_review",
  }
}

/** Exact existing saved chat route only; a handoff never selects a business or creates a draft. */
export function capabilityActionHandoffLink(
  input: unknown,
  options: Parameters<typeof conversationAppLink>[1],
) {
  const parsed = capabilityActionHandoffSchema.safeParse(input)
  return parsed.success
    ? conversationAppLink(parsed.data.conversation, options)
    : undefined
}

export const capabilityActionHandoffInstruction =
  "Your request is saved in this chat. Open the same chat in EwaTrade to prepare and review this action. No draft or business change was created by this handoff; review and confirmation happen in the app."
