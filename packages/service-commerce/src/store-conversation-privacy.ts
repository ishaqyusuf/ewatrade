export const STORE_CONVERSATION_RETENTION_CLASSIFICATIONS = [
  "guest_credential",
  "verified_contact",
  "presentation_message",
  "generic_media",
  "provider_attempt",
  "security_evidence",
  "commercial_record",
  "clinical_record",
  "immutable_audit",
] as const

export type StoreConversationRetentionClassification =
  (typeof STORE_CONVERSATION_RETENTION_CLASSIFICATIONS)[number]

export type StoreConversationPrivacyOutcome = {
  classification: StoreConversationRetentionClassification
  status: "removed" | "retained_required" | "unavailable"
}

export const storeConversationRetentionClassificationSchema = z.enum(
  STORE_CONVERSATION_RETENTION_CLASSIFICATIONS,
)

const privacyRequestFields = {
  classifications: z
    .array(storeConversationRetentionClassificationSchema)
    .min(1)
    .max(STORE_CONVERSATION_RETENTION_CLASSIFICATIONS.length)
    .transform((values) => [...new Set(values)].sort()),
  clientOperationId: z.string().trim().min(8).max(160),
  conversationId: z.string().trim().min(1).max(191),
  publicToken: z.string().trim().min(32).max(200),
}

export const storeConversationAccountPrivacyRequestInputSchema = z
  .object(privacyRequestFields)
  .strict()

export const storeConversationGuestPrivacyRequestInputSchema = z
  .object({
    ...privacyRequestFields,
    challenge: z
      .object({
        challengeId: z.string().trim().min(1).max(191),
        proofToken: z.string().trim().min(32).max(500),
      })
      .strict(),
  })
  .strict()

export const storeConversationPrivacyRequestInputSchema =
  storeConversationGuestPrivacyRequestInputSchema.partial({ challenge: true })

export const storeConversationPrivacyRequestStatusInputSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(191),
    privacyRequestId: z.string().trim().min(1).max(191),
    publicToken: z.string().trim().min(32).max(200),
  })
  .strict()

export const STORE_CONVERSATION_PRESENTATION_TOMBSTONE =
  "Message removed following a customer privacy request."

const retentionPolicy = {
  clinical_record: { customerErasable: false, defaultDays: null },
  commercial_record: { customerErasable: false, defaultDays: null },
  generic_media: { customerErasable: true, defaultDays: 365 },
  guest_credential: { customerErasable: true, defaultDays: 180 },
  immutable_audit: { customerErasable: false, defaultDays: null },
  presentation_message: { customerErasable: true, defaultDays: 365 },
  provider_attempt: { customerErasable: true, defaultDays: 90 },
  security_evidence: { customerErasable: false, defaultDays: 30 },
  verified_contact: { customerErasable: true, defaultDays: 365 },
} as const satisfies Record<
  StoreConversationRetentionClassification,
  { customerErasable: boolean; defaultDays: number | null }
>

export function getStoreConversationRetentionPolicy(
  classification: StoreConversationRetentionClassification,
) {
  return retentionPolicy[classification]
}

export function projectStoreConversationPrivacyOutcomes(input: {
  available: ReadonlySet<StoreConversationRetentionClassification>
  removed: ReadonlySet<StoreConversationRetentionClassification>
  requested: readonly StoreConversationRetentionClassification[]
}): StoreConversationPrivacyOutcome[] {
  return input.requested.map((classification) => ({
    classification,
    status: input.removed.has(classification)
      ? "removed"
      : !getStoreConversationRetentionPolicy(classification).customerErasable
        ? "retained_required"
        : input.available.has(classification)
          ? "retained_required"
          : "unavailable",
  }))
}
import { z } from "zod"
