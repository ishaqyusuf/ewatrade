import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "./mmkv";

export type RetailOpsPlanId = "starter" | "growth" | "pro";

export type RetailOpsPlanLimits = {
  businesses: number;
  offlineDevices: number;
  products: number;
  reportsHistoryDays: number;
  staff: number;
};

export type RetailOpsPlan = {
  description: string;
  id: RetailOpsPlanId;
  limits: RetailOpsPlanLimits;
  name: string;
  priceLabel: string;
  supportLabel: string;
};

export type RetailOpsSubscription = {
  businessId: string;
  currentPeriodEndsAt?: string;
  planId: RetailOpsPlanId;
  status: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt?: string;
  updatedAt: string;
};

type SubscriptionState = {
  hasHydrated: boolean;
  setBusinessPlan: (businessId: string, planId: RetailOpsPlanId) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  subscriptions: Record<string, RetailOpsSubscription>;
};

export const RETAIL_OPS_PLANS: RetailOpsPlan[] = [
  {
    description: "For one shop starting with simple sales and stock tracking.",
    id: "starter",
    limits: {
      businesses: 1,
      offlineDevices: 1,
      products: 25,
      reportsHistoryDays: 30,
      staff: 2,
    },
    name: "Starter",
    priceLabel: "Trial",
    supportLabel: "Standard support",
  },
  {
    description: "For growing teams that need more attendants and history.",
    id: "growth",
    limits: {
      businesses: 3,
      offlineDevices: 5,
      products: 150,
      reportsHistoryDays: 180,
      staff: 10,
    },
    name: "Growth",
    priceLabel: "Most popular",
    supportLabel: "Priority support",
  },
  {
    description: "For multi-branch businesses with heavier operations.",
    id: "pro",
    limits: {
      businesses: 10,
      offlineDevices: 20,
      products: 500,
      reportsHistoryDays: 730,
      staff: 50,
    },
    name: "Pro",
    priceLabel: "Advanced",
    supportLabel: "Dedicated support",
  },
];

export function getPlan(planId: RetailOpsPlanId) {
  return (
    RETAIL_OPS_PLANS.find((plan) => plan.id === planId) ??
    (RETAIL_OPS_PLANS[0] as RetailOpsPlan)
  );
}

export function getDefaultSubscription(
  businessId: string,
): RetailOpsSubscription {
  const now = new Date();
  const trialEndsAt = new Date(now);

  trialEndsAt.setDate(now.getDate() + 14);

  return {
    businessId,
    planId: "starter",
    status: "trialing",
    trialEndsAt: trialEndsAt.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function getBusinessSubscription(
  subscriptions: Record<string, RetailOpsSubscription>,
  businessId: string | null | undefined,
) {
  const resolvedBusinessId = businessId || "local-business";

  return (
    subscriptions[resolvedBusinessId] ??
    getDefaultSubscription(resolvedBusinessId)
  );
}

export function getUsageLimitState(used: number, limit: number) {
  return {
    isAtLimit: used >= limit,
    label: `${used}/${limit}`,
  };
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
        state?.setHasHydrated(true);
      },
    },
  ),
);
