import { NativeStockOriginalScreen } from "@/components/mobile/assistant/native-stock-original-screen"
import { nativeStockOriginalParam } from "@/components/mobile/assistant/native-stock-state"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function StockTransferRoute() {
  const { transferId } = useLocalSearchParams<{
    transferId: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Stock transfer"
      closeLabel="Back to the assistant"
    >
      <NativeStockOriginalScreen
        original={nativeStockOriginalParam("stock_transfer", transferId)}
      />
    </WorkflowModalScreen>
  )
}
