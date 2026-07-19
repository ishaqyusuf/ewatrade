"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { ServiceQuoteForm } from "@/components/service-work/service-quote-form"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceQuoteSheet({ store }: { store: StoreSummary }) {
  const { requestId, setParams, sheet } = useServiceWorkParams()
  const open = sheet === "quote" && Boolean(requestId)

  return (
    <DashboardSheet
      open={open}
      onClose={() => setParams(null)}
      title="Issue quote"
      description="Issuing a revision supersedes the previous version."
    >
      {open ? <ServiceQuoteForm key={requestId} store={store} /> : null}
    </DashboardSheet>
  )
}
