import { ReturnablesScreen } from "@/components/mobile/returnables/returnables-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function ReturnablesRoute() {
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      closeLabel="Close returnables"
      title="Returnables"
    >
      <ReturnablesScreen />
    </WorkflowModalScreen>
  )
}
