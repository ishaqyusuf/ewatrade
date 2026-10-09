import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import type { IconKeys } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
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
import { ActionButton } from "./action-button"
import { ListCard, RecordRow } from "./green-till/kit"
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

export function SubscriptionPlanContent({
  presentation = "sheet",
}: SubscriptionPlanContentProps) {
  const trpc = useTRPC()
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
  const content = (
    <View className="gap-4 px-[18px] pb-6">
      <SettingsScreen
        loading={subscriptionQuery.isPending && !isOfflineMode}
        title={verified?.plan.name ?? "Plan unavailable"}
        sub={
          verified
            ? `${subscriptionStatusLabel(verified.subscription.status)} · ${verified.plan.supportLabel}`
            : "Connect to load your plan and limits."
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
        {verified ? (
          <ListCard>
            {verified.entitlements.map((entitlement) => (
              <RecordRow
                stackDetails
                key={entitlement.key}
                title={entitlementCopy(entitlement.key).title}
                meta={
                  entitlement.key === "reportsHistoryDays"
                    ? "How far back reports go"
                    : entitlement.isAtLimit
                      ? "Plan limit reached"
                      : "Current usage"
                }
                amount={
                  entitlement.key === "reportsHistoryDays"
                    ? entitlement.limit === null
                      ? "No limit"
                      : `${entitlement.limit} days`
                    : getSubscriptionUsagePresentation(
                        entitlement.used,
                        entitlement.limit,
                      ).valueLabel
                }
                avatar={{
                  icon: entitlementCopy(entitlement.key).icon,
                  tint:
                    entitlement.isAtLimit &&
                    entitlement.key !== "reportsHistoryDays"
                      ? "amber"
                      : "mint",
                }}
              />
            ))}
          </ListCard>
        ) : null}
        <Text className="text-sm text-muted-foreground">
          Need more room? Contact support to discuss a plan change.
        </Text>
        {supportUrl ? (
          <ActionButton
            variant="outline"
            onPress={() => void Linking.openURL(supportUrl)}
          >
            Contact support
          </ActionButton>
        ) : null}
      </SettingsScreen>
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
