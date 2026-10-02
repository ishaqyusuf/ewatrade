import { FinanceScreen } from "@/components/mobile/finance/finance-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function FinanceModalRoute() {
  return (
    <WorkflowModalScreen
      closeLabel="Close spending"
      title="Spending"
      closeHref="/admin-home"
    >
      <FinanceScreen />
    </WorkflowModalScreen>
  )
}
