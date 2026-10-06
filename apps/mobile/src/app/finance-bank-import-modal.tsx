import { FinanceBankImportScreen } from "@/components/mobile/finance/finance-bank-import-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"
export default function FinanceBankImportRoute() {
  const { accountId } = useLocalSearchParams<{ accountId?: string }>()
  return (
    <WorkflowModalScreen
      title="Import bank statement"
      closeLabel="Close bank import"
      closeHref="/finance-accounts-modal"
      hideHeader
    >
      <FinanceBankImportScreen accountId={accountId} />
    </WorkflowModalScreen>
  )
}
