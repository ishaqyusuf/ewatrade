type ConversationState = "active" | "archived" | "restricted"
type MessageAuthor = "customer" | "store" | "system"

function calendarDayNumber(date: Date) {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  )
}

export function formatCustomerConversationActivity(
  value: Date | string,
  now = new Date(),
  locale?: string,
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"

  const elapsedCalendarDays = calendarDayNumber(now) - calendarDayNumber(date)
  if (elapsedCalendarDays <= 0) {
    return date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    })
  }
  if (elapsedCalendarDays === 1) return "Yesterday"
  if (elapsedCalendarDays <= 6) {
    return date.toLocaleDateString(locale, { weekday: "long" })
  }
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  })
}

function authorLabel(author: MessageAuthor) {
  if (author === "customer") return "You"
  if (author === "store") return "Store"
  return "Update"
}

export function getCustomerConversationListItemPresentation(input: {
  lastActivityAt: Date | string
  lastMessage: { author: MessageAuthor; text: string } | null
  locale?: string
  now?: Date
  state: ConversationState
  storeName: string
  unreadStoreMessages: number
}) {
  const activityLabel = formatCustomerConversationActivity(
    input.lastActivityAt,
    input.now,
    input.locale,
  )
  const status =
    input.state === "archived"
      ? ({ label: "Archived", tone: "muted" } as const)
      : input.state === "restricted"
        ? ({ label: "Messaging restricted", tone: "destructive" } as const)
        : null
  const preview = status
    ? null
    : input.lastMessage
      ? {
          authorLabel: authorLabel(input.lastMessage.author),
          text: input.lastMessage.text,
        }
      : { authorLabel: null, text: "Open conversation" }
  const unreadLabel =
    input.unreadStoreMessages > 0
      ? input.unreadStoreMessages > 99
        ? "99+"
        : String(input.unreadStoreMessages)
      : null
  const announcement = status
    ? status.label
    : preview?.authorLabel
      ? `${preview.authorLabel}: ${preview.text}`
      : (preview?.text ?? "Open conversation")
  const accessibilityAnnouncement = announcement.replace(/[.!?]+$/, "")

  return {
    accessibilityHint: `Open conversation. ${accessibilityAnnouncement}. Last activity ${activityLabel}.`,
    accessibilityLabel:
      input.unreadStoreMessages > 0
        ? `${input.storeName}, ${input.unreadStoreMessages} unread messages`
        : input.storeName,
    activityLabel,
    preview,
    status,
    unreadLabel,
  }
}
