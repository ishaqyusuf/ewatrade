import {
  type AttachmentEntitlement,
  attachmentEntitlementFrom,
} from "@/components/mobile/attachment-lock-model"
import { useAuthContext } from "@/hooks/use-auth"
import { getSessionGeneration } from "@/lib/session-store"
import {
  getOperationalModeGeneration,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import type { MobileActivityInput } from "@ewatrade/events/mobile-activity"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

type LifetimeFacts = {
  token: string | null | undefined
  profile:
    | {
        id: string
        businessId?: string
        storeId?: string
        role?: string
        staffAccessMode?: string
      }
    | null
    | undefined
  hasBusinessAccess: boolean | null | undefined
  offline: boolean
}

/**
 * The exact signed-in session that may open media right now: token, actor,
 * business, Store, role/access, data-cache, session and operational-mode
 * generations, while online.
 * Offline or signed out has no lifetime, so nothing can open.
 */
function attachmentLifetime(facts: LifetimeFacts) {
  const { profile } = facts
  if (facts.offline || !facts.token || !profile?.id) return null
  return JSON.stringify([
    facts.token,
    profile.id,
    profile.businessId ?? null,
    profile.storeId ?? null,
    profile.role ?? null,
    profile.staffAccessMode ?? null,
    facts.hasBusinessAccess ?? null,
    getDataCacheGeneration(),
    // Monotonic: an unobserved session or offline A→B→A is still a new
    // lifetime, even when the final values look identical.
    getSessionGeneration(),
    getOperationalModeGeneration(),
  ])
}

/**
 * Attachment access for the signed-in owner/business/Store, read fresh from
 * tenant.current (the server's own plan resolution). Unknown or loading is
 * never treated as Free. `attempt` rechecks right before a picker, camera or
 * file read opens; a locked result shows the explanation sheet instead.
 */
export type AttachmentAction = "camera" | "gallery" | "video" | "document"

export function useAttachmentEntitlement(activity?: {
  /** Which surface the controls belong to, for observational reports. */
  surface: "order" | "service"
  track: (input: MobileActivityInput) => void
}) {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const { profile } = auth
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const options = trpc.tenant.current.queryOptions()
  const cacheArgs = {
    ...options.queryKey[1],
    // Cache ownership only; tRPC's path/input tuple stays intact.
    attachmentOwner: {
      actorId: profile?.id,
      businessId: profile?.businessId,
      storeId: profile?.storeId,
    },
  }
  const query = useQuery({
    ...options,
    queryKey: [options.queryKey[0], cacheArgs],
    enabled: !offline && Boolean(profile?.id),
    refetchOnMount: "always",
    retry: false,
  })
  const facts: LifetimeFacts = {
    token: auth.token,
    profile,
    hasBusinessAccess: auth.accessProfile?.hasBusinessAccess,
    offline,
  }
  const lifetime = attachmentLifetime(facts)
  // Latest committed session facts; the generation is read live.
  const latestFacts = useRef(facts)
  latestFacts.current = facts
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  /**
   * The origin lifetime is still this exact, online, mounted session. The
   * connection is read live from the store: it changes before React renders.
   */
  const current = (origin: string | null) =>
    origin !== null &&
    mounted.current &&
    !useOperationalModeStore.getState().isOfflineMode &&
    origin === attachmentLifetime(latestFacts.current)
  const read = (result: {
    isSuccess: boolean
    isError: boolean
    fresh: boolean
    data?: typeof query.data
  }) => {
    const owner = latestFacts.current.profile
    return attachmentEntitlementFrom({
      fresh: result.fresh && result.isSuccess,
      failed: result.isError,
      // The response must be for exactly this actor, business and Store.
      ownerMatches: Boolean(
        owner?.id &&
          result.data?.actorUserId === owner.id &&
          result.data.tenant.id === owner.businessId &&
          result.data.activeStore?.id === owner.storeId,
      ),
      planId: result.data?.tenant.retailOpsPlanId,
      role: result.data?.membership.role ?? owner?.role,
    })
  }
  const entitlement: AttachmentEntitlement =
    lifetime === null
      ? { status: "unknown" }
      : read({
          isSuccess: query.isSuccess,
          isError: query.isError,
          fresh: query.isFetchedAfterMount,
          data: query.data,
        })
  const latestEntitlement = useRef(entitlement)
  latestEntitlement.current = entitlement
  // The explanation belongs to the session that opened it and only while the
  // current plan read still proves the lock.
  const [sheetOrigin, setSheetOrigin] = useState<string | null>(null)
  const sheetRef = useRef<string | null>(null)
  const sheetOpen =
    sheetOrigin !== null &&
    sheetOrigin === lifetime &&
    entitlement.status === "locked"
  // Losing the proved lock or the session retires the explanation for good;
  // a later Free read never brings it back without a new press.
  if (sheetOrigin !== null && !sheetOpen) {
    sheetRef.current = null
    setSheetOrigin(null)
  }
  const openSheet = (origin: string) => {
    sheetRef.current = origin
    setSheetOrigin(origin)
  }
  const closeSheet = () => {
    sheetRef.current = null
    setSheetOrigin(null)
  }
  /** Observational only: a tracker failure never touches the attachment flow. */
  const report = (input: MobileActivityInput) => {
    if (!activity) return
    try {
      activity.track(input)
    } catch {
      // Observational only.
    }
  }
  const restricted = (action?: AttachmentAction) => {
    if (activity && action)
      report({
        name: "mobile_attachment_restricted",
        properties: { category: activity.surface, action },
      })
  }
  // One media action at a time per control group, covering the read and the
  // (possibly asynchronous) picker it releases.
  const busy = useRef<object | null>(null)
  return {
    entitlement,
    /** The lock explanation, when a locked control was pressed. */
    sheet:
      sheetOpen && entitlement.status === "locked"
        ? { canSeePlans: entitlement.canSeePlans }
        : null,
    closeSheet,
    /**
     * A user's own response to the open explanation (OK for staff, Close or
     * swipe for owners/admins). Reports only while that same explanation and
     * session are current.
     */
    promptAction(action: "ask_owner" | "dismiss") {
      const origin = lifetime
      if (!current(origin) || sheetRef.current !== origin) return
      report({ name: "mobile_upgrade_prompt_action", properties: { action } })
    },
    /**
     * The explanation's plan-information action. Runs only while that same
     * explanation, session and a current owner/admin lock are still true.
     */
    seePlans(go: () => void) {
      const origin = lifetime
      const live = latestEntitlement.current
      if (
        !current(origin) ||
        sheetRef.current !== origin ||
        live.status !== "locked" ||
        !live.canSeePlans
      )
        return
      closeSheet()
      report({
        name: "mobile_upgrade_prompt_action",
        properties: { action: "view_plan" },
      })
      go()
    },
    /**
     * Recheck the plan, then either open the media action or explain the
     * lock. A callback from an earlier session, offline, after unmount or
     * while another media action is running does nothing.
     */
    async attempt(open: () => unknown, action?: AttachmentAction) {
      const origin = lifetime
      if (!current(origin) || busy.current) return
      const token = {}
      busy.current = token
      try {
        if (entitlement.status === "locked") {
          if (origin) openSheet(origin)
          restricted(action)
          return
        }
        const startedAt = Date.now()
        let result: Awaited<ReturnType<typeof query.refetch>>
        try {
          result = await query.refetch({ throwOnError: true })
        } catch {
          // A failed read never releases a picker.
          return
        }
        if (!current(origin) || busy.current !== token) return
        // Only a settled read that arrived after this press counts.
        if (
          result.fetchStatus !== "idle" ||
          !result.isSuccess ||
          result.dataUpdatedAt < startedAt
        )
          return
        const fresh = read({ ...result, fresh: true })
        if (fresh.status === "locked") {
          if (origin) openSheet(origin)
          restricted(action)
          return
        }
        if (fresh.status !== "allowed" || !current(origin)) return
        await open()
      } finally {
        if (busy.current === token) busy.current = null
      }
    },
  }
}
