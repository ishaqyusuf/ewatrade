import { FinanceMovementScreen } from "@/components/mobile/finance/finance-movement-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceMovementRoute() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>()
  return (
    <WorkflowModalScreen
      back
      title="Money movement"
      closeLabel="Back"
      closeHref="/finance-accounts-modal"
    >
      <FinanceMovementScreen entryId={entryId} />
    </WorkflowModalScreen>
  )
}
