export {
  projectStoreConversationQuoteActionButton as projectCustomerQuoteActionButton,
  projectStoreConversationQuoteMessageFeedback as projectCustomerQuoteMessageFeedback,
  requestStoreConversationQuoteAction as requestCustomerQuoteAction,
} from "@ewatrade/utils"

export const CUSTOMER_QUOTE_MESSAGE_LAYOUT = {
  actionMinHeightClass: "min-h-11",
  compactWidthClass: "max-w-[92%]",
} as const

type CustomerQuoteLifecycle =
  | "completed"
  | "current"
  | "expired"
  | "rejected"
  | "revoked"
  | "superseded"

const customerQuoteStatus: Record<CustomerQuoteLifecycle, string> = {
  completed: "Completed",
  current: "Ready",
  expired: "Expired",
  rejected: "Rejected",
  revoked: "Revoked",
  superseded: "Updated",
}

export function projectCustomerQuoteHeading(input: {
  confirmationRequired: boolean
  lifecycle: CustomerQuoteLifecycle
  quoteVersion: number
}) {
  return {
    eyebrow: `Quote · Version ${input.quoteVersion}`,
    guidance:
      input.lifecycle !== "current"
        ? null
        : input.confirmationRequired
          ? "Choose one option. You’ll confirm before anything changes."
          : "Review the options and available next steps.",
    status: customerQuoteStatus[input.lifecycle],
    title: "Your quotation",
  }
}
