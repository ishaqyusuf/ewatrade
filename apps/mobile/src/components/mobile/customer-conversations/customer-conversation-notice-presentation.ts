export function projectCustomerConversationNotice(input: {
  message: string
  soundEnabled: boolean
  storeName: string
}) {
  if (input.message.startsWith("New response from the Store.")) {
    return {
      detail: input.soundEnabled ? "Sound alert is on" : "Sound alert is off",
      dismissLabel: "Dismiss new response notice",
      icon: "CheckCircle2" as const,
      title: `New response from ${input.storeName}`,
      tone: "success" as const,
    }
  }

  if (input.message.startsWith("Reconnecting.")) {
    return {
      detail: "Messages already shown remain available.",
      dismissLabel: "Dismiss reconnecting notice",
      icon: "RefreshCw" as const,
      title: "Reconnecting",
      tone: "muted" as const,
    }
  }

  return {
    detail: input.message,
    dismissLabel: "Dismiss conversation notice",
    icon: "Info" as const,
    title: null,
    tone: "warning" as const,
  }
}
