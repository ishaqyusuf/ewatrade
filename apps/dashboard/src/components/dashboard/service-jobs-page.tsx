import { CustomerRequests } from "@/components/service-work/customer-requests"
import { ServiceWorkHeader } from "@/components/service-work/service-work-header"
import { ServiceIntakeSheet } from "@/components/sheets/service-intake-sheet"
import { ServiceJobSheet } from "@/components/sheets/service-job-sheet"
import { ServiceQuoteSheet } from "@/components/sheets/service-quote-sheet"
import { ServiceRequestSheet } from "@/components/sheets/service-request-sheet"
import { ServiceSettingsSheet } from "@/components/sheets/service-settings-sheet"
import { ServiceWorkDataTable } from "@/components/tables/service-work/data-table"

type StoreSummary = {
  currencyCode: string
  id: string
  name: string
}

export function ServiceJobsPage({
  canManage,
  store,
  timeZone,
}: {
  canManage: boolean
  store: StoreSummary
  timeZone: string
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <ServiceWorkHeader canManage={canManage} storeName={store.name} />
      <ServiceWorkDataTable
        canManage={canManage}
        storeId={store.id}
        timeZone={timeZone}
      />
      {canManage ? <CustomerRequests storeId={store.id} /> : null}
      <ServiceIntakeSheet canManage={canManage} store={store} />
      {canManage ? (
        <>
          <ServiceRequestSheet store={store} />
          <ServiceQuoteSheet store={store} />
          <ServiceSettingsSheet
            currencyCode={store.currencyCode}
            storeId={store.id}
          />
        </>
      ) : null}
      <ServiceJobSheet canManage={canManage} />
    </div>
  )
}
