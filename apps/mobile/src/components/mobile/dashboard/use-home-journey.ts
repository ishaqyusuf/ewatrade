import { useAuthContext } from "@/hooks/use-auth"
import { canManageMobileStaff } from "@/lib/mobile-roles"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect } from "expo-router"
import { useCallback } from "react"
import { STAFF_RESULT_LIMIT } from "../staff/staff-model"
import {
  getHomeJourney,
  getHomeJourneyScope,
  getHomeTeamState,
} from "./home-journey-model"
import { useHomeTeamPreference } from "./use-home-team-preference"

export function useHomeJourney(input: {
  enabled: boolean
  availability: MobileWorkspaceFeatureAvailability
  availabilityResolved: boolean
  availabilityPending: boolean
  isOffline: boolean
  loadedOrderCount: number
}) {
  const { profile } = useAuthContext()
  const trpc = useTRPC()
  const canManage =
    input.enabled &&
    canManageMobileStaff(profile) &&
    (profile?.status?.toUpperCase() ?? "ACTIVE") === "ACTIVE"
  const storeId =
    profile?.storeId ??
    (input.availabilityResolved ? input.availability.storeId : undefined)
  const scope = getHomeJourneyScope({
    userId: profile?.id,
    businessId: profile?.businessId,
    storeId,
  })
  const preference = useHomeTeamPreference(input.enabled ? scope : null)
  const directoryEnabled =
    canManage && !!scope && !input.isOffline && input.availabilityResolved
  const directory = useQuery(
    trpc.retailOps.staff.queryOptions(
      {
        storeId,
        limit: STAFF_RESULT_LIMIT,
        role: "cashier",
        status: "all",
      },
      { enabled: directoryEnabled, retry: false },
    ),
  )
  useFocusEffect(
    useCallback(() => {
      if (directoryEnabled) void directory.refetch()
    }, [directoryEnabled, directory.refetch]),
  )
  const team = getHomeTeamState({
    canManage,
    directory: scope ? directory.data : undefined,
    directoryUnavailable: directory.isError,
    hasStaff: input.availability.hasStaff,
  })
  const journey = getHomeJourney({
    ...input,
    team: team.state,
    pendingTeamName: team.pendingName,
    teamPreferenceResolved: preference.resolved,
    teamPromptDismissed: preference.dismissed,
  })
  return { journey, canManage, preference }
}
