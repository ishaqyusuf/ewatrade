export type CustomerOperation = { id: string; key: string }
export type PendingCustomerTransferState = {
  publicToken: string
  targetCredentialToken?: string
  transferToken: string
}

export function mergeCustomerConversationPages<
  Item extends { conversationId: string },
>(current: Item[], incoming: Item[]) {
  const seen = new Set(current.map((item) => item.conversationId))
  return [
    ...current,
    ...incoming.filter((item) => !seen.has(item.conversationId)),
  ]
}

export function resolveCustomerOperation(
  current: CustomerOperation | null,
  key: string,
  createId: () => string,
): CustomerOperation {
  return current?.key === key ? current : { id: createId(), key }
}

export function oneRouteParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null
}

export function isDefinitiveCustomerTransferError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const code =
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "code" in error.data
      ? error.data.code
      : "code" in error
        ? error.code
        : null
  return ["CONFLICT", "FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"].includes(
    String(code),
  )
}

export function isCustomerCredentialError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "UNAUTHORIZED"
  )
}

export function canRetryNewStoreEntryAfterCredentialRejection(input: {
  accountAccess: boolean
  error: unknown
  previousSession: {
    lastConversation?: { publicToken: string }
  } | null
  publicToken: string | null
  transferToken: string | null
}) {
  const previousToken = input.previousSession?.lastConversation?.publicToken
  return Boolean(
    !input.accountAccess &&
      !input.transferToken &&
      input.publicToken &&
      previousToken &&
      previousToken !== input.publicToken &&
      isCustomerCredentialError(input.error),
  )
}

export async function bootstrapNewStoreEntryWithCredentialRecovery<
  Result,
>(input: {
  accountAccess: boolean
  bootstrap: () => Promise<Result>
  clearSession: () => Promise<void>
  previousSession: {
    lastConversation?: { publicToken: string }
  } | null
  publicToken: string
  transferToken: string | null
}): Promise<Result> {
  try {
    return await input.bootstrap()
  } catch (error) {
    if (!canRetryNewStoreEntryAfterCredentialRejection({ ...input, error })) {
      throw error
    }
    await input.clearSession()
    return input.bootstrap()
  }
}

export function resolveCustomerConversationRetryTarget(input: {
  conversationId: string | null
  timelineFailed: boolean
}) {
  return input.conversationId && input.timelineFailed
    ? ("timeline" as const)
    : ("bootstrap" as const)
}

export function completePendingCustomerTransfer(
  pending: PendingCustomerTransferState,
  createCredential: () => string,
) {
  return pending.targetCredentialToken
    ? pending
    : { ...pending, targetCredentialToken: createCredential() }
}
