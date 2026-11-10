"use client"

import { InventoryTabs } from "@/components/inventory/inventory-tabs"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { useShipmentParams } from "@/hooks/use-shipment-params"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { formatDate } from "@ewatrade/utils/dayjs"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ShipmentSheet } from "./shipment-sheet"
import { ShipmentStatusBadge } from "./shipment-status"

type StoreSummary = { currencyCode: string; id: string; name: string }

export function ShipmentsPage({ store }: { store: StoreSummary }) {
  const trpc = useTRPC()
  const { setParams } = useShipmentParams()
  const book = useQuery(trpc.finance.book.queryOptions())
  const list = useQuery(
    trpc.finance.shipments.list.queryOptions(
      { bookId: book.data?.id ?? "", limit: 50 },
      { enabled: Boolean(book.data) },
    ),
  )
  const rows = (list.data?.items ?? []).filter(
    (row) => row.storeId === store.id,
  )

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
        <PageHeader
          eyebrow={store.name}
          title="Shipments"
          description="Goods ordered from suppliers. Stock goes up only when you record what arrived."
        >
          <PageToolbar
            actions={
              <Button
                className="rounded-none"
                disabled={!book.data}
                onClick={() =>
                  void setParams({ shipment: "new", shipmentStep: "edit" })
                }
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                New shipment
              </Button>
            }
          />
          <InventoryTabs />
        </PageHeader>
        {book.isSuccess && !book.data ? (
          <p className="text-sm text-muted-foreground">
            Set up{" "}
            <Link className="text-primary underline" href="/finance">
              Finance
            </Link>{" "}
            first. Shipments record supplier bills when goods arrive.
          </p>
        ) : list.isError || book.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Shipments couldn’t load. Refresh to try again.
          </p>
        ) : list.isSuccess && !rows.length ? (
          <p className="text-sm text-muted-foreground">
            No shipments yet. Add one when you order goods from a supplier.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Expected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void setParams({ shipment: row.id, shipmentStep: null })
                  }
                >
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium"
                      onClick={(event) => {
                        event.stopPropagation()
                        void setParams({ shipment: row.id, shipmentStep: null })
                      }}
                    >
                      {row.name}
                    </button>
                    {row.reference ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.reference}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.supplierName}</TableCell>
                  <TableCell>
                    <ShipmentStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    {row.outstandingLineCount
                      ? `${row.outstandingLineCount} of ${row.lineCount} still to come`
                      : `${row.lineCount} all in`}
                  </TableCell>
                  <TableCell>
                    {row.expectedAt ? formatDate(row.expectedAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {book.data ? <ShipmentSheet book={book.data} store={store} /> : null}
    </ScrollableContent>
  )
}
