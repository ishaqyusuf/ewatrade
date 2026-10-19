import { FinanceMovementScreen } from "@/components/mobile/finance/finance-movement-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceMovementRoute() {
  const { entryId, bookId } = useLocalSearchParams<{
    entryId: string
    bookId?: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Money movement"
      closeLabel="Back"
      closeHref="/finance-accounts-modal"
    >
      <FinanceMovementScreen
        entryId={entryId}
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
