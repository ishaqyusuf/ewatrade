import { FinanceBankDetailsScreen } from "@/components/mobile/finance/finance-bank-details-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceBankDetailsRoute() {
  const { accountId } = useLocalSearchParams<{ accountId?: string }>()
  return (
    <WorkflowModalScreen
      back
      title={accountId ? "Edit bank details" : "Add bank account"}
      closeLabel="Close bank details"
      closeHref="/finance-accounts-modal"
    >
      <FinanceBankDetailsScreen accountId={accountId} />
    </WorkflowModalScreen>
  )
}
