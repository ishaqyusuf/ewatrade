"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { ServiceRequestForm } from "@/components/service-work/service-request-form"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceRequestSheet({ store }: { store: StoreSummary }) {
  const { setParams, sheet } = useServiceWorkParams()
  const open = sheet === "request"

  return (
    <DashboardSheet
      open={open}
      onClose={() => setParams(null)}
      title="Customer request link"
      description="Choose the Services customers may ask you to quote."
    >
      {open ? <ServiceRequestForm key="service-request" store={store} /> : null}
    </DashboardSheet>
  )
}
