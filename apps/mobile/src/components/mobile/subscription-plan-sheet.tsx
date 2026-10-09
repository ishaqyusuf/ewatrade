import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useBusinessStore } from "@/store/businessStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import {
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsSubscription,
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useQuery } from "@tanstack/react-query"
import { forwardRef } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import {
  SUBSCRIPTION_SCREEN_COPY,
  getSubscriptionStatusTone,
  getSubscriptionTermLabel,
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
    limit: number | null
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
    ordersThisMonth: number
    products: number
    staff: number
  }
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

export function SubscriptionPlanContent({
  presentation = "sheet",
  usage,
}: SubscriptionPlanContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode)
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
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
  const usageSnapshot = shouldUseProductionSnapshot
    ? productionSnapshot.usage
    : usage
  const sourceLabel = isOfflineMode
    ? "Local"
    : subscriptionQuery.isError
      ? "Local fallback"
      : subscriptionQuery.isFetching
        ? "Refreshing"
        : "Online"
  const sourceDetail = isOfflineMode
    ? "Saved plan details are shown while this device is offline."
    : subscriptionQuery.isError
      ? "Plan details could not refresh. Saved information is shown."
      : subscriptionQuery.isFetching
        ? "Refreshing your plan and usage."
        : "Your current plan and limits are up to date."
  const shouldShowSourceNotice =
    sourceLabel !== "Online" && sourceLabel !== "Refreshing"
  const offlineDeviceUsage = shouldUseProductionSnapshot
    ? productionSnapshot.usage.offlineDevices
    : null
  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
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

      <View className="flex-row items-center gap-3 border-y border-border py-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
            Current plan
          </Text>
          <Text className="text-xl font-extrabold tracking-tight text-foreground">
            {currentPlan.name}
          </Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {getSubscriptionTermLabel(subscription, currentPlan, formatDate)} ·{" "}
            {currentPlan.supportLabel}
          </Text>
        </View>
        <StatusBadge
          label={subscriptionStatusLabel(subscription.status)}
          tone={getSubscriptionStatusTone(subscription.status)}
        />
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
