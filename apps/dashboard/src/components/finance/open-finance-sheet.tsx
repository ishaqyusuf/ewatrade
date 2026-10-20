"use client"
import {
  type FinanceSheetMode,
  useFinanceParams,
} from "@/hooks/use-finance-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

/**
 * Opens a Finance sheet. `primary` is the page's main action: a filled button
 * with a plus and its label, so it says what it does.
 */
export function OpenFinanceSheet({
  mode,
  billId,
  children,
  primary = false,
}: {
  mode: FinanceSheetMode
  billId?: string
  children: ReactNode
  secondary?: boolean
  primary?: boolean
}) {
  const { setParams } = useFinanceParams()
  return (
    <Button
      variant={primary ? "default" : "outline"}
      className="h-9 rounded-none"
      onClick={() =>
        setParams({
          financeSheet: mode,
          statementId: null,
          billId: billId ?? null,
          supplierId: null,
          countId: null,
          moneyEntryId: null,
        })
      }
    >
      {primary ? (
        <HugeiconsIcon
          icon={Add01Icon}
          data-icon="inline-start"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </Button>
  )
}
