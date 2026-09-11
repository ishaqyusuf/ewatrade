type RequestSummary = {
  lifecycle: "active" | "terminal"
  status: string
}

type MessageMetaInput = {
  authorKind: "customer" | "store_attendant" | "system"
  channel: "mobile" | "system" | "web" | "whatsapp"
  locale?: string
  occurredAt: Date | string
  storeName: string
  timeZone?: string
  whatsAppObservationStatus?: WhatsAppObservationStatus | null
}

type TimelineChannelSource = "ewatrade" | "whatsapp"

type WhatsAppObservationStatus =
  | "deleted"
  | "delivered"
  | "failed"
  | "read"
  | "received"
  | "sent"
  | "unsupported"

export type CustomerConversationTimelineItem =
  | { id: string; kind: "day"; label: string }
  | {
      detail: string | null
      id: string
      kind: "channel"
      label: string
      source: TimelineChannelSource
    }
  | { id: string; kind: "message"; messageId: string }

export type CustomerConversationChannelBoundary = Extract<
  CustomerConversationTimelineItem,
  { kind: "channel" }
>

export function resolveCustomerConversationHeaderStatus(
  requests: RequestSummary[],
  options?: { hasMessages: boolean },
) {
  const active = requests.filter((request) => request.lifecycle === "active")
  if (active.length === 0) {
    return requests.length === 0 && options?.hasMessages === false
      ? "New conversation"
      : "Store conversation"
  }
  if (active.length > 1) return `${active.length} active requests`
  return sentenceCase(active[0]?.status ?? "active")
}

export function resolveCustomerMessageMeta(input: MessageMetaInput) {
  const time = new Intl.DateTimeFormat(input.locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
  }).format(new Date(input.occurredAt))
  const author =
    input.authorKind === "customer"
      ? null
      : input.authorKind === "store_attendant"
        ? input.storeName
        : "ẸwáTrade"
  const channel =
    input.channel === "whatsapp" && !input.whatsAppObservationStatus
      ? "WhatsApp"
      : null
  const observationStatus = input.whatsAppObservationStatus
    ? resolveWhatsAppObservationStatus(input.whatsAppObservationStatus)
    : null
  return [author, observationStatus, channel, time].filter(Boolean).join(" · ")
}

export function buildCustomerConversationTimelineItems(input: {
  locale?: string
  messages: Array<{
    channel: "mobile" | "system" | "web" | "whatsapp"
    id: string
    occurredAt: Date | string
  }>
  now?: Date
  timeZone?: string
}): CustomerConversationTimelineItem[] {
  const now = input.now ?? new Date()
  const today = calendarKey(now, input.timeZone)
  const yesterday = shiftCalendarKey(today, -1)
  const items: CustomerConversationTimelineItem[] = []
  let previousDay: string | null = null
  let previousChannel: MessageMetaInput["channel"] | null = null

  for (const message of input.messages) {
    const day = calendarKey(new Date(message.occurredAt), input.timeZone)
    if (day !== previousDay) {
      items.push({
        id: `day:${day}`,
        kind: "day",
        label:
          day === today
            ? "Today"
            : day === yesterday
              ? "Yesterday"
              : new Intl.DateTimeFormat(input.locale, {
                  day: "numeric",
                  month: "short",
                  ...(input.timeZone ? { timeZone: input.timeZone } : {}),
                }).format(new Date(message.occurredAt)),
      })
      previousDay = day
    }

    const boundary = resolveCustomerConversationChannelBoundary({
      channel: message.channel,
      messageId: message.id,
      previousChannel,
    })
    if (boundary) items.push(boundary)
    previousChannel = message.channel
    items.push({
      id: `message:${message.id}`,
      kind: "message",
      messageId: message.id,
    })
  }
  return items
}

export function resolveCustomerConversationChannelBoundary(input: {
  channel: MessageMetaInput["channel"]
  messageId: string
  previousChannel: MessageMetaInput["channel"] | null
}): CustomerConversationChannelBoundary | null {
  const source = resolveTimelineChannelSource(input.channel)
  const previousSource = input.previousChannel
    ? resolveTimelineChannelSource(input.previousChannel)
    : null
  if (source === previousSource) return null
  if (source === "whatsapp") {
    return {
      detail: "Only activity ẸwáTrade observed is shown",
      id: `channel:whatsapp:${input.messageId}`,
      kind: "channel",
      label: "Observed on WhatsApp",
      source,
    }
  }
  if (previousSource === "whatsapp") {
    return {
      detail: null,
      id: `channel:ewatrade:${input.messageId}`,
      kind: "channel",
      label: "Back in ẸwáTrade",
      source,
    }
  }
  return null
}

function resolveTimelineChannelSource(
  channel: MessageMetaInput["channel"],
): TimelineChannelSource {
  return channel === "whatsapp" ? "whatsapp" : "ewatrade"
}

function resolveWhatsAppObservationStatus(status: WhatsAppObservationStatus) {
  if (status === "received") return "Received"
  if (status === "sent") return "Sent"
  if (status === "delivered") return "Delivered"
  if (status === "read") return "Read"
  if (status === "failed") return "Delivery failed"
  if (status === "deleted") return "Deleted"
  return "Unsupported event"
}

function sentenceCase(value: string) {
  const normalized = value.replaceAll("_", " ").toLowerCase()
  return normalized
    ? `${normalized[0]?.toUpperCase()}${normalized.slice(1)}`
    : ""
}

function calendarKey(value: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function shiftCalendarKey(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number)
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
  shifted.setUTCDate(shifted.getUTCDate() + amount)
  return shifted.toISOString().slice(0, 10)
}
