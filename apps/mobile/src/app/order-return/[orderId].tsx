import { OrderReturnScreen } from "@/components/mobile/customer-ledger/order-returns/order-return-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { Stack, useLocalSearchParams } from "expo-router"

export default function OrderReturnRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WorkflowModalScreen
        back
        title="Refund"
        closeLabel="Back to Order"
        closeHref="/finance-modal"
      >
        <OrderReturnScreen orderId={orderId ?? ""} />
      </WorkflowModalScreen>
    </>
  )
}
