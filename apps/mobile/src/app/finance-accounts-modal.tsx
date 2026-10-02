import { FinanceAccountsScreen } from "@/components/mobile/finance/finance-accounts-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function FinanceAccountsRoute() {
  return (
    <WorkflowModalScreen
      title="Money accounts"
      closeLabel="Close money accounts"
      closeHref="/finance-modal"
    >
      <FinanceAccountsScreen />
    </WorkflowModalScreen>
  )
}
