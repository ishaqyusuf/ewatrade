"use client"

import { financeSheetTitles } from "@/components/finance/finance-sheet-header"
import { FinanceFormProvider } from "@/components/finance/form-context"
import { FinanceDialogFrame } from "@/components/modals/finance-dialog-frame"
import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { Dialog, Sheet } from "@ewatrade/ui"
import dynamic from "next/dynamic"
import { type ReactNode, useCallback, useRef, useState } from "react"

const FinanceSheetContent = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("@/components/finance/finance-sheet-content").then(
          (mod) => mod.FinanceSheetContent,
        ),
      FinanceSheetCodeFrame,
    ),
  { loading: () => <FinanceSheetLoading /> },
)

function FinanceSheetLoading() {
  return (
    <FinanceSheetCodeFrame>
      <output aria-live="polite">Loading…</output>
    </FinanceSheetCodeFrame>
  )
}

/** Loading and code recovery keep the selected flow's frame and Close. */
function FinanceSheetCodeFrame({ children }: { children: ReactNode }) {
  const { financeSheet } = useFinanceParams()
  const Frame = financeSheet === "bank-import" ? FinanceDialogFrame : SheetFrame
  return (
    <Frame title={financeSheet ? financeSheetTitles[financeSheet] : "Finance"}>
      {children}
    </Frame>
  )
}

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
  // Upload statement is a centred dialog (choose file → map columns → check).
  const Root = financeSheet === "bank-import" ? Dialog : Sheet
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
