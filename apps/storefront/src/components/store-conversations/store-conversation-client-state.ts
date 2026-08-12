import type { StoreConversationSelectRequestInput } from "@ewatrade/service-commerce"

export function resolveStoreConversationOperationId(
  current: string | null,
  create: () => string,
) {
  return current ?? create()
}

export type StoreConversationKeyedOperation = {
  id: string
  key: string
}

export function resolveStoreConversationKeyedOperation(
  current: StoreConversationKeyedOperation | null,
  key: string,
  create: () => string,
) {
  return current?.key === key ? current : { id: create(), key }
}

export function storeConversationRequestSelectionKey(
  messageId: string,
  target: StoreConversationSelectRequestInput["target"],
) {
  return target.kind === "new_commerce_inquiry"
    ? `${messageId}:${target.kind}`
    : `${messageId}:${target.kind}:${target.requestKind}:${target.requestId}`
}

export function prependOlderStoreConversationMessages<T>(
  current: T[],
  older: T[],
) {
  return [...older, ...current]
}
