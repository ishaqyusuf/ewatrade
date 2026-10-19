import {
  type CheckoutAccountReadTicket,
  type CheckoutAccountSnapshot,
  checkoutAccountScope,
  checkoutAccountScopeKey,
  checkoutAccountTicketCurrent,
  parseCheckoutAccountSnapshot,
} from "@/lib/checkout-payment-account-cache"
import { getSession } from "@/lib/session-store"
import { getDataCacheGeneration } from "@/trpc/client"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { zustandStorage } from "./mmkv"

type AccountCacheState = {
  snapshots: Record<string, CheckoutAccountSnapshot>
  /** In-memory tombstones/write fences; an older async restore cannot undo them. */
  locallyChangedScopes: Record<string, true>
  capture: (currencyCode: string) => CheckoutAccountReadTicket | null
  read: (currencyCode: string) => CheckoutAccountSnapshot | null
  record: (ticket: CheckoutAccountReadTicket, response: unknown) => boolean
  forget: (ticket: CheckoutAccountReadTicket) => void
}
type PersistedAccounts = Pick<AccountCacheState, "snapshots">
const scopeNow = (currencyCode: string) =>
  checkoutAccountScope(getSession()?.profile, currencyCode)
const current = (ticket: CheckoutAccountReadTicket) =>
  checkoutAccountTicketCurrent(
    ticket,
    scopeNow(ticket.scope.currencyCode),
    getDataCacheGeneration(),
  )

/** Last known receiving-account names/settings; never balances or fresh authority. */
export const useCheckoutPaymentAccountStore = create<AccountCacheState>()(
  persist<AccountCacheState, [], [], PersistedAccounts>(
    (set, get) => ({
      snapshots: {},
      locallyChangedScopes: {},
      capture: (currencyCode) => {
        const scope = scopeNow(currencyCode)
        return scope ? { scope, generation: getDataCacheGeneration() } : null
      },
      read: (currencyCode) => {
        const scope = scopeNow(currencyCode)
        return scope
          ? parseCheckoutAccountSnapshot(
              get().snapshots[checkoutAccountScopeKey(scope)],
            )
          : null
      },
      record: (ticket, response) => {
        if (!current(ticket)) return false
        const snapshot = parseCheckoutAccountSnapshot({
          scope: ticket.scope,
          checkedAt: Date.now(),
          data: response,
        })
        if (!snapshot) return false
        set((state) => {
          const entries = Object.entries({
            ...state.snapshots,
            [checkoutAccountScopeKey(ticket.scope)]: snapshot,
          })
            .sort(([, a], [, b]) => b.checkedAt - a.checkedAt)
            .slice(0, 32)
          return {
            snapshots: Object.fromEntries(entries),
            locallyChangedScopes: {
              ...state.locallyChangedScopes,
              [checkoutAccountScopeKey(ticket.scope)]: true,
            },
          }
        })
        return true
      },
      forget: (ticket) => {
        if (!current(ticket)) return
        set((state) => ({
          locallyChangedScopes: {
            ...state.locallyChangedScopes,
            [checkoutAccountScopeKey(ticket.scope)]: true,
          },
          snapshots: Object.fromEntries(
            Object.entries(state.snapshots).filter(
              ([key]) => key !== checkoutAccountScopeKey(ticket.scope),
            ),
          ),
        }))
      },
    }),
    {
      name: "ewatrade-mobile-checkout-accounts",
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ snapshots: state.snapshots }),
      merge: (persisted, currentState) => {
        const input =
          persisted && typeof persisted === "object" && "snapshots" in persisted
            ? persisted.snapshots
            : null
        const snapshots =
          input && typeof input === "object"
            ? Object.values(input)
                .map(parseCheckoutAccountSnapshot)
                .filter(
                  (entry): entry is CheckoutAccountSnapshot => entry !== null,
                )
                .sort((a, b) => b.checkedAt - a.checkedAt)
            : []
        const unique = new Map<string, CheckoutAccountSnapshot>()
        for (const entry of snapshots) {
          const key = checkoutAccountScopeKey(entry.scope)
          if (!unique.has(key) && !currentState.locallyChangedScopes[key])
            unique.set(key, entry)
        }
        for (const entry of Object.values(currentState.snapshots))
          unique.set(checkoutAccountScopeKey(entry.scope), entry)
        return {
          ...currentState,
          snapshots: Object.fromEntries(
            [...unique]
              .sort(([, a], [, b]) => b.checkedAt - a.checkedAt)
              .slice(0, 32),
          ),
        }
      },
    },
  ),
)
