export type StoreConversationQuoteActionButtonInput = {
  capabilityToken: string
  confirmation: "none" | "required"
  label: string
}

export function requestStoreConversationQuoteAction(
  confirmingToken: string | null,
  action: StoreConversationQuoteActionButtonInput,
) {
  const needsConfirmation =
    action.confirmation === "required" &&
    confirmingToken !== action.capabilityToken
  return {
    confirmingToken: needsConfirmation
      ? action.capabilityToken
      : confirmingToken,
    execute: !needsConfirmation,
  }
}

export function projectStoreConversationQuoteActionButton(
  action: StoreConversationQuoteActionButtonInput,
  input: { confirming: boolean; pending: boolean },
) {
  const accessibilityLabel = input.confirming
    ? `Confirm ${action.label}`
    : action.label
  return {
    accessibilityLabel,
    label: input.pending
      ? "Working…"
      : input.confirming
        ? accessibilityLabel
        : action.label,
  }
}

export function projectStoreConversationQuoteMessageFeedback(input: {
  error: string | null
  loading: boolean
}) {
  return {
    actionsVisible: !input.loading && !input.error,
    retryVisible: Boolean(input.error),
    status: input.loading
      ? "Checking available actions…"
      : (input.error ?? null),
  }
}
