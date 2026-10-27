import { PaymentLinkScreen } from "@/components/mobile/payment-links/payment-link-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { useLocalSearchParams } from "expo-router"

export default function PaymentLinkRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const { profile } = useAuthContext()
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      title="Payment link"
      closeLabel="Close payment link"
    >
      <PaymentLinkScreen
        key={`${profile?.id}:${profile?.businessId}:${profile?.storeId}:${orderId}`}
        orderId={orderId ?? ""}
      />
    </WorkflowModalScreen>
  )
}
