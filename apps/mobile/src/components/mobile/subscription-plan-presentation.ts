import {
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsSubscription,
  getUsageLimitState,
} from "@/lib/retail-ops-subscription"

export const SUBSCRIPTION_SCREEN_COPY = {
  description: "See your limits and compare plans for this business.",
  title: "Plan & billing",
} as const

export function getSubscriptionUsagePresentation(used: number, limit: number) {
  const limitState = getUsageLimitState(used, limit)

  return {
    isAtLimit: limitState.isAtLimit,
    statusLabel: limitState.isAtLimit ? "At limit" : null,
    valueLabel: `${used} / ${limit}`,
  }
}

export function getSubscriptionStatusTone(
  status: RetailOpsSubscription["status"],
) {
  if (status === "cancelled") return "destructive" as const
  if (status === "past_due") return "warning" as const
  return "success" as const
}

export function getSubscriptionPlanPresentation({
  canRequestCheckout,
  currentPlanId,
  isCheckoutPending,
  plan,
}: {
  canRequestCheckout: boolean
  currentPlanId: RetailOpsPlanId
  isCheckoutPending: boolean
  plan: RetailOpsPlan
}) {
  const current = plan.id === currentPlanId
  const canSelect = !current && canRequestCheckout && !isCheckoutPending

  return {
    actionLabel: current
      ? null
      : isCheckoutPending
        ? "Preparing"
        : canRequestCheckout
          ? "Request upgrade"
          : "Online required",
    badgeLabel: current ? "Current" : plan.priceLabel,
    canSelect,
    current,
  }
}
