export function canReadBusinessInForeground(input: {
  active: boolean
  authenticated: boolean
  businessId: string | null | undefined
  offline: boolean
}) {
  return (
    input.active &&
    input.authenticated &&
    Boolean(input.businessId) &&
    !input.offline
  )
}

export function qaContextPollInterval(enabled: boolean, hasContext: boolean) {
  return enabled && hasContext ? 45_000 : false
}

export function orderVisibilityPollInterval(
  enabled: boolean,
  canManage: boolean,
) {
  // Owners/admins always see all orders. Staff retain the privacy refresh bound.
  return enabled && !canManage ? 30_000 : false
}
