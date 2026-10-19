import { NativeCashOriginalScreen } from "@/components/mobile/assistant/native-cash-original-screen"
import { readNativeCashOriginalParams } from "@/components/mobile/assistant/native-cash-target"
import { FinanceCountScreen } from "@/components/mobile/finance/finance-count-screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceCountRoute() {
  const { countId, bookId } = useLocalSearchParams<{
    countId: string | string[]
    bookId?: string | string[]
  }>()
  const target = readNativeCashOriginalParams(bookId, countId)
  return (
    <WorkflowModalScreen
      back
      title="Cash count"
      closeLabel={
        bookId !== undefined ? "Back to the assistant" : "Back to cash counts"
      }
      closeHref="/finance-counts-modal"
    >
      {bookId !== undefined ? (
        target ? (
          <NativeCashOriginalScreen
            bookId={target.bookId}
            countId={target.countId}
          />
        ) : (
          <StatusBanner
            title="Invalid cash count link"
            message="Go back and open the exact saved count again."
            tone="warning"
          />
        )
      ) : typeof countId === "string" ? (
        <FinanceCountScreen countId={countId} />
      ) : (
        <StatusBanner
          title="Invalid cash count link"
          message="Choose one exact cash count."
          tone="warning"
        />
      )}
    </WorkflowModalScreen>
  )
}
