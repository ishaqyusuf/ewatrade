import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import type { IconKeys } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import type {
  RetailOpsPlan,
  RetailOpsPlanId,
  RetailOpsSubscription,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useQuery } from "@tanstack/react-query"
import { forwardRef } from "react"
import { Linking } from "react-native"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "./action-button"
import {
  ListCard,
  RecordRow,
  SectionHeader,
  StatusPill,
} from "./green-till/kit"
import { SettingsScreen } from "./settings-screen"
import {
  SUBSCRIPTION_SCREEN_COPY,
  getSubscriptionUsagePresentation,
} from "./subscription-plan-presentation"

type SubscriptionPlanSheetProps = {
  usage?: {
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

function subscriptionStatusLabel(status: RetailOpsSubscription["status"]) {
  if (status === "trialing") return "Trial"
  if (status === "past_due") return "Past due"
  if (status === "cancelled") return "Cancelled"
  return "Active"
}

const ENTITLEMENT_COPY: Record<string, { icon: IconKeys; title: string }> = {
  businesses: { icon: "Building2", title: "Businesses" },
  offlineDevices: { icon: "WifiOff", title: "Offline devices" },
  ordersPerMonth: { icon: "ReceiptText", title: "Orders this month" },
  products: { icon: "Package", title: "Products" },
  reportsHistoryDays: { icon: "Clock", title: "Report history" },
  staff: { icon: "Users", title: "Staff" },
}

/** Readable name for a plan limit; unknown keys become "Some limit". */
function entitlementCopy(key: string) {
  const known = ENTITLEMENT_COPY[key]
  if (known) return known
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  return {
    icon: "Building2" as IconKeys,
    title: words.charAt(0).toUpperCase() + words.slice(1),
  }
}

const USAGE_ORDER = [
  "products",
  "staff",
  "businesses",
  "offlineDevices",
  "ordersPerMonth",
] as const

function planLimitsLine(plan: RetailOpsPlan) {
  const { businesses, products, staff } = plan.limits
  const part = (value: number | null, one: string, many: string) =>
    value === null
      ? `unlimited ${many}`
      : `${value} ${value === 1 ? one : many}`
  return [
    part(products, "product", "products"),
    part(staff, "staff", "staff"),
    part(businesses, "business", "businesses"),
  ].join(" · ")
}

/** One usage line: count of limit with a bar; amber at the limit. */
function UsageRow({
  title,
  used,
  limit,
  atLimit,
}: { title: string; used: number; limit: number | null; atLimit: boolean }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  const percent =
    limit === null || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100)
  return (
    <View className="gap-2 py-2.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
          {title}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {limit === null ? `${used} · no limit` : `${used} of ${limit}`}
        </Text>
      </View>
      {limit === null ? null : (
        <View
          style={{
            backgroundColor: colors.muted,
            borderRadius: 999,
            height: 6,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              backgroundColor: atLimit
                ? palette.amberForeground
                : colors.primary,
              borderRadius: 999,
              height: 6,
              width: `${Math.max(percent, used > 0 ? 4 : 0)}%`,
            }}
          />
        </View>
      )}
    </View>
  )
}

export function SubscriptionPlanContent({
  presentation = "sheet",
}: SubscriptionPlanContentProps) {
  const trpc = useTRPC()
  const insets = useSafeAreaInsets()
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode)
  const subscriptionQuery = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled: !isOfflineMode,
      retry: false,
    }),
  )
  const productionSnapshot = subscriptionQuery.data as
    | ProductionSubscriptionSnapshot
    | undefined
  const verified = productionSnapshot
  const supportUrl = publicLegalUrl("support")
  const plans = verified?.plans.filter((plan) => plan.id !== "free") ?? []
  const currentIndex = plans.findIndex((plan) => plan.id === verified?.plan.id)
  const nextPlan = currentIndex >= 0 ? plans[currentIndex + 1] : undefined
  const freePlan = verified?.plans.find((plan) => plan.id === "free")
  const order: readonly string[] = USAGE_ORDER
  const limits = verified ? verified.entitlements.map((e) => e) : []
  const usage = limits
    .filter((entitlement) => order.includes(entitlement.key))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  const historyDays = verified?.plan.limits.reportsHistoryDays
  const request = () => {
    if (supportUrl) void Linking.openURL(supportUrl)
  }
  const content = (
    <View className="gap-4 px-[18px] pb-6">
      <SettingsScreen
        loading={subscriptionQuery.isPending && !isOfflineMode}
        label={verified ? "Current plan" : undefined}
        pill={
          verified
            ? {
                label: subscriptionStatusLabel(verified.subscription.status),
                tone:
                  verified.subscription.status === "active" ||
                  verified.subscription.status === "trialing"
                    ? "synced"
                    : "draft",
              }
            : undefined
        }
        title={verified?.plan.name ?? "Plan unavailable"}
        sub={
          verified
            ? `${verified.plan.priceLabel} · ${verified.plan.supportLabel}`
            : "Connect to load your plan and limits."
        }
        stats={
          verified
            ? [
                {
                  label: "Price",
                  // "Free during launch" is too long for a stat column.
                  value: /^free/i.test(verified.plan.priceLabel)
                    ? "Free"
                    : verified.plan.priceLabel,
                },
                {
                  label: "Support",
                  value: verified.plan.supportLabel.replace(/ support$/i, ""),
                },
                {
                  label: "History",
                  value:
                    historyDays === null || historyDays === undefined
                      ? "No limit"
                      : `${historyDays} days`,
                },
              ]
            : undefined
        }
      >
        {isOfflineMode || subscriptionQuery.isError ? (
          <StatusBanner
            title={isOfflineMode ? "Offline plan" : "Plan could not refresh"}
            tone="warning"
            actionLabel={isOfflineMode ? undefined : "Try again"}
            onActionPress={() => void subscriptionQuery.refetch()}
            message={
              verified
                ? `Saved plan · as of ${new Date(subscriptionQuery.dataUpdatedAt).toLocaleString()}`
                : "Current plan and usage are unavailable."
            }
          />
        ) : null}
        {usage.length ? (
          <View>
            <SectionHeader title="Usage" />
            <View className="rounded-[20px] bg-card px-3.5 py-1.5 shadow-sm">
              {usage.map((entitlement) => (
                <UsageRow
                  key={entitlement.key}
                  title={entitlementCopy(entitlement.key).title}
                  used={entitlement.used}
                  limit={entitlement.limit}
                  atLimit={entitlement.isAtLimit}
                />
              ))}
            </View>
          </View>
        ) : null}
        {plans.length ? (
          <View>
            <SectionHeader title="Plans" />
            <ListCard>
              {plans.map((plan) => {
                const current = plan.id === verified?.plan.id
                return (
                  <RecordRow
                    stackDetails
                    key={plan.id}
                    title={plan.name}
                    meta={planLimitsLine(plan)}
                    avatar={{ icon: "Star", tint: current ? "mint" : "lilac" }}
                    status={
                      current ? (
                        <StatusPill label="Current" tone="ok" />
                      ) : supportUrl ? (
                        <StatusPill label="Request" tone="muted" />
                      ) : undefined
                    }
                    onPress={!current && supportUrl ? request : undefined}
                  />
                )
              })}
            </ListCard>
            <Text className="mt-2.5 px-0.5 text-xs text-muted-foreground">
              Paid plans are free during launch.
              {freePlan
                ? ` Free plan: ${freePlan.limits.products} products, ${freePlan.limits.ordersPerMonth} orders a month.`
                : ""}
              {supportUrl ? "" : " Contact support to change plan."}
            </Text>
          </View>
        ) : null}
      </SettingsScreen>
    </View>
  )
  const pinned =
    nextPlan && supportUrl && !isOfflineMode ? (
      <View className="border-t border-border bg-background px-[18px] pt-3">
        <ActionButton icon="ArrowUp" onPress={request}>
          {`Request ${nextPlan.name}`}
        </ActionButton>
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      </View>
    ) : null

  if (presentation === "screen") {
    return (
      <View className="flex-1">
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
        {pinned}
      </View>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={112}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
      {pinned}
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
