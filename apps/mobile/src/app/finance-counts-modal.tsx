import { FinanceCountsScreen } from "@/components/mobile/finance/finance-counts-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function FinanceCountsRoute() {
  return (
    <WorkflowModalScreen
      title="Cash counts"
      closeLabel="Close cash counts"
      closeHref="/finance-accounts-modal"
    >
      <FinanceCountsScreen />
    </WorkflowModalScreen>
  )
}
