export const CUSTOMER_CONVERSATION_REPORT_REASONS = [
  { label: "Spam or scams", value: "spam" },
  { label: "Harassment or bullying", value: "harassment" },
  { label: "Hateful content", value: "hateful_content" },
  { label: "Sexual content", value: "sexual_content" },
  { label: "Violence or threats", value: "violence" },
  { label: "Something else", value: "other" },
] as const

export type CustomerConversationReportReason =
  (typeof CUSTOMER_CONVERSATION_REPORT_REASONS)[number]["value"]

export function customerConversationBlockDescription(blocked: boolean) {
  return blocked
    ? "This Store is blocked. You can still read your conversation and report a concern."
    : "Blocking pauses messages to and from this Store, and its conversation notifications. You can unblock later."
}
