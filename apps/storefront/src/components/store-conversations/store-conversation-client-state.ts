export function resolveStoreConversationOperationId(
  current: string | null,
  create: () => string,
) {
  return current ?? create()
}

export function prependOlderStoreConversationMessages<T>(
  current: T[],
  older: T[],
) {
  return [...older, ...current]
}
