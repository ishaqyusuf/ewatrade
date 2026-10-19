import { useAuthContext } from "@/hooks/use-auth"
import { syncActivity } from "@/lib/offline-activity"
import { captureOfflineActivity } from "@/lib/offline-activity-runtime"
import type { OfflineCommandScope } from "@/lib/offline-command-scope"
import { offlineCommandScopeKey } from "@/lib/offline-command-scope"
import { replayInput } from "@/lib/offline-replay-client"
import {
  type ReplayOutcome,
  createReplayCoordinator,
} from "@/lib/offline-replay-coordinator"
import { getSession } from "@/lib/session-store"
import {
  type OfflineReplayBatch,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useSyncExternalStore } from "react"

type RecoveryAck = RouterOutputs["offline"]["recover"][number]
type RecoverInput = ReturnType<typeof replayInput>

/**
 * The exact signed-in session that may recover right now: token, full
 * profile scope, role/access, business-access flag and data-cache generation.
 * Any change retires earlier callbacks and in-flight work. (Memory only.)
 */
function recoveryLifetime() {
  const session = getSession()
  const profile = session?.profile
  if (!session?.token || !profile?.id) return null
  return JSON.stringify([
    session.token,
    profile.id,
    profile.businessId ?? null,
    profile.storeId ?? null,
    profile.role ?? null,
    profile.staffAccessMode ?? null,
    session.accessProfile?.hasBusinessAccess ?? null,
    getDataCacheGeneration(),
  ])
}

type RequestState = {
  /** Origin still current: same render lifetime and still mounted. */
  origin: () => boolean
  sent: boolean
  deviceId?: string
  acks?: RecoveryAck[]
}

const api: {
  recover: ((input: RecoverInput) => Promise<RecoveryAck[]>) | null
} = { recover: null }
// Per-request state, keyed by the caller's own fresh scope object.
const requests = new WeakMap<object, RequestState>()
const requestByBatch = new WeakMap<OfflineReplayBatch, object>()
const activity = new WeakMap<
  object,
  ReturnType<typeof captureOfflineActivity>
>()

/**
 * Single-flight recovery upload for a staff member whose access was paused or
 * suspended. Sends the exact issued envelopes of one explicitly chosen own
 * partition; acknowledgements only go to applyScopedRecoveryResults. Nothing
 * is uploaded automatically, no device is registered and no business data is
 * read.
 */
const coordinator = createReplayCoordinator<RecoveryAck>({
  lifetime: recoveryLifetime,
  // Runs at this request's turn, immediately before transport.
  prepare: (request) => {
    const state = request.scope ? requests.get(request.scope) : undefined
    if (!request.scope || !state?.origin()) return null
    const batch = useOfflineCommandStore
      .getState()
      .prepareRecovery(request.scope)
    if (batch) {
      requestByBatch.set(batch, request.scope)
      state.deviceId = batch.deviceId
    }
    return batch
  },
  register: async () => undefined,
  replay: async (batch) => {
    if (!api.recover) throw Error("Offline recovery is not mounted")
    activity.set(batch, captureOfflineActivity())
    const request = requestByBatch.get(batch)
    const state = request ? requests.get(request) : undefined
    if (state) state.sent = true
    const acks = await api.recover(replayInput(batch))
    if (state) state.acks = acks
    return acks
  },
  apply: (acks, batch) =>
    useOfflineCommandStore.getState().applyScopedRecoveryResults(acks, batch),
  // Recovery returns no business facts, so there is nothing to refresh.
  refresh: async () => undefined,
  observe: ({ batch, outcome, results, durationMs }) => {
    const report = activity.get(batch)
    activity.delete(batch)
    if (outcome.status !== "applied" && outcome.status !== "failed") return
    const request = requestByBatch.get(batch)
    if (!request || !requests.get(request)?.origin()) return
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

// App-wide busy state: the partition being sent while any send is pending.
let outstanding = 0
let busyKey: string | null = null
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getBusyKey = () => busyKey

export type RecoverySendResult = {
  outcome: ReplayOutcome
  /** The request reached the server (its outcome may still be unknown). */
  sent: boolean
  held: number
  approved: number
  rejected: number
}

export function useOfflineRecovery() {
  // Re-render on sign-in changes; this render's callbacks belong to it.
  useAuthContext()
  const renderLifetime = recoveryLifetime()
  const trpc = useTRPC()
  const recover = useMutation(trpc.offline.recover.mutationOptions())
  const recoverRef = useRef(recover.mutateAsync)
  recoverRef.current = recover.mutateAsync
  api.recover = (input) => recoverRef.current(input)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const sending = useSyncExternalStore(subscribe, getBusyKey, getBusyKey)
  return {
    /** Partition being sent anywhere in the app (shared single flight). */
    sending,
    /** Explicit, per-partition send. Resolves with that send's own result. */
    async send(
      partitionKey: string,
      scope: OfflineCommandScope,
    ): Promise<RecoverySendResult> {
      const result = (
        outcome: ReplayOutcome,
        sent: boolean,
        acks: RecoveryAck[] = [],
      ): RecoverySendResult => ({
        outcome,
        sent,
        held: acks.filter((ack) => ack.status === "held").length,
        approved: acks.filter((ack) => ack.status === "approved").length,
        rejected: acks.filter((ack) => ack.status === "rejected").length,
      })
      const origin = () =>
        mounted.current &&
        renderLifetime !== null &&
        renderLifetime === recoveryLifetime()
      const offered = () =>
        useOfflineCommandStore
          .getState()
          .recoveryPartitions()
          .some(
            (partition) =>
              offlineCommandScopeKey(partition.scope) ===
              offlineCommandScopeKey(scope),
          )
      // Admission: this render's exact session, still mounted, and a scope
      // this person is explicitly offered. Nothing is sent otherwise.
      if (!origin() || !offered()) return result({ status: "retired" }, false)
      // A fresh object per request so its state and acknowledgements can't mix.
      const request = { ...scope }
      const state: RequestState = { origin, sent: false }
      requests.set(request, state)
      outstanding += 1
      busyKey = partitionKey
      notify()
      try {
        const outcome = await coordinator.request({
          registerFirst: false,
          scope: request,
        })
        // Acknowledgements are shown only to the same session, for the same
        // partition device that was sent; otherwise no counts at all.
        const proven =
          outcome.status === "applied" &&
          origin() &&
          state.deviceId !== undefined &&
          useOfflineCommandStore.getState().deviceIdsByScope[
            offlineCommandScopeKey(scope)
          ] === state.deviceId
        if (proven) return result(outcome, true, state.acks)
        if (outcome.status === "applied" || !origin())
          return result({ status: "retired" }, state.sent)
        return result(outcome, state.sent)
      } finally {
        outstanding -= 1
        if (outstanding === 0) busyKey = null
        notify()
      }
    },
  }
}
