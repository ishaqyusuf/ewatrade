import { ReceiptApprovalScreen } from "@/components/mobile/assistant/receipt-approval-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function ReceiptApprovalRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  return (
    <WorkflowModalScreen
      back
      closeHref="/admin-home"
      title="Receipt to approve"
      closeLabel="Close receipt approval"
    >
      <ReceiptApprovalScreen key={id} id={id} />
    </WorkflowModalScreen>
  )
}
