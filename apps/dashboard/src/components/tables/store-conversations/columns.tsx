import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type StoreConversationQueueItem =
  RouterOutputs["serviceCommerce"]["storeConversationQueue"]["items"][number]

export function formatStoreConversationRequestKind(kind: string) {
  if (kind === "commerce_inquiry") return "Product"
  if (kind === "service_request") return "Service"
  return "Prescription"
}

export function formatStoreConversationDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value)
}

const PLAIN_STATUS: Record<string, string> = {
  awaiting_response: "Needs reply",
  overdue: "Reply late",
  responded: "Answered",
  received: "New",
  ready_to_quote: "Ready to quote",
  quoted: "Quote sent",
  needs_information: "Needs details",
  media_review: "Checking photo",
  professional_review: "Pharmacist check",
  converted: "Done",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
}

export function formatStoreConversationStatus(value: string) {
  const plain = PLAIN_STATUS[value] ?? value.replaceAll("_", " ")
  return plain
}

/** Conversations carry no customer name; the open request names the row. */
export function storeConversationTitle(item: StoreConversationQueueItem) {
  const open = item.requests.filter(
    (request) => request.lifecycle !== "terminal",
  )
  const first = open[0] ?? item.requests[0]
  if (!first) return "Conversation"
  const kind = `${formatStoreConversationRequestKind(first.kind)} request`
  const more = (open.length || item.requests.length) - 1
  return more > 0 ? `${kind} + ${more} more` : kind
}

/** "Service · Quote sent", the latest open request first. */
export function storeConversationRequestLine(item: StoreConversationQueueItem) {
  const open = item.requests.filter(
    (request) => request.lifecycle !== "terminal",
  )
  const first = open[0] ?? item.requests.at(-1)
  return first ? formatStoreConversationStatus(first.status) : ""
}
