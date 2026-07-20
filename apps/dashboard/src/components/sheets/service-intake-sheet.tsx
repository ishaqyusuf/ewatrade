"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { ServiceIntakeForm } from "@/components/service-work/service-intake-form"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceIntakeSheet({
  canManage,
  store,
}: {
  canManage: boolean
  store: StoreSummary
}) {
  const { setParams, sheet } = useServiceWorkParams()
  const open = sheet === "intake"

  return (
    <DashboardSheet
      open={open}
      onClose={() => setParams(null)}
      title="New service"
      description="Choose the work first. Customer and timing details are optional."
    >
      {open ? (
        <ServiceIntakeForm
          canManage={canManage}
          key="service-intake"
          store={store}
        />
      ) : null}
    </DashboardSheet>
  )
}
