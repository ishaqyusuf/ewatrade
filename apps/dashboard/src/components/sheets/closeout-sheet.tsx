"use client"
import { CloseoutDetails } from "@/components/inventory/closeout-details"
import { useCloseoutParams } from "@/hooks/use-closeout-params"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { Sheet } from "@ewatrade/ui"
import { SheetFrame } from "./sheet-frame"
export function CloseoutSheet({ storeId }: { storeId: string }) {
  const { closeoutId, close } = useCloseoutParams()
  const { closeError, requestClose } = useSheetDismissal(close)
  return (
    <Sheet
      open={Boolean(closeoutId)}
      onOpenChange={(open) => {
        if (!open) void requestClose()
      }}
    >
      {closeoutId ? (
        <SheetFrame
          title="Custody closeout"
          description="Saved custody declarations and their reconciliation."
          closeError={closeError}
        >
          <CloseoutDetails
            key={`${storeId}:${closeoutId}`}
            storeId={storeId}
            closeoutId={closeoutId}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
