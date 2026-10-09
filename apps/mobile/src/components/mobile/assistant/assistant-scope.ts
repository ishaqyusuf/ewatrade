import type { MobileSession } from "@/lib/session-store"
export function assistantScope(session: MobileSession | null) {
  if (
    !session?.profile.id ||
    !session.profile.businessId ||
    !session.profile.storeId
  )
    return null
  return {
    userId: session.profile.id,
    tenantId: session.profile.businessId,
    storeId: session.profile.storeId,
  }
}
export function assistantScopeKey(session: MobileSession | null) {
  const scope = assistantScope(session)
  return scope
    ? JSON.stringify([scope.userId, scope.tenantId, scope.storeId])
    : null
}
export function isAssistantSessionCurrent(
  origin: MobileSession | null,
  current: MobileSession | null,
  offline: boolean,
  ownerOnly = true,
) {
  return (
    !!origin &&
    !!current &&
    !offline &&
    !current.token.startsWith("local-") &&
    origin.token === current.token &&
    assistantScopeKey(origin) !== null &&
    assistantScopeKey(origin) === assistantScopeKey(current) &&
    (current.profile.status?.toUpperCase() ?? "ACTIVE") === "ACTIVE" &&
    (!ownerOnly ||
      ["OWNER", "ADMIN"].includes(current.profile.role?.toUpperCase() ?? ""))
  )
}
export function assistantRequestHeaders(session: MobileSession) {
  return {
    Authorization: `Bearer ${session.token}`,
    "x-app-authorization": `Bearer ${session.token}`,
    "x-tenant-slug": session.profile.businessSlug ?? "",
    "x-store-id": session.profile.storeId ?? "",
    "x-trpc-source": "mobile",
  }
}
