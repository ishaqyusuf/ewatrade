import { NativeStockOriginalScreen } from "@/components/mobile/assistant/native-stock-original-screen"
import { nativeStockOriginalParam } from "@/components/mobile/assistant/native-stock-state"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function StockCountRoute() {
  const { stockCountId } = useLocalSearchParams<{
    stockCountId: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Stock count"
      closeLabel="Back to the assistant"
    >
      <NativeStockOriginalScreen
        original={nativeStockOriginalParam("stock_count", stockCountId)}
      />
    </WorkflowModalScreen>
  )
}
