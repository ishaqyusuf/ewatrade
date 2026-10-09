"use client"

import type { FinanceSupplierRow } from "@/components/finance/types"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"

export function financeSupplierColumns(
  openStatement: (id: string) => void,
): ColumnDef<FinanceSupplierRow>[] {
  return [
    selectColumn((supplier) => supplier.name),
    {
      accessorKey: "code",
      header: "Code",
      size: 180,
      minSize: 130,
      maxSize: 280,
      enableHiding: false,
      meta: {
        headerLabel: "Code",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text", width: "w-24" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="truncate font-mono text-xs">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Supplier",
      size: 320,
      minSize: 200,
      maxSize: 520,
      meta: {
        headerLabel: "Supplier",
        skeleton: { type: "text", width: "w-40" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => <span className="truncate">{row.original.name}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      size: 96,
      minSize: 96,
      maxSize: 96,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <ViewSupplierButton
          supplier={row.original}
          onOpen={() => openStatement(row.original.id)}
        />
      ),
    },
  ]
}

export function ViewSupplierButton({
  supplier,
  onOpen,
}: {
  supplier: FinanceSupplierRow
  onOpen: () => void
}) {
  return (
    <Button
      type="button"
      aria-label={`View ${supplier.name} statement`}
      data-row-interactive="true"
      className="rounded-none"
      size="sm"
      variant="ghost"
      onClick={onOpen}
    >
      View
    </Button>
  )
}
