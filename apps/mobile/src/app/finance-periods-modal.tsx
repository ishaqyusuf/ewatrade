import { FinancePeriodsScreen } from "@/components/mobile/finance/finance-period-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function FinancePeriodsRoute() {
  return (
    <WorkflowModalScreen
      title="Posting periods"
      closeLabel="Close posting periods"
      closeHref="/finance-modal"
    >
      <FinancePeriodsScreen />
    </WorkflowModalScreen>
  )
}
