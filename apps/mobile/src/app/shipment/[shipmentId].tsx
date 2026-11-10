import { ShipmentScreen } from "@/components/mobile/shipments/shipment-screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function ShipmentRoute() {
  const { shipmentId } = useLocalSearchParams<{
    shipmentId: string | string[]
  }>()
  return (
    <WorkflowModalScreen
      back
      title={shipmentId === "new" ? "New shipment" : "Shipment"}
      closeLabel="Back to shipments"
      closeHref="/shipments-modal"
    >
      {typeof shipmentId === "string" ? (
        <ShipmentScreen shipmentId={shipmentId} />
      ) : (
        <StatusBanner
          title="Invalid shipment link"
          message="Go back and open the shipment again."
          tone="warning"
        />
      )}
    </WorkflowModalScreen>
  )
}
