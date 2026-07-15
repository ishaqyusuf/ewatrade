import { ActionButton } from "@/components/mobile/action-button"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useBusinessStore } from "@/store/businessStore"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsSubscription,
  getBusinessSubscription,
  getPlan,
  getUsageLimitState,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import { forwardRef, useMemo, useState } from "react"
import { Linking, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type SubscriptionPlanSheetProps = {
  onComplete?: () => void
  usage: {
    businesses: number
    products: number
    staff: number
  }
}

type SubscriptionPlanContentProps = SubscriptionPlanSheetProps & {
  presentation?: "screen" | "sheet"
}

type ProductionSubscriptionSnapshot = {
  entitlements: Array<{
    isAtLimit: boolean
    key: keyof RetailOpsPlan["limits"]
    limit: number
    used: number
  }>
  plan: RetailOpsPlan
  plans: RetailOpsPlan[]
  subscription: {
    currentPeriodEndsAt: string | null
    planId: RetailOpsPlanId
    status: RetailOpsSubscription["status"]
    trialEndsAt: string | null
    updatedAt: string
  }
  usage: {
    businesses: number
    offlineDevices: number
    products: number
    staff: number
  }
}

type CheckoutIntent = {
  checkoutUrl: string | null
  intent: {
    status: "active_plan" | "checkout_created" | "provider_not_configured"
  }
  message: string
  provider: "app_store" | "manual" | "none" | "other" | "play_store" | "stripe"
  targetPlan: RetailOpsPlan
}

function formatDate(value: string | undefined) {
  if (!value) return "Not set"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not set"

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function subscriptionStatusLabel(status: RetailOpsSubscription["status"]) {
  if (status === "trialing") return "Trial"
  if (status === "past_due") return "Past due"
  if (status === "cancelled") return "Cancelled"
  return "Active"
}

function toOptionalDate(value: string | null | undefined) {
  return value ?? undefined
}

function UsageRow({
  label,
  limit,
  used,
}: {
  label: string
  limit: number
  used: number
}) {
  const limitState = getUsageLimitState(used, limit)

  return (
    <SecondaryOperationalRow
      detail={`${used} of ${limit} used`}
      title={label}
      trailing={
        <StatusBadge
          label={limitState.label}
          tone={limitState.isAtLimit ? "destructive" : "muted"}
        />
      }
    />
  )
}

function PlanLimitRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <SecondaryOperationalRow
      detail="Included in this plan"
      title={label}
      trailing={<StatusBadge label={value} tone="muted" />}
    />
  )
}

function PlanCard({
  actionLabel,
  current,
  disabled,
  onSelect,
  plan,
}: {
  actionLabel: string
  current: boolean
  disabled: boolean
  onSelect: () => void
  plan: RetailOpsPlan
}) {
  return (
    <SecondaryOperationalRow
      disabled={disabled}
      detail={plan.description}
      icon="ShieldCheck"
      metadata={plan.supportLabel}
      onPress={onSelect}
      selected={current}
      title={plan.name}
      trailing={
        <StatusBadge
          label={current ? "Current" : plan.priceLabel}
          tone={current ? "primary" : "muted"}
        />
      }
    >
      <View className="gap-2">
        <PlanLimitRow
          label="Businesses"
          value={`Up to ${plan.limits.businesses}`}
        />
        <PlanLimitRow
          label="Products"
          value={`Up to ${plan.limits.products}`}
        />
        <PlanLimitRow label="Staff" value={`Up to ${plan.limits.staff}`} />
      </View>
      <Text className="text-xs font-extrabold text-primary">{actionLabel}</Text>
    </SecondaryOperationalRow>
  )
}

function CheckoutIntentNotice({ intent }: { intent: CheckoutIntent }) {
  return (
    <StatusBanner
      icon="CreditCard"
      message={intent.message}
      title={`${intent.targetPlan.name} checkout`}
      tone="primary"
    />
  )
}

export function SubscriptionPlanContent({
  onComplete,
  presentation = "sheet",
  usage,
}: SubscriptionPlanContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const localSubscription = getBusinessSubscription(
    subscriptions,
    activeBusinessId,
  )
  const subscriptionQuery = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled: !isOfflineMode,
      retry: false,
    }),
  )
  const checkoutIntentMutation = useMutation(
    trpc.retailOps.createSubscriptionCheckoutIntent.mutationOptions(),
  )
  const productionSnapshot = subscriptionQuery.data as
    | ProductionSubscriptionSnapshot
    | undefined
  const shouldUseProductionSnapshot =
    !isOfflineMode && !!productionSnapshot && !subscriptionQuery.isError
  const subscription = shouldUseProductionSnapshot
    ? {
        businessId: activeBusinessId ?? "production-business",
        currentPeriodEndsAt: toOptionalDate(
          productionSnapshot.subscription.currentPeriodEndsAt,
        ),
        planId: productionSnapshot.subscription.planId,
        status: productionSnapshot.subscription.status,
        trialEndsAt: toOptionalDate(
          productionSnapshot.subscription.trialEndsAt,
        ),
        updatedAt: productionSnapshot.subscription.updatedAt,
      }
    : localSubscription
  const currentPlan = shouldUseProductionSnapshot
    ? productionSnapshot.plan
    : getPlan(subscription.planId)
  const plans = shouldUseProductionSnapshot
    ? productionSnapshot.plans
    : RETAIL_OPS_PLANS
  const usageSnapshot = shouldUseProductionSnapshot
    ? productionSnapshot.usage
    : usage
  const checkoutIntent = checkoutIntentMutation.data as
    | CheckoutIntent
    | undefined
  const sourceLabel = isOfflineMode
    ? "Local"
    : subscriptionQuery.isError
      ? "Local fallback"
      : subscriptionQuery.isFetching
        ? "Refreshing"
        : "Online"
  const sourceDetail = isOfflineMode
    ? "Plan changes stay local while this device is offline."
    : subscriptionQuery.isError
      ? "Production billing is unavailable, so local plan state is shown."
      : subscriptionQuery.isFetching
        ? "Refreshing production plan and entitlement usage."
        : "Production billing controls the current plan, limits, and upgrade handoff."
  const offlineDeviceUsage = shouldUseProductionSnapshot
    ? productionSnapshot.usage.offlineDevices
    : null
  const reportHistoryLimit = currentPlan.limits.reportsHistoryDays
  const isCheckoutPending = checkoutIntentMutation.isPending
  const canRequestCheckout = shouldUseProductionSnapshot && !isCheckoutPending

  const selectPlan = (plan: RetailOpsPlan) => {
    if (plan.id === currentPlan.id || !canRequestCheckout) return

    checkoutIntentMutation.mutate(
      {
        planId: plan.id,
        surface: "mobile",
      },
      {
        onError(error) {
          setCheckoutError(error.message)
        },
        async onSuccess(intent: CheckoutIntent) {
          setCheckoutError(null)

          if (!intent.checkoutUrl) return

          const canOpen = await Linking.canOpenURL(intent.checkoutUrl)
          if (!canOpen) {
            setCheckoutError(
              "The checkout link could not be opened on this device.",
            )
            return
          }

          await Linking.openURL(intent.checkoutUrl)
        },
      },
    )
  }
  const planActionLabels = useMemo(() => {
    const labels: Record<string, string> = {}

    for (const plan of plans) {
      if (plan.id === currentPlan.id) {
        labels[plan.id] = "Current plan"
        continue
      }

      if (isCheckoutPending) {
        labels[plan.id] = "Preparing"
        continue
      }

      labels[plan.id] = shouldUseProductionSnapshot
        ? "Request upgrade"
        : "Online required"
    }

    return labels
  }, [currentPlan.id, isCheckoutPending, plans, shouldUseProductionSnapshot])

  const content = (
    <View className="gap-5 px-5 pb-6">
          <SecondarySheetHeader
            description="Plan limits are business-scoped and upgrade requests stay behind the billing provider boundary."
            icon="CreditCard"
            title="Business plan"
          />

          <StatusBanner
            icon={sourceLabel === "Online" ? "CircleCheck" : "Clock"}
            message={sourceDetail}
            title={`Billing source: ${sourceLabel}`}
            tone={sourceLabel === "Online" ? "success" : "warning"}
          />

          {checkoutError || checkoutIntentMutation.error ? (
            <StatusBanner
              icon="TriangleAlert"
              message={
                checkoutError ??
                checkoutIntentMutation.error?.message ??
                "Try the upgrade request again."
              }
              title="Upgrade request failed"
              tone="destructive"
            />
          ) : null}

          {checkoutIntent ? (
            <CheckoutIntentNotice intent={checkoutIntent} />
          ) : null}

          {!shouldUseProductionSnapshot ? (
            <StatusBanner
              icon="TriangleAlert"
              message="Local subscription data is shown only as a fallback. Reconnect to request an upgrade from the business account."
              title="Upgrade requests need production billing"
              tone="warning"
            />
          ) : null}

          <View className="gap-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-extrabold text-foreground">
                  {currentPlan.name}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {subscription.status === "trialing"
                    ? `Trial ends ${formatDate(subscription.trialEndsAt)}`
                    : `Renews ${formatDate(subscription.currentPeriodEndsAt)}`}
                </Text>
              </View>
              <StatusBadge
                label={subscriptionStatusLabel(subscription.status)}
                tone={
                  subscription.status === "past_due" ? "warning" : "success"
                }
              />
            </View>
            <UsageRow
              label="Businesses"
              limit={currentPlan.limits.businesses}
              used={usageSnapshot.businesses}
            />
            <UsageRow
              label="Products"
              limit={currentPlan.limits.products}
              used={usageSnapshot.products}
            />
            <UsageRow
              label="Staff"
              limit={currentPlan.limits.staff}
              used={usageSnapshot.staff}
            />
            {offlineDeviceUsage === null ? null : (
              <UsageRow
                label="Offline devices"
                limit={currentPlan.limits.offlineDevices}
                used={offlineDeviceUsage}
              />
            )}
            <PlanLimitRow
              label="Report history"
              value={`${reportHistoryLimit} days`}
            />
          </View>

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">Tiers</Text>
            {plans.map((plan) => (
              <PlanCard
                actionLabel={planActionLabels[plan.id] ?? "Select"}
                current={plan.id === subscription.planId}
                disabled={
                  plan.id === currentPlan.id ||
                  isCheckoutPending ||
                  !shouldUseProductionSnapshot
                }
                key={plan.id}
                onSelect={() => selectPlan(plan)}
                plan={plan}
              />
            ))}
          </View>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={140}
        contentContainerStyle={{ paddingBottom: 120 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={112}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const SubscriptionPlanSheet = forwardRef<
  BottomSheetModal,
  SubscriptionPlanSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Subscription"
    >
      <SubscriptionPlanContent {...props} presentation="sheet" />
    </Modal>
  )
})

SubscriptionPlanSheet.displayName = "SubscriptionPlanSheet"
