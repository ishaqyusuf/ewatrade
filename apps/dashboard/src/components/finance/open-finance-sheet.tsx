"use client"
import {
  type FinanceSheetMode,
  useFinanceParams,
} from "@/hooks/use-finance-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

export function OpenFinanceSheet({
  mode,
  billId,
  children,
  icon = false,
}: {
  mode: FinanceSheetMode
  billId?: string
  children: ReactNode
  secondary?: boolean
  icon?: boolean
}) {
  const { setParams } = useFinanceParams()
  return (
    <Button
      variant="outline"
      size={icon ? "icon" : "default"}
      className={icon ? "size-9" : "h-9"}
      aria-label={icon && typeof children === "string" ? children : undefined}
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
      {icon ? (
        <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
      ) : (
        children
      )}
    </Button>
  )
}
