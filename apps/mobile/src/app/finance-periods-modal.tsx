import { readNativeDayReviewTarget } from "@/components/mobile/assistant/native-cash-target"
import { NativeDayReviewScreen } from "@/components/mobile/assistant/native-day-review-screen"
import { FinancePeriodsScreen } from "@/components/mobile/finance/finance-period-screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinancePeriodsRoute() {
  const { target: raw } = useLocalSearchParams<{ target?: string | string[] }>()
  if (raw !== undefined) {
    const target = readNativeDayReviewTarget(raw)
    return (
      <WorkflowModalScreen
        back
        title="Day review"
        closeLabel="Back to the assistant"
        closeHref="/finance-modal"
      >
        {target ? (
          <NativeDayReviewScreen
            bookId={target.bookId}
            through={target.through}
          />
        ) : (
          <StatusBanner
            title="Invalid day review link"
            message="Go back and open the exact day review again."
            tone="warning"
          />
        )}
      </WorkflowModalScreen>
    )
  }
  return (
    <WorkflowModalScreen
      title="Posting periods"
      closeLabel="Close posting periods"
      closeHref="/finance-modal"
    >
      <FinancePeriodsScreen />
    </WorkflowModalScreen>
  )
}
