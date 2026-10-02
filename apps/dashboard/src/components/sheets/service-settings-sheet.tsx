"use client"

import { ServiceSettingsForm } from "@/components/service-work/service-settings-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

export function ServiceSettingsSheet({
  currencyCode,
  storeId,
}: {
  currencyCode: string
  storeId: string
}) {
  const { setParams, sheet } = useServiceWorkParams()
  const open = sheet === "settings"
  const { closeError, requestClose } = useSheetDismissal(() => setParams(null))
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open ? (
        <SheetFrame
          closeError={closeError}
          description="Configure express turnaround, pricing, reminders, and delivery channels."
          title="Service settings"
        >
          <ServiceSettingsForm
            key={`${storeId}:settings`}
            currencyCode={currencyCode}
            storeId={storeId}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
