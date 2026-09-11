export type CustomerConversationDetailQaState =
  | "account-invitation"
  | "active"
  | "availability-paused"
  | "attachment-picker"
  | "foreground-response"
  | "mixed-timeline"
  | "new"
  | "notification-setup"
  | "privacy-restricted"
  | "quote-current"
  | "request-choice"
  | "voice-preview"
  | "voice-recording"
  | "whatsapp-bridge"
  | "whatsapp-only"

export function projectCustomerConversationDetailQaInteractions(
  qaState: CustomerConversationDetailQaState,
) {
  return {
    accountInvitationInteractive: qaState !== "account-invitation",
    quoteInteractive:
      qaState !== "account-invitation" &&
      qaState !== "privacy-restricted" &&
      qaState !== "quote-current",
  }
}

export function parseCustomerConversationDetailQaState(input: {
  development: boolean
  qaState?: string | string[] | null
}): CustomerConversationDetailQaState | null {
  if (!input.development || Array.isArray(input.qaState)) return null
  return input.qaState === "account-invitation" ||
    input.qaState === "active" ||
    input.qaState === "availability-paused" ||
    input.qaState === "attachment-picker" ||
    input.qaState === "foreground-response" ||
    input.qaState === "mixed-timeline" ||
    input.qaState === "new" ||
    input.qaState === "notification-setup" ||
    input.qaState === "privacy-restricted" ||
    input.qaState === "quote-current" ||
    input.qaState === "request-choice" ||
    input.qaState === "voice-preview" ||
    input.qaState === "voice-recording" ||
    input.qaState === "whatsapp-bridge" ||
    input.qaState === "whatsapp-only"
    ? input.qaState
    : null
}
