import { FinanceBankSourceScreen } from "@/components/mobile/finance/finance-bank-source-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"
export default function FinanceBankSourceRoute() {
  const { entryId, accountId } = useLocalSearchParams<{
    entryId: string
    accountId: string
  }>()
  return (
    <WorkflowModalScreen
      title="Original posted source"
      closeLabel="Close posted source"
      closeHref="/finance-bank-modal"
    >
      <FinanceBankSourceScreen
        entryId={entryId ?? ""}
        accountId={accountId ?? ""}
      />
    </WorkflowModalScreen>
  )
}
