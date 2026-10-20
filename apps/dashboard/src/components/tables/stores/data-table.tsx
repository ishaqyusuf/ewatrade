"use client"

import { SimpleDirectoryTable } from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import { Store01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"

export type StoreRow = RouterOutputs["tenant"]["stores"][number]

const getStoreId = (store: StoreRow) => store.id

function statusLabel(status: string) {
  const lower = status.toLowerCase().replaceAll("_", " ")
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function StoreStatus({ store }: { store: StoreRow }) {
  return (
    <Badge
      variant={store.status === "ACTIVE" ? "secondary" : "outline"}
      className="shrink-0"
    >
      {statusLabel(store.status)}
    </Badge>
  )
}

const columns: ColumnDef<StoreRow>[] = [
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

function StoreIcon() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <HugeiconsIcon icon={Store01Icon} className="size-4" />
    </span>
  )
}

/** Stores as a table, a list, or a grid (two across from md). */
export function StoresDataTable({
  stores,
  view,
}: {
  stores: StoreRow[]
  view: DirectoryView
}) {
  const table = useReactTable({
    data: stores,
    columns,
    getRowId: getStoreId,
    getCoreRowModel: getCoreRowModel(),
  })
  if (view === "table")
    return <SimpleDirectoryTable table={table} label="Stores" minWidth={420} />
  if (view === "list")
    return (
      <ul
        aria-label="Store list"
        className="divide-y divide-border rounded-[10px] border border-border bg-card"
      >
        {stores.map((store) => (
          <li
            key={store.id}
            className="flex flex-wrap items-center gap-3.5 px-3.5 py-3"
          >
            <StoreIcon />
            <div className="min-w-0 flex-[1_1_200px]">
              <p className="font-medium">{store.name}</p>
              <p className="text-sm text-muted-foreground">
                {store.currencyCode}
              </p>
            </div>
            <StoreStatus store={store} />
          </li>
        ))}
      </ul>
    )
  return (
    <ul aria-label="Store grid" className="grid gap-4 md:grid-cols-2">
      {stores.map((store) => (
        <li
          key={store.id}
          className="grid justify-items-start gap-2 rounded-xl border border-border bg-card p-4"
        >
          <StoreIcon />
          <p className="font-semibold">{store.name}</p>
          <dl className="grid w-full gap-1 text-sm">
            <div className="flex justify-between gap-2 border-t border-border pt-1.5">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{statusLabel(store.status)}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-border pt-1.5">
              <dt className="text-muted-foreground">Currency</dt>
              <dd>{store.currencyCode}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}
