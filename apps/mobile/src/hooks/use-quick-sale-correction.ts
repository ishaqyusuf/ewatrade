import { useAuthContext } from "@/hooks/use-auth"
import { classifyOperationFailure } from "@/lib/operation-failure"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import {
  getOperationalModeGeneration,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useSyncExternalStore } from "react"

type LifetimeFacts = {
  token: string | null | undefined
  profile:
    | {
        id: string
        businessId?: string
        storeId?: string
        role?: string
        staffAccessMode?: string
        status?: string
      }
    | null
    | undefined
  hasBusinessAccess: boolean | null | undefined
  offline: boolean
}

/**
 * The exact online session that may send a correction: token, actor,
 * business, Store, role/access/status and the data-cache, session and
 * operational-mode generations. Null offline or signed out.
 */
function correctionLifetime(facts: LifetimeFacts) {
  const { profile } = facts
  if (facts.offline || !facts.token || !profile?.id) return null
  return JSON.stringify([
    facts.token,
    profile.id,
    profile.businessId ?? null,
    profile.storeId ?? null,
    profile.role ?? null,
    profile.staffAccessMode ?? null,
    profile.status ?? null,
    facts.hasBusinessAccess ?? null,
    getDataCacheGeneration(),
    getSessionGeneration(),
    getOperationalModeGeneration(),
  ])
}

function liveCorrectionLifetime() {
  const session = getSession()
  return correctionLifetime({
    token: session?.token,
    profile: session?.profile,
    hasBusinessAccess: session?.accessProfile?.hasBusinessAccess,
    offline: useOperationalModeStore.getState().isOfflineMode,
  })
}

// App-wide: one transport per attempt, across remounts and screens.
const sending = new Set<string>()
const listeners = new Set<() => void>()
function notify() {
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
let snapshot: ReadonlySet<string> = new Set()
function sendingSnapshot() {
  return snapshot
}
function setSending(key: string, active: boolean) {
  if (active) sending.add(key)
  else sending.delete(key)
  snapshot = new Set(sending)
  notify()
}

export type CorrectionAction =
  /** Nothing was sent: wrong session, offline, unmounted or already sending. */
  | "inert"
  /** The attempt couldn't be saved on this phone, so nothing was sent. */
  | "not_saved"
  | "settled"

/**
 * Fixing an older queued Quick sale's missing descriptions. The attempt is
 * saved on this phone before anything is sent; every retry re-sends that same
 * fix. A server reply always settles through the store's own checks, even if
 * this screen has gone; this hook only gates who may start or re-send.
 */
export function useQuickSaleCorrection() {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const mutation = useMutation(
    trpc.offline.correctBlankQuickSale.mutationOptions({ retry: false }),
  )
  const lifetime = correctionLifetime({
    token: auth.token,
    profile: auth.profile,
    hasBusinessAccess: auth.accessProfile?.hasBusinessAccess,
    offline,
  })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const inFlight = useSyncExternalStore(
    subscribe,
    sendingSnapshot,
    sendingSnapshot,
  )
  /** The rendered session is still the live, online one, and still shown. */
  const current = (origin: string | null) =>
    origin !== null && mounted.current && origin === liveCorrectionLifetime()

  async function send(
    key: string,
    origin: string | null,
    live: () => boolean,
  ): Promise<CorrectionAction> {
    if (!current(origin) || !live() || sending.has(key)) return "inert"
    // Held across the storage await, so a second press can't slip in.
    setSending(key, true)
    try {
      const store = useOfflineCommandStore.getState()
      const state = store.corrections[key]?.state
      if (state !== "ready" && state !== "sent" && state !== "unknown")
        return "inert"
      // Every send, including re-sends, first proves the exact fix is saved.
      if (!(await store.secureCorrection(key))) return "not_saved"
      if (!current(origin) || !live()) return "inert"
      const ticket = useOfflineCommandStore.getState().issueCorrection(key)
      if (!ticket) return "inert"
      let receipt: unknown
      try {
        receipt = await mutation.mutateAsync(ticket.request)
      } catch (error) {
        // Only a structured rejection refuses this fix; anything else is
        // uncertain and re-checks the same fix later.
        const kind = classifyOperationFailure(error)
        useOfflineCommandStore.getState().settleCorrection(ticket, {
          failure: kind === "unknown" ? "unknown" : "refused",
        })
        return "settled"
      }
      useOfflineCommandStore.getState().settleCorrection(ticket, { receipt })
      return "settled"
    } finally {
      setSending(key, false)
    }
  }

  return {
    /** Online with an active session: sending is possible. */
    canSend: lifetime !== null,
    isSending: (key: string | null | undefined) =>
      Boolean(key && inFlight.has(key)),
    /**
     * Save the fix on this phone, then send it. `live` is the caller's own
     * visibility (e.g. the sheet still showing this sale); it is checked
     * again after every await.
     */
    async start(
      clientCommandId: string,
      descriptions: Readonly<Record<number, string>>,
      live: () => boolean = () => true,
    ): Promise<CorrectionAction> {
      const origin = lifetime
      if (!current(origin) || !live()) return "inert"
      const attempt = await useOfflineCommandStore
        .getState()
        .prepareCorrection(clientCommandId, descriptions)
      if (!attempt) return "not_saved"
      return send(attempt.key, origin, live)
    },
    /** Re-send exactly the saved fix (no reply, restart or not sent yet). */
    checkAgain(
      key: string,
      live: () => boolean = () => true,
    ): Promise<CorrectionAction> {
      return send(key, lifetime, live)
    },
  }
}
