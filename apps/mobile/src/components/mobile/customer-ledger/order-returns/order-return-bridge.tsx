import { ActionButton } from "@/components/mobile/action-button"
import { errorCode } from "@/components/mobile/payment-links/payment-link-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { orderReturnRoute } from "./order-return-model"

/** The existing sheet hands off only a known credit-funded Order. */
export function OrderReturnBridge(props: {
  orderId: string
  ask: boolean
  ordinary: ReactNode
  onBack: () => void
  onCloseSheet: () => void
}) {
  const { profile } = useAuthContext()
  if (
    props.ask ||
    !profile?.businessId ||
    !["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
  )
    return props.ordinary
  return (
    <CurrentBridge
      key={`${profile.id}:${profile.businessId}:${props.orderId}`}
      {...props}
    />
  )
}

function CurrentBridge({
  orderId,
  ordinary,
  onBack,
  onCloseSheet,
}: Parameters<typeof OrderReturnBridge>[0]) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [ordinaryChosen, setOrdinaryChosen] = useState(false)
  const query = useQuery(
    trpc.customerLedger.orderReturnReview.queryOptions(
      { orderId },
      {
        enabled: !offline,
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
      },
    ),
  )
  const route = orderReturnRoute({
    ask: false,
    allowed: true,
    status: query.status,
    forbidden: errorCode(query.error) === "FORBIDDEN",
    fetchedAfterMount: query.isFetchedAfterMount,
    data: query.data,
  })
  if (!offline && (ordinaryChosen || route.kind === "ordinary")) return ordinary
  return (
    <View className="gap-4 px-5 py-4">
      {offline ? (
        <StatusBanner
          message="Reconnect to review original payment sources."
          tone="warning"
        />
      ) : route.kind === "loading" ? (
        <Text accessibilityRole="progressbar">
          Checking how this Order was paid…
        </Text>
      ) : route.kind === "error" ? (
        <StatusBanner
          message="The Order’s original payment sources couldn’t load."
          actionLabel="Try again"
          actionDisabled={query.isFetching}
          onActionPress={() => void query.refetch()}
          tone="warning"
        />
      ) : route.kind === "unavailable" ? (
        <StatusBanner message={route.message} tone="warning" />
      ) : route.kind === "sources" ? (
        <>
          <StatusBanner
            title="Review original payment sources"
            message="This Order used customer credit. Restore it to the original source and record only money actually paid back as cash."
            tone="primary"
          />
          <ActionButton
            onPress={() => {
              onCloseSheet()
              router.push({
                pathname: "/order-return/[orderId]",
                params: { orderId },
              })
            }}
          >
            Review credit and cash return
          </ActionButton>
          <ActionButton
            variant="outline"
            onPress={() => setOrdinaryChosen(true)}
          >
            Price was wrong? Adjust the refund
          </ActionButton>
        </>
      ) : null}
      <ActionButton variant="outline" onPress={onBack}>
        Back
      </ActionButton>
    </View>
  )
}
