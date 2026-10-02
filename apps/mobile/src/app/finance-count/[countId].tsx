import { FinanceCountScreen } from "@/components/mobile/finance/finance-count-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceCountRoute() {
  const { countId } = useLocalSearchParams<{ countId: string }>()
  return (
    <WorkflowModalScreen
      title="Count and investigate"
      closeLabel="Close cash count"
      closeHref="/finance-counts-modal"
    >
      <FinanceCountScreen countId={countId} />
    </WorkflowModalScreen>
  )
}
