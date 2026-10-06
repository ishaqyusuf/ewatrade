import { FinanceBankStatementsScreen } from "@/components/mobile/finance/finance-bank-statements-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"
export default function FinanceBankRoute() {
  const { accountId, imported } = useLocalSearchParams<{
    accountId?: string
    imported?: string
  }>()
  return (
    <WorkflowModalScreen
      title="Bank statements"
      closeLabel="Close bank statements"
      closeHref="/finance-accounts-modal"
    >
      <FinanceBankStatementsScreen
        accountId={accountId}
        imported={imported === "1"}
      />
    </WorkflowModalScreen>
  )
}
