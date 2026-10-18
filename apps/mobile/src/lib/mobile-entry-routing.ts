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
