import { ActionButton } from "@/components/mobile/action-button"
import { usePaymentScreenActive } from "@/components/mobile/payment-links/use-payment-screen-active"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import {
  canSeeOrderCustomerCredit,
  orderCustomerCreditView,
} from "./order-customer-credit-model"

/**
 * The Order customer's available credit (holds already taken off by the
 * server). Owners and admins only; read while the Order is on screen.
 */
export function OrderCustomerCredit({ orderId }: { orderId: string }) {
  const router = useRouter()
  const trpc = useTRPC()
  const allowed = canSeeOrderCustomerCredit(useAuthContext().profile?.role)
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const active = usePaymentScreenActive()
  const funds = useQuery(
    trpc.businessBanking.orderCustomerFunds.queryOptions(
      { orderId },
      {
        enabled: allowed && !offline && active,
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
      },
    ),
  )
  const view = orderCustomerCreditView({
    allowed,
    offline,
    status: funds.status,
    data: funds.data,
  })
  if (view.kind === "hidden") return null
  if (view.kind === "loading")
    return (
      <SkeletonGroup accessibilityLabel="Checking customer credit">
        <Skeleton className="h-14 w-full rounded-[20px]" />
      </SkeletonGroup>
    )
  if (view.kind === "offline")
    return (
      <Text className="text-xs text-muted-foreground">
        Customer credit is checked when you're back online.
      </Text>
    )
  if (view.kind === "error" || view.kind === "unavailable")
    return (
      <StatusBanner
        actionDisabled={funds.isFetching}
        actionLabel="Try again"
        icon="AlertCircle"
        message="Customer credit couldn't be checked. Nothing has changed."
        onActionPress={() => void funds.refetch()}
        tone="warning"
      />
    )
  return (
    <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm text-muted-foreground">
            Credit with this business
          </Text>
          {view.reserved ? (
            <Text className="text-xs text-muted-foreground">
              {`${view.reserved} more is held for refunds`}
            </Text>
          ) : null}
        </View>
        <Text
          className="text-base font-extrabold tabular-nums text-foreground"
          selectable
        >
          {view.available}
        </Text>
      </View>
      <ActionButton
        icon="ArrowRight"
        variant="outline"
        onPress={() =>
          router.push({
            pathname: "/customer-ledger-action/[accountId]",
            params: { accountId: view.accountId, mode: "apply" },
          })
        }
      >
        Use credit
      </ActionButton>
    </View>
  )
}
