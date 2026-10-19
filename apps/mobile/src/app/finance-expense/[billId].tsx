import { FinanceExpenseScreen } from "@/components/mobile/finance/finance-expense-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceExpenseRoute() {
  const { billId, bookId } = useLocalSearchParams<{
    billId: string
    bookId?: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Expense"
      closeLabel="Back to spending"
      closeHref="/finance-modal"
    >
      <FinanceExpenseScreen
        billId={billId ?? ""}
        expectedBookId={
          bookId === undefined
            ? undefined
            : typeof bookId === "string"
              ? bookId
              : ""
        }
      />
    </WorkflowModalScreen>
  )
}
