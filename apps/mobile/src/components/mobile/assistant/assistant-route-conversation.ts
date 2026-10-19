export type AssistantRouteConversation =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "saved"; conversationId: string }

/** A supplied malformed identity never means 'start another chat'. */
export function assistantRouteConversation(
  value: string | string[] | undefined,
): AssistantRouteConversation {
  if (value === undefined) return { kind: "none" }
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value.trim() !== value ||
    /[\s/?#\\]/.test(value) ||
    [...value].some(
      (point) =>
        (point.codePointAt(0) ?? 0) < 32 || point.codePointAt(0) === 127,
    ) ||
    value === "." ||
    value === ".."
  )
    return { kind: "invalid" }
  return { kind: "saved", conversationId: value }
}

/** Canonical RPC response must be the original actor/Store/purpose, never a neighbor. */
export function matchesAssistantRouteConversation(
  value: unknown,
  conversationId: string,
  scope: { userId: string; tenantId: string; storeId: string } | null,
) {
  if (
    !scope ||
    !value ||
    typeof value !== "object" ||
    !("conversation" in value)
  )
    return false
  const row = value.conversation
  return Boolean(
    row &&
      typeof row === "object" &&
      "id" in row &&
      row.id === conversationId &&
      "tenantId" in row &&
      row.tenantId === scope.tenantId &&
      "storeId" in row &&
      row.storeId === scope.storeId &&
      "ownerUserId" in row &&
      row.ownerUserId === scope.userId &&
      "purpose" in row &&
      row.purpose === "GENERAL" &&
      "status" in row &&
      row.status === "ACTIVE",
  )
}
