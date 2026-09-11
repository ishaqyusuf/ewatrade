export type StagedStoreConversationGuestRotation = {
  clientOperationId: string
  targetCredentialToken: string
}

function parseStagedRotation(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (
    Object.keys(value).length !== 2 ||
    typeof value.clientOperationId !== "string" ||
    value.clientOperationId.trim().length < 8 ||
    value.clientOperationId.length > 160 ||
    typeof value.targetCredentialToken !== "string" ||
    value.targetCredentialToken.trim().length < 32 ||
    value.targetCredentialToken.length > 200
  ) {
    return null
  }
  return {
    clientOperationId: value.clientOperationId.trim(),
    targetCredentialToken: value.targetCredentialToken.trim(),
  } satisfies StagedStoreConversationGuestRotation
}

export function serializeStagedStoreConversationGuestRotation(
  input: StagedStoreConversationGuestRotation,
) {
  const parsed = parseStagedRotation(input)
  if (!parsed) throw new Error("Guest credential rotation staging is invalid.")
  return Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url")
}

export function parseStagedStoreConversationGuestRotation(value?: string) {
  if (!value || value.length > 1_024) return null
  try {
    return parseStagedRotation(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    )
  } catch {
    return null
  }
}

export function parseStoreConversationGuestIssuedAt(value?: string) {
  if (!value) return null
  const issuedAt = new Date(value)
  return Number.isFinite(issuedAt.getTime()) ? issuedAt : null
}
