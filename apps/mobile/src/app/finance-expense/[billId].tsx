import { FinanceExpenseScreen } from "@/components/mobile/finance/finance-expense-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceExpenseRoute() {
  const { billId } = useLocalSearchParams<{ billId: string }>()
  return (
    <WorkflowModalScreen
      title="Expense"
      closeLabel="Back to spending"
      closeHref="/finance-modal"
    >
      <FinanceExpenseScreen billId={billId ?? ""} />
    </WorkflowModalScreen>
  )
}
