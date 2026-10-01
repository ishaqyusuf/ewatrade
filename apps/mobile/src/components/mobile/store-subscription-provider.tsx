import type { ReactNode } from "react"
export function StoreSubscriptionProvider({ children }: { children: ReactNode }) {
  return children
}
// Native billing is unavailable on web.
export function useStoreSubscription(): ReturnType<typeof import("./store-subscription-provider.native").useStoreSubscription> { return null }
