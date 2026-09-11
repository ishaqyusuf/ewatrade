import { z } from "zod"

export const STORE_CONVERSATION_WHATSAPP_CANDIDATE_ACTIONS = [
  "continue",
  "start_new",
  "not_mine",
] as const

export const STORE_CONVERSATION_WHATSAPP_CANDIDATE_STATES = [
  "pending",
  "continued",
  "started_new",
  "rejected",
  "expired",
] as const

export const STORE_CONVERSATION_WHATSAPP_OBSERVATION_DIRECTIONS = [
  "inbound",
  "outbound",
] as const

export const STORE_CONVERSATION_WHATSAPP_OBSERVATION_PROVENANCE = [
  "cloud_api_inbound",
  "cloud_api_outbound",
  "business_app_echo",
  "business_app_history",
] as const

export const STORE_CONVERSATION_WHATSAPP_OBSERVATION_STATUSES = [
  "received",
  "sent",
  "delivered",
  "read",
  "failed",
  "deleted",
  "unsupported",
] as const

export const storeConversationWhatsAppCandidateActionSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_CANDIDATE_ACTIONS,
)

export const storeConversationWhatsAppCandidateActionTokenSchema = z
  .string()
  .regex(/^ewc1_[A-Za-z0-9_-]{43}$/)

export const storeConversationWhatsAppCandidateStateSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_CANDIDATE_STATES,
)

export const storeConversationWhatsAppObservationDirectionSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_OBSERVATION_DIRECTIONS,
)

export const storeConversationWhatsAppObservationProvenanceSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_OBSERVATION_PROVENANCE,
)

export const storeConversationWhatsAppObservationStatusSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_OBSERVATION_STATUSES,
)

export const storeConversationWhatsAppCandidatePromptSchema = z
  .object({
    actions: z
      .array(
        z
          .object({
            action: storeConversationWhatsAppCandidateActionSchema,
            label: z.string().trim().min(1).max(80),
          })
          .strict(),
      )
      .length(3),
    message: z.string().trim().min(1).max(240),
  })
  .strict()

export const storeConversationWhatsAppObservedStatusProjectionSchema = z
  .object({
    occurredAt: z.date(),
    provenance: storeConversationWhatsAppObservationProvenanceSchema,
    status: storeConversationWhatsAppObservationStatusSchema,
  })
  .strict()

export type StoreConversationWhatsAppCandidateAction = z.infer<
  typeof storeConversationWhatsAppCandidateActionSchema
>
export type StoreConversationWhatsAppCandidatePrompt = z.infer<
  typeof storeConversationWhatsAppCandidatePromptSchema
>
export type StoreConversationWhatsAppObservationProvenance = z.infer<
  typeof storeConversationWhatsAppObservationProvenanceSchema
>
export type StoreConversationWhatsAppObservationStatus = z.infer<
  typeof storeConversationWhatsAppObservationStatusSchema
>
export type StoreConversationWhatsAppObservedStatusProjection = z.infer<
  typeof storeConversationWhatsAppObservedStatusProjectionSchema
>
