import type { StaffMember } from "@/components/mobile/staff/staff-model"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"

export type HomeCatalogState = "empty" | "unfinished" | "ready"
export type HomeWorkspaceState =
  | "loading"
  | "unavailable"
  | "offline-unknown"
  | "available"
  | "cached"
export type HomeTeamState =
  | "none"
  | "pending"
  | "active"
  | "existing"
  | "unknown"
  | "restricted"

export type HomeJourney = {
  catalog: HomeCatalogState
  hasOrderHistory: boolean
  workspace: HomeWorkspaceState
  team: HomeTeamState
  pendingTeamName?: string
  showTeamPrompt: boolean
}

export function getHomeJourneyScope(input: {
  userId?: string
  businessId?: string
  storeId?: string
}) {
  return input.userId && input.businessId && input.storeId
    ? JSON.stringify([input.userId, input.businessId, input.storeId])
    : null
}

export function getHomeTeamState(input: {
  canManage: boolean
  directory?: StaffMember[]
  directoryUnavailable: boolean
  hasStaff: boolean
}): { state: HomeTeamState; pendingName?: string } {
  if (!input.canManage) return { state: "restricted" }
  if (!input.directory || input.directoryUnavailable)
    return { state: "unknown" }
  if (
    input.directory.some((member) => member.status.toUpperCase() === "ACTIVE")
  ) {
    return { state: "active" }
  }
  const pending = input.directory.find((member) =>
    ["INVITED", "PENDING"].includes(member.status.toUpperCase()),
  )
  if (pending) {
    return {
      state: "pending",
      pendingName:
        pending.user.displayName?.trim() ||
        pending.user.name?.trim() ||
        pending.user.email,
    }
  }
  // The bounded attendant directory cannot prove all other staff roles absent.
  return {
    state: input.hasStaff || input.directory.length > 0 ? "existing" : "none",
  }
}

export function getHomeJourney(input: {
  availability: MobileWorkspaceFeatureAvailability
  availabilityResolved: boolean
  availabilityPending: boolean
  isOffline: boolean
  loadedOrderCount: number
  team: HomeTeamState
  pendingTeamName?: string
  teamPreferenceResolved: boolean
  teamPromptDismissed: boolean
}): HomeJourney {
  const workspace = input.availabilityResolved
    ? input.isOffline
      ? "cached"
      : "available"
    : input.isOffline
      ? "offline-unknown"
      : input.availabilityPending
        ? "loading"
        : "unavailable"
  const hasOrderHistory =
    input.availability.hasOrders || input.loadedOrderCount > 0
  return {
    workspace,
    catalog: input.availability.hasActiveSellableItems
      ? "ready"
      : input.availability.hasCatalogItems
        ? "unfinished"
        : "empty",
    hasOrderHistory,
    team: input.team,
    pendingTeamName: input.pendingTeamName,
    showTeamPrompt:
      workspace === "available" &&
      hasOrderHistory &&
      input.team === "none" &&
      input.teamPreferenceResolved &&
      !input.teamPromptDismissed,
  }
}

export function parseHomeTeamDismissal(value: string | null) {
  return value === "dismissed"
}
