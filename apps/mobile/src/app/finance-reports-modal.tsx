import { FinanceReportsScreen } from "@/components/mobile/finance-reports/finance-reports-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function FinanceReportsRoute() {
  return (
    <WorkflowModalScreen
      title="Financial reports"
      closeLabel="Close financial reports"
      closeHref="/finance-modal"
    >
      <FinanceReportsScreen />
    </WorkflowModalScreen>
  )
}
