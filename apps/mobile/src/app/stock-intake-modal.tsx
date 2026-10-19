import {
  StockIntakeChrome,
  StockIntakeContent,
} from "@/components/mobile/stock-intake/stock-intake-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { parseStockIntakeTarget } from "@/lib/stock-intake-target"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { useLocalSearchParams } from "expo-router"

export default function StockIntakeModalRoute() {
  const params = useLocalSearchParams()
  const target = parseStockIntakeTarget({
    balanceSourceId: params.balanceSourceId,
    catalogItemId: params.catalogItemId,
    inventoryUnitId: params.inventoryUnitId,
    storeId: params.storeId,
    variantId: params.variantId,
  })
  const recordUse = params.mode === "use"

  return (
    // iOS presents this route natively above the root, so its balance chooser
    // and review sheets host here; the root sheet host would sit behind it.
    <BottomSheetModalProvider>
      <WorkflowModalScreen
        chrome={StockIntakeChrome}
        closeLabel={recordUse ? "Close record use" : "Close stock intake"}
        title={recordUse ? "Record use" : "Record stock"}
      >
        {/* Remount per target so no selection or review follows a new request. */}
        <StockIntakeContent
          key={`${JSON.stringify(target)}:${recordUse}`}
          presentation="screen"
          recordUse={recordUse}
          target={target}
        />
      </WorkflowModalScreen>
    </BottomSheetModalProvider>
  )
}
