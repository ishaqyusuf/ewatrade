"use client"

import { ServiceIntakeForm } from "@/components/service-work/service-intake-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

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
          title="New job"
          description="Pick the work. Everything else can wait."
        >
          <ServiceIntakeForm
            canManage={canManage}
            key={`${store.id}:intake`}
            store={store}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
