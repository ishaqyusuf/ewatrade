import { NativeStockOriginalScreen } from "@/components/mobile/assistant/native-stock-original-screen"
import { nativeStockOriginalParam } from "@/components/mobile/assistant/native-stock-state"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function StockOperationRoute() {
  const { operationId } = useLocalSearchParams<{
    operationId: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Stock operation"
      closeLabel="Back to the assistant"
    >
      <NativeStockOriginalScreen
        original={nativeStockOriginalParam("stock_operation", operationId)}
      />
    </WorkflowModalScreen>
  )
}
