export type MobileAccessProfile = {
  setupPending?: boolean
  hasBusinessAccess: boolean
  hasCustomerHistory: boolean
}

export type MobileEntryDestination =
  | { kind: "business" }
  | { kind: "owner-setup" }
  | { kind: "customer" }
  | { kind: "login" }
  | { kind: "no-access" }

export function resolveMobileEntryDestination(input: {
  accessProfile: MobileAccessProfile | null
  hasGuestCapability: boolean
  hasSession: boolean
  lastShell: "business" | "customer" | null
}): MobileEntryDestination {
  if (input.hasSession && input.accessProfile?.setupPending)
    return { kind: "owner-setup" }
  if (input.hasGuestCapability) return { kind: "customer" }
  if (!input.hasSession || !input.accessProfile) return { kind: "login" }

  const { hasBusinessAccess, hasCustomerHistory } = input.accessProfile

  if (hasBusinessAccess && hasCustomerHistory) {
    return { kind: input.lastShell === "customer" ? "customer" : "business" }
  }
  if (hasBusinessAccess) return { kind: "business" }
  if (hasCustomerHistory) return { kind: "customer" }

  return { kind: "no-access" }
}

/**
 * Where a fresh sign-in goes when its response already carries the Access
 * Profile, so it skips the start route's splash while that profile is fetched
 * again. Null when only the start route can decide: an open guest
 * conversation, or business and customer access together (the last shell
 * used decides, which is read from device storage).
 */
export function signInDestinationHref(input: {
  accessProfile: MobileAccessProfile | null | undefined
  hasGuestCapability: boolean
}): "/dashboard" | "/owner-setup" | "/no-access" | null {
  const profile = input.accessProfile
  if (!profile || input.hasGuestCapability) return null
  if (profile.setupPending) return "/owner-setup"
  if (profile.hasBusinessAccess)
    return profile.hasCustomerHistory ? null : "/dashboard"
  return profile.hasCustomerHistory ? null : "/no-access"
}
