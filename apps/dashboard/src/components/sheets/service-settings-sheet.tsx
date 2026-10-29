"use client"

import { loadSheetCode } from "./load-sheet-code"

import { SheetBodyLoading, SheetFrame } from "@/components/sheets/sheet-frame"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"
import dynamic from "next/dynamic"

const ServiceSettingsForm = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("@/components/service-work/service-settings-form").then(
          (module) => module.ServiceSettingsForm,
        ),
      "body",
    ),
  { loading: SheetBodyLoading },
)

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
          description="Express service and messages to customers."
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
