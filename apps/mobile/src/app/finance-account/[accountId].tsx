import { FinanceAccountScreen } from "@/components/mobile/finance/finance-account-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceAccountRoute() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>()
  return (
    <WorkflowModalScreen
      title="Statement"
      closeLabel="Close statement"
      closeHref="/finance-accounts-modal"
    >
      <FinanceAccountScreen accountId={accountId} />
    </WorkflowModalScreen>
  )
}
