import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsSubscription,
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import { forwardRef, useState } from "react"
import { Linking, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import {
  SUBSCRIPTION_SCREEN_COPY,
  getSubscriptionPlanPresentation,
  getSubscriptionStatusTone,
  getSubscriptionUsagePresentation,
} from "./subscription-plan-presentation"

type SubscriptionPlanSheetProps = {
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

function UsageTile({
  label,
  limit,
  used,
}: {
  label: string
  limit: number
  used: number
}) {
  const presentation = getSubscriptionUsagePresentation(used, limit)

  return (
    <View className="min-h-20 justify-center gap-1 py-3">
      <Text className="text-xl font-extrabold tracking-tight text-foreground">
        {presentation.valueLabel}
      </Text>
      <Text className="text-xs font-semibold text-muted-foreground">
        {label}
      </Text>
      {presentation.statusLabel ? (
        <Text className="text-[10px] font-extrabold uppercase tracking-wide text-destructive">
          {presentation.statusLabel}
        </Text>
      ) : null}
    </View>
  )
}

function PlanCard({
  canRequestCheckout,
  currentPlanId,
  isCheckoutPending,
  onSelect,
  plan,
}: {
  canRequestCheckout: boolean
  currentPlanId: RetailOpsPlanId
  isCheckoutPending: boolean
  onSelect: () => void
  plan: RetailOpsPlan
}) {
  const presentation = getSubscriptionPlanPresentation({
    canRequestCheckout,
    currentPlanId,
    isCheckoutPending,
    plan,
  })

  return (
    <Pressable
      accessibilityLabel={`${plan.name} plan, ${presentation.badgeLabel}`}
      accessibilityRole={presentation.canSelect ? "button" : undefined}
      accessibilityState={{
        disabled: !presentation.canSelect,
        selected: presentation.current,
      }}
      className={cn(
        "will-change-animation gap-2 border-b border-border py-4 active:bg-accent",
        presentation.current && "bg-primary/5",
        !presentation.current && !canRequestCheckout && "opacity-60",
      )}
      disabled={!presentation.canSelect}
      haptic
      onPress={presentation.canSelect ? onSelect : undefined}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-lg font-extrabold text-foreground">
            {plan.name}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {plan.description}
          </Text>
        </View>
        <StatusBadge
          label={presentation.badgeLabel}
          tone={presentation.current ? "primary" : "muted"}
        />
      </View>
      <Text className="text-xs font-semibold text-muted-foreground">
        {plan.supportLabel}
      </Text>
      <Text className="text-xs leading-5 text-muted-foreground">
        {plan.limits.businesses}{" "}
        {plan.limits.businesses === 1 ? "business" : "businesses"} ·{" "}
        {plan.limits.products} catalog items · {plan.limits.staff} staff
      </Text>
      <Text className="text-xs leading-5 text-muted-foreground">
        {plan.limits.offlineDevices}{" "}
        {plan.limits.offlineDevices === 1
          ? "offline device"
          : "offline devices"}{" "}
        · {plan.limits.reportsHistoryDays}-day reports
      </Text>
      {presentation.actionLabel ? (
        <Text className="text-xs font-extrabold text-primary">
          {presentation.actionLabel} ›
        </Text>
      ) : null}
    </Pressable>
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
  presentation = "sheet",
  usage,
}: SubscriptionPlanContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode)
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
  const comparisonPlans = plans.filter((plan) => plan.id !== currentPlan.id)
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
  const shouldShowSourceNotice =
    sourceLabel !== "Online" && sourceLabel !== "Refreshing"
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
  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <Text className="text-sm leading-5 text-muted-foreground">
        {SUBSCRIPTION_SCREEN_COPY.description}
      </Text>

      {shouldShowSourceNotice ? (
        <StatusBanner
          actionLabel={subscriptionQuery.isError ? "Try again" : undefined}
          icon="Clock"
          message={sourceDetail}
          onActionPress={
            subscriptionQuery.isError
              ? () => void subscriptionQuery.refetch()
              : undefined
          }
          title={sourceLabel}
          tone="warning"
        />
      ) : null}

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

      {checkoutIntent ? <CheckoutIntentNotice intent={checkoutIntent} /> : null}

      {!shouldUseProductionSnapshot ? (
        <StatusBanner
          icon="TriangleAlert"
          message="Local subscription data is shown only as a fallback. Reconnect to request an upgrade from the business account."
          title="Upgrade requests need production billing"
          tone="warning"
        />
      ) : null}

      <View className="flex-row items-center gap-3 border-y border-border py-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
            Current plan
          </Text>
          <Text className="text-xl font-extrabold tracking-tight text-foreground">
            {currentPlan.name}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {subscription.status === "trialing"
              ? `Trial ends ${formatDate(subscription.trialEndsAt)}`
              : `Renews ${formatDate(subscription.currentPeriodEndsAt)}`}{" "}
            · {currentPlan.supportLabel}
          </Text>
        </View>
        <StatusBadge
          label={subscriptionStatusLabel(subscription.status)}
          tone={getSubscriptionStatusTone(subscription.status)}
        />
      </View>

      <View className="gap-2">
        <View className="flex-row items-end justify-between gap-3">
          <Text className="text-base font-bold text-foreground">Usage</Text>
          <Text className="text-xs text-muted-foreground">
            {currentPlan.name} limits
          </Text>
        </View>
        <View className="border-y border-border">
          <View className="flex-row">
            <View className="min-w-0 flex-1 border-r border-border pr-4">
              <UsageTile
                label="Businesses"
                limit={currentPlan.limits.businesses}
                used={usageSnapshot.businesses}
              />
            </View>
            <View className="min-w-0 flex-1 pl-4">
              <UsageTile
                label="Catalog items"
                limit={currentPlan.limits.products}
                used={usageSnapshot.products}
              />
            </View>
          </View>
          <View className="h-px bg-border" />
          <View className="flex-row">
            <View className="min-w-0 flex-1 border-r border-border pr-4">
              <UsageTile
                label="Staff"
                limit={currentPlan.limits.staff}
                used={usageSnapshot.staff}
              />
            </View>
            <View className="min-w-0 flex-1 pl-4">
              {offlineDeviceUsage === null ? (
                <View className="min-h-20 justify-center gap-1 py-3">
                  <Text className="text-xl font-extrabold tracking-tight text-foreground">
                    {reportHistoryLimit} days
                  </Text>
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Report history
                  </Text>
                </View>
              ) : (
                <UsageTile
                  label="Offline devices"
                  limit={currentPlan.limits.offlineDevices}
                  used={offlineDeviceUsage}
                />
              )}
            </View>
          </View>
        </View>
      </View>

      <View className="gap-2">
        <View className="flex-row items-end justify-between gap-3">
          <Text className="text-base font-bold text-foreground">
            Compare plans
          </Text>
          <Text className="text-xs text-muted-foreground">
            {reportHistoryLimit}-day reports now
          </Text>
        </View>
        <View className="border-t border-border">
          {comparisonPlans.map((plan) => (
            <PlanCard
              canRequestCheckout={canRequestCheckout}
              currentPlanId={currentPlan.id}
              isCheckoutPending={isCheckoutPending}
              key={plan.id}
              onSelect={() => selectPlan(plan)}
              plan={plan}
            />
          ))}
        </View>
      </View>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={140}
        contentContainerStyle={{ paddingBottom: 40 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={<QueryRefreshControl />}
        testID="subscription-scroll"
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
      title={SUBSCRIPTION_SCREEN_COPY.title}
    >
      <SubscriptionPlanContent {...props} presentation="sheet" />
    </Modal>
  )
})

SubscriptionPlanSheet.displayName = "SubscriptionPlanSheet"
