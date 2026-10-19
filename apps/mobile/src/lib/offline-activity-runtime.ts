import { getSession, getSessionGeneration } from "@/lib/session-store"
import { trackMobileActivity } from "@/runtime/analytics-runtime"
import {
  getOperationalModeGeneration,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { getDataCacheGeneration } from "@/trpc/client"
import type { MobileActivityInput } from "@ewatrade/events/mobile-activity"

function currentOwner() {
  try {
    const session = getSession()
    if (!session?.token || !session.profile?.id) return null
    const profile = session.profile
    return JSON.stringify([
      session.token,
      profile.id,
      profile.businessId ?? null,
      profile.storeId ?? null,
      profile.role ?? null,
      profile.staffAccessMode ?? null,
      profile.status ?? null,
      session.accessProfile?.hasBusinessAccess ?? null,
      getDataCacheGeneration(),
      getSessionGeneration(),
      useOperationalModeStore.getState().isOfflineMode,
      getOperationalModeGeneration(),
    ])
  } catch {
    return null
  }
}

/**
 * A memory-only reporter for the exact initiating owner. Observed retirement is
 * permanent; tracking failure cannot affect the operation. The native runtime
 * still supplies the separate Production/server eligibility gate.
 */
export function captureOfflineActivity() {
  const owner = currentOwner()
  let retired = owner === null
  return (input: MobileActivityInput | null) => {
    if (retired) return
    if (currentOwner() !== owner) {
      retired = true
      return
    }
    if (!input) return
    try {
      trackMobileActivity(input)
    } catch {
      // Observational only.
    }
  }
}
