import { FinanceBankStatementScreen } from "@/components/mobile/finance/finance-bank-statement-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"
export default function FinanceBankStatementRoute() {
  const { statementId, accountId } = useLocalSearchParams<{
    statementId: string
    accountId: string
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Bank statement"
      closeLabel="Back to bank statements"
      closeHref="/finance-bank-modal"
    >
      <FinanceBankStatementScreen
        statementId={statementId ?? ""}
        accountId={accountId ?? ""}
      />
    </WorkflowModalScreen>
  )
}
