"use client"

import { FinanceSheetContent } from "@/components/finance/finance-sheet-content"
import { FinanceFormProvider } from "@/components/finance/form-context"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { Dialog, Sheet } from "@ewatrade/ui"
import { useCallback, useRef, useState } from "react"

export function FinanceSheet({
  actorUserId,
  storeId,
  tenantId,
}: {
  actorUserId: string
  storeId: string
  tenantId: string
}) {
  const { financeSheet, close } = useFinanceParams()
  const lockedRef = useRef(false)
  const open = Boolean(financeSheet)
  const Root = financeSheet === "supplier" ? Dialog : Sheet
  const [closeError, setCloseError] = useState<string | null>(null)

  const closeSheet = useCallback(async () => {
    if (lockedRef.current) return
    setCloseError(null)
    await close()
  }, [close])

  return (
    <Root
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) return
        if (lockedRef.current) {
          details.cancel()
          return
        }
        void closeSheet().catch((error: unknown) => {
          setCloseError(
            error instanceof Error
              ? error.message
              : "The finance sheet could not be closed.",
          )
        })
      }}
    >
      {open ? (
        <FinanceFormProvider
          key={`${actorUserId}:${tenantId}:${storeId}`}
          actorUserId={actorUserId}
          tenantId={tenantId}
        >
          <FinanceSheetContent
            closeLockedRef={lockedRef}
            storeId={storeId}
            closeError={closeError}
            onClose={closeSheet}
          />
        </FinanceFormProvider>
      ) : null}
    </Root>
  )
}
