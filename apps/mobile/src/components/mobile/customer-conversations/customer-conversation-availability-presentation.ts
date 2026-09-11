import type { IconKeys } from "@/components/ui/icon"

type AvailabilityPresentation = {
  accessibilityLabel: string
  detail: string
  draftDetail: string | null
  draftTitle: string | null
  icon: IconKeys
  title: string
  tone: "warning"
}

function asSentence(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function defaultReopeningLabel(value: Date) {
  return value.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })
}

export function projectCustomerConversationAvailability(input: {
  available: boolean
  customerMessage: string | null
  formatReopensAt?: (value: Date) => string
  hasUnsentDraft: boolean
  reopensAt: Date | null
}): AvailabilityPresentation | null {
  if (input.available) return null

  const title = input.reopensAt
    ? `Chat paused until ${(input.formatReopensAt ?? defaultReopeningLabel)(input.reopensAt)}`
    : "Chat is paused"
  const customerMessage = asSentence(
    input.customerMessage ??
      "The Store isn’t accepting new messages right now.",
  )
  const detail = `${customerMessage} You can still read this conversation.`

  return {
    accessibilityLabel: `${title}. ${detail}`,
    detail,
    draftDetail: input.hasUnsentDraft
      ? "It won’t send until chat reopens."
      : null,
    draftTitle: input.hasUnsentDraft ? "Draft saved on this device" : null,
    icon: "Clock",
    title,
    tone: "warning",
  }
}
