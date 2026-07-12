import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsPlanLimits,
  type RetailOpsSubscription,
  getBusinessSubscription,
  getDefaultSubscription,
  getPlan,
  getUsageLimitState,
} from "@/lib/retail-ops-subscription"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { zustandStorage } from "./mmkv"

export {
  getBusinessSubscription,
  getDefaultSubscription,
  getPlan,
  getUsageLimitState,
  RETAIL_OPS_PLANS,
}
export type {
  RetailOpsPlan,
  RetailOpsPlanId,
  RetailOpsPlanLimits,
  RetailOpsSubscription,
}

type SubscriptionState = {
  hasHydrated: boolean
  setBusinessPlan: (businessId: string, planId: RetailOpsPlanId) => void
  setHasHydrated: (hasHydrated: boolean) => void
  subscriptions: Record<string, RetailOpsSubscription>
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      subscriptions: {},
      setBusinessPlan: (businessId, planId) =>
        set((state) => ({
          subscriptions: {
            ...state.subscriptions,
            [businessId]: {
              businessId,
              currentPeriodEndsAt: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              planId,
              status: "active",
              updatedAt: new Date().toISOString(),
            },
          },
        })),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "ewatrade-mobile-subscriptions",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        subscriptions: state.subscriptions,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
