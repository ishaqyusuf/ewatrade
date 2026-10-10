import { FinanceCountScreen } from "@/components/mobile/finance/finance-count-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceCountRoute() {
  const { countId } = useLocalSearchParams<{ countId: string }>()
  return (
    <WorkflowModalScreen
      back
      title="Cash count"
      closeLabel="Back to cash counts"
      closeHref="/finance-counts-modal"
    >
      <FinanceCountScreen countId={countId} />
    </WorkflowModalScreen>
  )
}
