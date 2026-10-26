// Android paid launch only. iOS continues using the informational provider;
// expo-iap remains excluded from iOS autolinking until its own release is ready.
import type { ReactNode } from "react"

export function StoreSubscriptionProvider({
  children,
}: { children: ReactNode }) {
  return children
}

export function useStoreSubscription(): ReturnType<
  typeof import("./store-subscription-provider.native").useStoreSubscription
> {
  return null
}
