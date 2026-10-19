import { useAuthContext } from "@/hooks/use-auth"
import { reviewActivity, syncActivity } from "@/lib/offline-activity"
import { captureOfflineActivity } from "@/lib/offline-activity-runtime"
import { offlineCommandScopeKey } from "@/lib/offline-command-scope"
import { registerInput, replayInput } from "@/lib/offline-replay-client"
import {
  type ReplayOutcome,
  type ReplayRequest,
  createReplayCoordinator,
} from "@/lib/offline-replay-coordinator"
import { type MobileProfile, getSession } from "@/lib/session-store"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import Constants from "expo-constants"
import { useEffect, useRef, useState } from "react"
import { Platform } from "react-native"

/** Everything that may change who is allowed to replay what. */
function lifetimeKey(profile: MobileProfile | null | undefined) {
  if (!profile?.id || !profile.businessId || !profile.storeId) return null
  return JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role ?? null,
    profile.staffAccessMode ?? null,
    getDataCacheGeneration(),
  ])
}

type ReplayResult = RouterOutputs["offline"]["replay"][number]

type ApiPorts = {
  register: (input: ReturnType<typeof registerInput>) => Promise<unknown>
  replay: (input: ReturnType<typeof replayInput>) => Promise<ReplayResult[]>
  refresh: (live: () => boolean) => Promise<void>
}

// The latest mounted hook's API functions (all bound to the same client).
const api: { current: ApiPorts | null } = { current: null }
const requireApi = () => {
  if (!api.current) throw Error("Offline replay is not mounted")
  return api.current
}
const activity = new WeakMap<
  object,
  ReturnType<typeof captureOfflineActivity>
>()
function captureActivity(batch: object) {
  if (!activity.has(batch)) activity.set(batch, captureOfflineActivity())
}

/**
 * One coordinator for the whole app (root reconciler and Sync status share
 * it), so two syncs never run at once. Lifetime and ownership come from the
 * live session, not a component's last render.
 */
const coordinator = createReplayCoordinator<ReplayResult>({
  lifetime: () => lifetimeKey(getSession()?.profile),
  prepare: () => {
    const batch = useOfflineCommandStore.getState().prepareReplay()
    const owner = getSession()?.profile
    // The captured partition must be the signed-in owner's own.
    if (
      !batch ||
      !owner?.id ||
      !owner.businessId ||
      !owner.storeId ||
      offlineCommandScopeKey(batch.scope) !==
        offlineCommandScopeKey({
          actorUserId: owner.id,
          businessId: owner.businessId,
          storeId: owner.storeId,
        })
    )
      return null
    return batch
  },
  register: (batch) => {
    captureActivity(batch)
    return requireApi().register(
      registerInput(batch, {
        appVersion: Constants.expoConfig?.version,
        os: Platform.OS,
      }),
    )
  },
  replay: (batch) => {
    captureActivity(batch)
    return requireApi().replay(replayInput(batch))
  },
  apply: (results, batch) =>
    useOfflineCommandStore.getState().applyScopedReplayResults(results, batch),
  refresh: (live) => requireApi().refresh(live),
  observe: ({ batch, outcome, results, durationMs }) => {
    const report = activity.get(batch)
    activity.delete(batch)
    if (outcome.status !== "applied" && outcome.status !== "failed") return
    report?.(
      syncActivity({
        outcome: outcome.status,
        statuses: results?.map((result) => result.status) ?? [],
        itemCount: batch.commands.length,
        durationMs,
      }),
    )
  },
})

export type RecoveryDecisionOutcome =
  | "applied"
  | "applied_refresh_failed"
  | "rejected"
  | "rejected_refresh_failed"
  /** Still held: the server couldn't apply it; another decision is needed. */
  | "held"
  | "retired"
  | "failed"

export type OfflineReplayStatus = { status: "idle" } | ReplayOutcome

/**
 * Shared offline replay for the root reconciler and the Sync status screen.
 * One coordinator per mounted owner: a captured batch is registered, replayed,
 * applied and refreshed only while the initiating actor, business, Store,
 * role, access mode and data-cache generation are unchanged.
 */
export function useOfflineReplay() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const register = useMutation(trpc.offline.registerDevice.mutationOptions())
  const replay = useMutation(trpc.offline.replay.mutationOptions())
  const review = useMutation(trpc.offline.review.mutationOptions())
  const decide = useMutation(trpc.offline.decideRecovery.mutationOptions())
  const ports = useRef({
    register: register.mutateAsync,
    replay: replay.mutateAsync,
    review: review.mutateAsync,
    decide: decide.mutateAsync,
  })
  ports.current = {
    register: register.mutateAsync,
    replay: replay.mutateAsync,
    review: review.mutateAsync,
    decide: decide.mutateAsync,
  }
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // This caller's own last outcome, shown only to the lifetime that asked.
  const [result, setResult] = useState<{
    lifetime: string | null
    outcome: ReplayOutcome
  } | null>(null)
  const currentLifetime = lifetimeKey(profile)
  // The lifetime this render's callbacks belong to.
  const renderLifetime = currentLifetime
  // Another lifetime only learns that an earlier sync ended (no details).
  const status: OfflineReplayStatus = !result
    ? { status: "idle" }
    : result.lifetime === currentLifetime
      ? result.outcome
      : { status: "retired" }

  // Orders, Home totals, stock, sales payment accounts and review state may
  // all have moved, including web work recorded while this phone was offline.
  // `live` is checked before each dispatch group and after each await, so a
  // scope change mid-refresh never touches the next owner's cache.
  async function refresh(live: () => boolean) {
    // A real failed refetch must surface as a refresh warning.
    const refetchFailures = { throwOnError: true }
    if (!live()) return
    await queryClient.invalidateQueries(
      trpc.stores.orderVisibility.queryFilter(),
      refetchFailures,
    )
    if (!live()) return
    await Promise.all([
      queryClient.invalidateQueries(
        trpc.offline.conflicts.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.catalog.listItems.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.catalog.listItemsPage.pathFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.orders.list.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.orders.listPage.pathFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.orders.customerCount.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.orders.reportSummary.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.orders.paymentAccounts.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.inventory.balanceReport.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.finance.balances.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.finance.moneyAccounts.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.services.queue.queryFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.services.queuePage.pathFilter(),
        refetchFailures,
      ),
      queryClient.invalidateQueries(
        trpc.tenant.featureAvailability.queryFilter(),
        refetchFailures,
      ),
    ])
  }
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  api.current = {
    register: (input) => ports.current.register(input),
    replay: (input) => ports.current.replay(input),
    refresh: (live) => refreshRef.current(live),
  }

  return {
    lifetimeKey: currentLifetime,
    status,
    /**
     * Behind a running sync this returns "queued" at once; the request's own
     * outcome still lands in this caller's `status` when its turn settles.
     */
    async request(
      request: ReplayRequest,
    ): Promise<ReplayOutcome | { status: "queued" }> {
      const lifetime = lifetimeKey(getSession()?.profile)
      const queued = coordinator.running
      const settled = coordinator.request(request)
      const record = (outcome: ReplayOutcome) => {
        if (mounted.current) setResult({ lifetime, outcome })
        return outcome
      }
      if (queued) {
        void settled.then(record)
        return { status: "queued" }
      }
      return record(await settled)
    },
    /**
     * Management review of a server-held command. Only the reviewer's own
     * captured partition can change locally, and nothing is applied or
     * refreshed once the initiating lifetime has ended.
     */
    async reviewCommand(
      input: Parameters<typeof review.mutateAsync>[0],
    ): Promise<"applied" | "applied_refresh_failed" | "retired" | "failed"> {
      const lifetime = lifetimeKey(getSession()?.profile)
      if (!lifetime) return "retired"
      const ownBatch = useOfflineCommandStore.getState().prepareReplay()
      const live = () => lifetimeKey(getSession()?.profile) === lifetime
      const report = captureOfflineActivity()
      try {
        const reviewed = await ports.current.review(input)
        if (!live()) return "retired"
        if (ownBatch)
          useOfflineCommandStore
            .getState()
            .applyScopedReplayResults([reviewed], ownBatch)
        if (mounted.current)
          report(reviewActivity(input.decision, reviewed.status))
      } catch {
        if (mounted.current && live())
          report(reviewActivity(input.decision, undefined))
        return live() ? "failed" : "retired"
      }
      // The decision is recorded; a refresh problem is only a warning.
      try {
        await refreshRef.current(live)
      } catch {
        return live() ? "applied_refresh_failed" : "retired"
      }
      // The decision stays recorded, but a retired lifetime gets no follow-up.
      return live() ? "applied" : "retired"
    },
    /**
     * Owner/Admin decision on a held suspended-staff record: the exact
     * envelope and a reason. Bound to the lifetime of the render that made
     * this callback (a retained or unmounted callback is inert), run in the
     * shared single flight, and reported from the server's receipt status,
     * never inferred from the request resolving. The reviewer's own queue
     * never changes here.
     */
    async decideRecovery(
      input: Parameters<typeof decide.mutateAsync>[0],
    ): Promise<RecoveryDecisionOutcome> {
      const origin = renderLifetime
      if (
        !mounted.current ||
        !origin ||
        origin !== lifetimeKey(getSession()?.profile)
      )
        return "retired"
      return coordinator.exclusive<RecoveryDecisionOutcome>(
        origin,
        async (live) => {
          const current = () => live() && mounted.current
          // Its turn may come after waiting: recheck right before dispatch.
          if (!current()) return "retired"
          const report = captureOfflineActivity()
          let receipt: Awaited<ReturnType<typeof decide.mutateAsync>>
          try {
            receipt = await ports.current.decide(input)
          } catch {
            if (current()) report(reviewActivity(input.decision, undefined))
            return current() ? "failed" : "retired"
          }
          if (!current()) return "retired"
          report(reviewActivity(input.decision, receipt.status))
          let refreshFailed = false
          try {
            await refreshRef.current(live)
          } catch {
            refreshFailed = true
          }
          if (!current()) return "retired"
          if (receipt.status === "approved")
            return refreshFailed ? "applied_refresh_failed" : "applied"
          if (receipt.status === "rejected")
            return refreshFailed ? "rejected_refresh_failed" : "rejected"
          return "held"
        },
        { retired: "retired", superseded: "retired" },
      )
    },
    decidePending: decide.isPending,
    decideError: decide.error,
    reviewPending: review.isPending,
    reviewError: review.error,
    get running() {
      return coordinator.running
    },
  }
}
