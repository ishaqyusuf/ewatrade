import {
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsSubscription,
  getUsageLimitState,
} from "@/lib/retail-ops-subscription"

export const SUBSCRIPTION_SCREEN_COPY = {
  title: "Plan & billing",
} as const

export function getSubscriptionUsagePresentation(
  used: number,
  limit: number | null,
) {
  const limitState = getUsageLimitState(used, limit)

  return {
    isAtLimit: limitState.isAtLimit,
    statusLabel: limitState.isAtLimit ? "At limit" : null,
    valueLabel: limit === null ? `${used} · no limit` : `${used} / ${limit}`,
  }
}

/** Plan summary line; the launch plan has no trial end or renewal date. */
export function getSubscriptionTermLabel(
  subscription: Pick<
    RetailOpsSubscription,
    "currentPeriodEndsAt" | "status" | "trialEndsAt"
  >,
  plan: Pick<RetailOpsPlan, "priceLabel">,
  formatDate: (value: string) => string,
) {
  if (subscription.status === "trialing" && subscription.trialEndsAt) {
    return `Trial ends ${formatDate(subscription.trialEndsAt)}`
  }
  if (subscription.currentPeriodEndsAt) {
    return `Renews ${formatDate(subscription.currentPeriodEndsAt)}`
  }
  return plan.priceLabel
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
