import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { usePaymentScreenActive } from "@/components/mobile/payment-links/use-payment-screen-active"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { CustomerLedgerGate } from "../customer-ledger-gate"
import { OrderReturnForm } from "./order-return-form"
import {
  type AvailableOrderReturn,
  orderReturnIdentity,
  orderReturnRoute,
} from "./order-return-model"

/** The route's existing workflow shell owns the header and keyboard. */
export function OrderReturnScreen({ orderId }: { orderId: string }) {
  return (
    <CustomerLedgerGate>
      {(scope) => (
        <CurrentReturn
          key={`${scope.actorUserId}:${scope.tenantId}:${orderId}`}
          {...scope}
          orderId={orderId}
        />
      )}
    </CustomerLedgerGate>
  )
}

function CurrentReturn(props: {
  actorUserId: string
  tenantId: string
  orderId: string
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const active = usePaymentScreenActive()
  const [pinned, setPinned] = useState<AvailableOrderReturn | null>(null)
  const query = useQuery(
    trpc.customerLedger.orderReturnReview.queryOptions(
      { orderId: props.orderId },
      {
        enabled: active && !offline && !pinned && Boolean(props.orderId),
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
    forbidden: false,
    fetchedAfterMount: query.isFetchedAfterMount,
    data: query.data,
  })
  if (pinned || (!offline && active && route.kind === "sources")) {
    const review = pinned ?? (route.kind === "sources" ? route.review : null)
    if (review)
      return (
        <OrderReturnForm
          key={orderReturnIdentity(review)}
          {...props}
          active={active}
          review={review}
          onPin={() => setPinned(review)}
          onRefresh={() => {
            setPinned(null)
            void query.refetch()
          }}
        />
      )
  }
  return (
    <FinanceFormBody>
      {offline ? (
        <StatusBanner
          message="Reconnect to review and return customer funds."
          tone="warning"
        />
      ) : !active || route.kind === "loading" ? (
        <Text accessibilityRole="progressbar">
          Checking original payment sources…
        </Text>
      ) : route.kind === "unavailable" ? (
        <StatusBanner message={route.message} tone="warning" />
      ) : route.kind === "ordinary" ? (
        <StatusBanner message="There is no held credit to restore on this Order. Go back to the Order’s Refund action for an ordinary money return." />
      ) : (
        <StatusBanner
          title="Payment sources unavailable"
          message={
            query.error?.message ?? "Try reviewing the original sources again."
          }
          tone="warning"
          actionLabel="Try again"
          actionDisabled={query.isFetching}
          onActionPress={() => void query.refetch()}
        />
      )}
    </FinanceFormBody>
  )
}
