"use client"
import { BottomBar } from "@/components/tables/core/bottom-bar"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import { Button } from "@ewatrade/ui"
import type { Table } from "@tanstack/react-table"
import type { OrderRow } from "./columns"

export function OrdersBottomBar({ table }: { table: Table<OrderRow> }) {
  const { setParams } = useReceiptParams()
  const selected = table.getSelectedRowModel().rows
  // Selection is general; receipts apply only to eligible Orders.
  const eligible = selected.filter((row) =>
    isReceiptOrderEligible(row.original.status),
  )
  const ineligibleCount = selected.length - eligible.length
  if (!selected.length) return null
  return (
    <BottomBar
      selectedCount={selected.length}
      onDeselect={() => table.resetRowSelection()}
    >
      {ineligibleCount > 0 ? (
        <span className="text-sm text-muted-foreground">
          {ineligibleCount} not eligible for receipts
        </span>
      ) : null}
      {eligible.length > 20 && (
        <span className="text-sm text-muted-foreground">
          Maximum 20 per export
        </span>
      )}
      <Button
        type="button"
        size="sm"
        disabled={!eligible.length || eligible.length > 20}
        onClick={() =>
          void setParams({ receiptIds: eligible.map((row) => row.id) })
        }
      >
        {eligible.length && ineligibleCount
          ? `Generate ${eligible.length} receipts`
          : "Generate receipts"}
      </Button>
    </BottomBar>
  )
}
