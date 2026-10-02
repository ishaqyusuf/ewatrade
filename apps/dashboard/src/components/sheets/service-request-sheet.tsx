"use client"

import { ServiceRequestForm } from "@/components/service-work/service-request-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceRequestSheet({ store }: { store: StoreSummary }) {
  const { setParams, sheet } = useServiceWorkParams()
  const open = sheet === "request"
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
          title="Customer request link"
          description="Choose the Services customers may ask you to quote."
        >
          <ServiceRequestForm key={`${store.id}:request`} store={store} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
