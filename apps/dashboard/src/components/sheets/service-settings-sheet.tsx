"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { ServiceSettingsForm } from "@/components/service-work/service-settings-form"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"

export function ServiceSettingsSheet({
  currencyCode,
  storeId,
}: {
  currencyCode: string
  storeId: string
}) {
  const { setParams, sheet } = useServiceWorkParams()
  const open = sheet === "settings"
  return (
    <DashboardSheet
      description="Configure express turnaround, pricing, reminders, and delivery channels."
      onClose={() => setParams(null)}
      open={open}
      title="Service settings"
    >
      {open ? (
        <ServiceSettingsForm currencyCode={currencyCode} storeId={storeId} />
      ) : null}
    </DashboardSheet>
  )
}
