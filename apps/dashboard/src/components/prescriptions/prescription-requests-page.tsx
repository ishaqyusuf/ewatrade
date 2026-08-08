import { PrescriptionDataTable } from "@/components/tables/prescriptions/data-table"

import { PrescriptionFulfillmentPanel } from "./prescription-fulfillment-panel"
import { PrescriptionHeader } from "./prescription-header"

export function PrescriptionRequestsPage({
  store,
  timeZone,
}: {
  store: { id: string; name: string }
  timeZone: string
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <PrescriptionHeader storeName={store.name} />
      <PrescriptionDataTable storeId={store.id} timeZone={timeZone} />
      <PrescriptionFulfillmentPanel storeId={store.id} />
    </div>
  )
}
