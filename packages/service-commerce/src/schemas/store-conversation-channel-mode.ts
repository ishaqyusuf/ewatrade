import { z } from "zod"

export const STORE_CONVERSATION_DESIRED_MODES = [
  "ewatrade_chat",
  "whatsapp",
  "both",
] as const

export const STORE_CONVERSATION_EFFECTIVE_MODES = [
  ...STORE_CONVERSATION_DESIRED_MODES,
  "unavailable",
] as const

export const STORE_CONVERSATION_CHANNEL_BLOCKERS = [
  "chat_not_configured",
  "chat_unavailable",
  "whatsapp_not_configured",
  "whatsapp_unavailable",
  "whatsapp_policy_unavailable",
  "whatsapp_provider_unavailable",
  "whatsapp_routing_unavailable",
] as const

export const storeConversationDesiredModeSchema = z.enum(
  STORE_CONVERSATION_DESIRED_MODES,
)

export const storeConversationEffectiveModeSchema = z.enum(
  STORE_CONVERSATION_EFFECTIVE_MODES,
)

export const storeConversationChannelBlockerSchema = z.enum(
  STORE_CONVERSATION_CHANNEL_BLOCKERS,
)

const storeIdSchema = z.string().trim().min(1).max(191)

export const storeConversationChannelModeSettingsInputSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export const storeConversationChannelModeUpdateInputSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    desiredMode: storeConversationDesiredModeSchema,
    expectedRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(240),
    storeId: storeIdSchema,
  })
  .strict()

export const storeConversationChannelReadinessSchema = z
  .object({
    available: z.boolean(),
    blockers: z.array(storeConversationChannelBlockerSchema),
  })
  .strict()

export const storeConversationChannelModeProjectionSchema = z
  .object({
    chat: storeConversationChannelReadinessSchema,
    composerEnabled: z.boolean(),
    desiredMode: storeConversationDesiredModeSchema,
    effectiveMode: storeConversationEffectiveModeSchema,
    historyReadable: z.literal(true),
    revision: z.number().int().nonnegative(),
    whatsapp: storeConversationChannelReadinessSchema,
    whatsappAction: z
      .enum(["continue_on_whatsapp", "reach_store_faster_on_whatsapp"])
      .nullable(),
  })
  .strict()

export type StoreConversationDesiredMode = z.infer<
  typeof storeConversationDesiredModeSchema
>
export type StoreConversationEffectiveMode = z.infer<
  typeof storeConversationEffectiveModeSchema
>
export type StoreConversationChannelBlocker = z.infer<
  typeof storeConversationChannelBlockerSchema
>
export type StoreConversationChannelReadiness = z.infer<
  typeof storeConversationChannelReadinessSchema
>
export type StoreConversationChannelModeProjection = z.infer<
  typeof storeConversationChannelModeProjectionSchema
>
