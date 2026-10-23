"use client"

import { ServiceIntakeForm } from "@/components/service-work/service-intake-form"
import { ServiceIntakeSkeleton } from "@/components/service-work/service-intake-skeleton"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import {
  setServiceIntakeDraft,
  useServiceIntakeDraft,
} from "@/hooks/use-service-intake-draft"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ServiceIntakeSheet({
  canManage,
  store,
  tenantId,
}: {
  canManage: boolean
  store: StoreSummary
  tenantId: string
}) {
  const { setParams, sheet } = useServiceWorkParams()
  const initialDraft = useServiceIntakeDraft(tenantId, store.id)
  const open = sheet === "intake"
  const { closeError, requestClose } = useSheetDismissal(async () => {
    await setParams(null)
    setServiceIntakeDraft(null)
  })

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
          loadingFallback={<ServiceIntakeSkeleton />}
          title="New job"
          description="Pick the work. Everything else can wait."
          popupClassName="sm:w-[min(960px,calc(100vw-2rem))] sm:max-w-none"
        >
          <ServiceIntakeForm
            canManage={canManage}
            key={`${store.id}:intake`}
            store={store}
            initialDraft={initialDraft}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
