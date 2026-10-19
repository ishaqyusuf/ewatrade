import { NativeStockOriginalScreen } from "@/components/mobile/assistant/native-stock-original-screen"
import { nativeStockOriginalParam } from "@/components/mobile/assistant/native-stock-state"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function InventoryCloseoutRoute() {
  const { closeoutId } = useLocalSearchParams<{
    closeoutId: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title="Custody closeout"
      closeLabel="Back to the assistant"
    >
      <NativeStockOriginalScreen
        original={nativeStockOriginalParam("inventory_closeout", closeoutId)}
      />
    </WorkflowModalScreen>
  )
}
