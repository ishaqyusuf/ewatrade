import { PaymentsToCheckScreen } from "@/components/mobile/payment-links/payments-to-check-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useAuthContext } from "@/hooks/use-auth"

export default function PaymentsToCheckRoute() {
  const { profile } = useAuthContext()
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      title="Payments to check"
      closeLabel="Close payments to check"
    >
      <PaymentsToCheckScreen
        key={`${profile?.id}:${profile?.businessId}:${profile?.storeId}`}
      />
    </WorkflowModalScreen>
  )
}
