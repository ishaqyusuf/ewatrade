import { ShipmentsScreen } from "@/components/mobile/shipments/shipments-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"

export default function ShipmentsRoute() {
  return (
    <WorkflowModalScreen title="Shipments" closeLabel="Close shipments">
      <ShipmentsScreen />
    </WorkflowModalScreen>
  )
}
