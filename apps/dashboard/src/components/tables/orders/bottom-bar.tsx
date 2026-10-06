"use client"
import { BottomBar } from "@/components/tables/core/bottom-bar"
import { useReceiptParams } from "@/hooks/use-receipt-params"
import { Button } from "@ewatrade/ui"
import type { Table } from "@tanstack/react-table"
import type { OrderRow } from "./columns"

export function OrdersBottomBar({ table }: { table: Table<OrderRow> }) {
  const { setParams } = useReceiptParams()
  const selected = table.getSelectedRowModel().rows
  if (!selected.length) return null
  return (
    <BottomBar
      selectedCount={selected.length}
      onDeselect={() => table.resetRowSelection()}
    >
      {selected.length > 20 && (
        <span className="text-sm text-muted-foreground">
          Maximum 20 per export
        </span>
      )}
      <Button
        type="button"
        size="sm"
        disabled={selected.length > 20}
        onClick={() =>
          void setParams({ receiptIds: selected.map((row) => row.id) })
        }
      >
        Generate receipts
      </Button>
    </BottomBar>
  )
}
