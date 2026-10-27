import { PaymentReportScreen } from "@/components/mobile/payment-links/payment-report-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { useLocalSearchParams } from "expo-router"

export default function PaymentReportRoute() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>()
  const { profile } = useAuthContext()
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      title="Check payment"
      closeLabel="Close payment review"
    >
      <PaymentReportScreen
        key={`${profile?.id}:${profile?.businessId}:${profile?.storeId}:${reportId}`}
        reportId={reportId ?? ""}
      />
    </WorkflowModalScreen>
  )
}
