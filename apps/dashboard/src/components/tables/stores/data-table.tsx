"use client"

import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  SelectionBar,
  SimpleDirectoryTable,
  selectColumn,
  useLoadedRowSelection,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

export type StoreRow = RouterOutputs["tenant"]["stores"][number]

const getStoreId = (store: StoreRow) => store.id

function StoreStatus({ store }: { store: StoreRow }) {
  return (
    <Badge variant="outline" className="shrink-0">
      {store.status.toLowerCase()}
    </Badge>
  )
}

const columns: ColumnDef<StoreRow>[] = [
  selectColumn((store) => store.name, "Select all Stores"),
  {
    id: "name",
    header: "Store",
    cell: ({ row }) => (
      <p className="min-w-40 break-words font-medium">{row.original.name}</p>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StoreStatus store={row.original} />,
  },
  {
    id: "currency",
    header: "Currency",
    cell: ({ row }) => row.original.currencyCode,
  },
]

export function StoresDataTable({
  stores,
  view,
}: {
  stores: StoreRow[]
  view: DirectoryView
}) {
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: stores,
    getRowId: getStoreId,
    scope: "",
  })
  const table = useReactTable({
    data: stores,
    columns,
    getRowId: getStoreId,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  })
  return (
    <div className="grid min-w-0 gap-3">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all Stores"
        summary={`${stores.length} Store${stores.length === 1 ? "" : "s"}`}
      />
      {view === "table" ? (
        <SimpleDirectoryTable table={table} label="Stores" minWidth={480} />
      ) : (
        <DirectoryCollection view={view} label="Store">
          {table.getRowModel().rows.map((row) => (
            <DirectoryRecord
              key={row.id}
              row={row}
              view={view}
              selectLabel={`Select ${row.original.name}`}
              title={row.original.name}
              badges={<StoreStatus store={row.original} />}
              details={[
                { label: "Currency", value: row.original.currencyCode },
              ]}
            />
          ))}
        </DirectoryCollection>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
