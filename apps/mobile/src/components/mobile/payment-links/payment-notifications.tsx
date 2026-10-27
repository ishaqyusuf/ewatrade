import { ActionButton } from "@/components/mobile/action-button"
import { NudgeCard, SectionHeader } from "@/components/mobile/green-till/kit"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { Fragment } from "react"
import { ageLabel, paymentNotificationText } from "./payment-link-model"
import { usePaymentScreenActive } from "./use-payment-screen-active"

const PREVIEW_LIMIT = 3

function usePendingReports(limit: number) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const isScreenActive = usePaymentScreenActive()
  const query = useQuery(
    trpc.businessBanking.pendingReports.queryOptions(
      { limit },
      {
        enabled: isScreenActive && !offline,
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        refetchInterval: isScreenActive && !offline ? 30_000 : false,
      },
    ),
  )
  return { ...query, visible: isScreenActive && !offline && query.isSuccess }
}

/**
 * Updates for customers who tapped I have paid: Open goes to the order,
 * Evaluate to the review. Renders nothing when there is nothing to check.
 */
export function PaymentNotificationsSection() {
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const pending = usePendingReports(PREVIEW_LIMIT)
  const items = pending.visible ? (pending.data?.items ?? []) : []
  if (!items.length) return null
  return (
    <View>
      <SectionHeader
        actionLabel="See all"
        onAction={() => router.push("/payments-to-check-modal" as Href)}
        title="Payments to check"
      />
      <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <View className="h-px bg-border" /> : null}
            <View className="flex-row gap-3 py-3">
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: palette.amber,
                  borderRadius: 19,
                  height: 38,
                  justifyContent: "center",
                  width: 38,
                }}
              >
                <Icon
                  className="size-[18px]"
                  color={palette.amberForeground}
                  name="Building2"
                />
              </View>
              <View className="min-w-0 flex-1 gap-2">
                <View>
                  <Text className="text-sm font-bold text-foreground">
                    {paymentNotificationText(item)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {ageLabel(item.submittedAt ?? new Date())} · not recorded
                    yet
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <ActionButton
                      variant="outline"
                      onPress={() =>
                        router.push(
                          `/order/${encodeURIComponent(item.orderId)}` as never,
                        )
                      }
                    >
                      Open
                    </ActionButton>
                  </View>
                  <View className="flex-1">
                    <ActionButton
                      onPress={() =>
                        router.push({
                          pathname: "/payment-report/[reportId]",
                          params: { reportId: item.id },
                        } as Href)
                      }
                    >
                      Evaluate
                    </ActionButton>
                  </View>
                </View>
              </View>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  )
}

/** Finance entry to the Payments to check list, with the waiting count. */
export function PaymentsToCheckNudge() {
  const router = useRouter()
  const pending = usePendingReports(20)
  const count = pending.visible ? (pending.data?.items.length ?? 0) : 0
  const more = pending.visible && Boolean(pending.data?.nextCursor)
  return (
    <NudgeCard
      actionLabel="Open"
      icon="Building2"
      onAction={() => router.push("/payments-to-check-modal" as Href)}
      sub={
        !pending.visible
          ? "Customers who say they paid by transfer"
          : count
            ? `${count}${more ? "+" : ""} waiting · check your bank, then confirm`
            : "Nothing waiting right now"
      }
      tint={count ? "amber" : "sky"}
      title="Payments to check"
    />
  )
}
