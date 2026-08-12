import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type StoreConversationQueueItem =
  RouterOutputs["serviceCommerce"]["storeConversationQueue"]["items"][number]

export function formatStoreConversationRequestKind(kind: string) {
  if (kind === "commerce_inquiry") return "Product"
  if (kind === "service_request") return "Service"
  return "Prescription"
}

export function formatStoreConversationDate(value: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function formatStoreConversationStatus(value: string) {
  return value.replaceAll("_", " ")
}

export const storeConversationColumns = [
  "Conversation",
  "Requests and state",
  "Assignment",
  "Response",
  "Action",
] as const
