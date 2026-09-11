import type {
  StoreConversationPrivacyOutcome,
  StoreConversationRetentionClassification,
} from "@ewatrade/service-commerce"

export const CUSTOMER_CONVERSATION_PRIVACY_OPTIONS = [
  {
    description: "Replace presentation text with a neutral placeholder.",
    label: "Chat messages",
    value: "presentation_message",
  },
  {
    description: "Remove eligible non-clinical files and audio.",
    label: "Generic attachments",
    value: "generic_media",
  },
  {
    description: "Revoke verified notification destinations.",
    label: "Notification contacts",
    value: "verified_contact",
  },
  {
    description: "End guest-device access; account access remains.",
    label: "Guest devices",
    value: "guest_credential",
  },
  {
    description:
      "Check which commercial, clinical, and audit records must stay.",
    label: "Required records",
    value: "commercial_record",
  },
] as const satisfies ReadonlyArray<{
  description: string
  label: string
  value: StoreConversationRetentionClassification
}>

const classificationLabels = {
  clinical_record: "Clinical records",
  commercial_record: "Required records",
  generic_media: "Generic attachments",
  guest_credential: "Guest devices",
  immutable_audit: "Audit records",
  presentation_message: "Chat messages",
  provider_attempt: "Provider attempts",
  security_evidence: "Security evidence",
  verified_contact: "Notification contacts",
} as const satisfies Record<StoreConversationRetentionClassification, string>

const outcomeLabels = {
  removed: "removed",
  retained_required: "retained as required",
  unavailable: "unavailable",
} as const satisfies Record<StoreConversationPrivacyOutcome["status"], string>

export function formatCustomerConversationPrivacyOutcome(
  outcome: StoreConversationPrivacyOutcome,
) {
  return `${classificationLabels[outcome.classification]}: ${outcomeLabels[outcome.status]}`
}

export function projectCustomerConversationPrivacyRequestStatus(input: {
  outcomes: readonly StoreConversationPrivacyOutcome[]
  readError?: boolean
  status: "completed" | "failed" | "pending" | "processing" | null
}) {
  if (input.readError) {
    return {
      detail: "We couldn't refresh this request. Try again.",
      title: "Privacy status unavailable",
      tone: "destructive" as const,
    }
  }

  if (input.status === "failed") {
    return {
      detail:
        "This request could not be completed. Try again or contact support.",
      title: "Privacy request needs attention",
      tone: "destructive" as const,
    }
  }

  return {
    detail:
      input.outcomes.length > 0
        ? input.outcomes
            .map(formatCustomerConversationPrivacyOutcome)
            .join(" · ")
        : "Your request is queued. Refresh to see each category’s result.",
    title:
      input.status === "completed"
        ? "Privacy request completed"
        : "Privacy request submitted",
    tone: "success" as const,
  }
}

export function projectCustomerConversationPrivacySubmit(input: {
  hasSelection: boolean
  pending: boolean
  submitted: boolean
}) {
  return {
    disabled: !input.hasSelection || input.pending || input.submitted,
    label: input.pending
      ? "Requesting review…"
      : input.submitted
        ? "Review requested"
        : "Request privacy review",
  }
}
