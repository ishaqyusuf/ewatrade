"use client"

import { ServiceQuoteForm } from "@/components/service-work/service-quote-form"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceQuoteSheet({ store }: { store: StoreSummary }) {
  const { requestId, setParams, sheet } = useServiceWorkParams()
  const open = sheet === "quote" && Boolean(requestId)
  const { closeError, requestClose } = useSheetDismissal(() => setParams(null))

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose()
      }}
    >
      {open && requestId ? (
        <SheetFrame
          closeError={closeError}
          title="Issue quote"
          description="Issuing a revision supersedes the previous version."
        >
          <ServiceQuoteForm key={`${store.id}:${requestId}`} store={store} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
