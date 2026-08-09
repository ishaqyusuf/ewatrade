import { PrescriptionDataTable } from "@/components/tables/prescriptions/data-table"

import { PrescriptionFulfillmentPanel } from "./prescription-fulfillment-panel"
import { PrescriptionHeader } from "./prescription-header"
import { PrescriptionWorkspaceGate } from "./prescription-workspace-gate"

export function PrescriptionRequestsPage({
  canManageSetup,
  store,
  timeZone,
}: {
  canManageSetup: boolean
  store: { id: string; name: string }
  timeZone: string
}) {
  return (
    <PrescriptionWorkspaceGate canManageSetup={canManageSetup} store={store}>
      <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
        <PrescriptionHeader storeId={store.id} storeName={store.name} />
        <PrescriptionDataTable storeId={store.id} timeZone={timeZone} />
        <PrescriptionFulfillmentPanel storeId={store.id} />
      </div>
    </PrescriptionWorkspaceGate>
  )
}
