"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useMemo } from "react"
import { inventoryColumns } from "./columns"
import { InventoryEmptyState } from "./empty-states"

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function InventoryDataTable({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { query } = useInventoryParams()
  const { data: balances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId },
      { retry: false },
    ),
  )
  const { data: history } = useSuspenseQuery(
    trpc.inventory.operationHistory.queryOptions(
      { limit: 50, storeId },
      { retry: false },
    ),
  )
  const { data: transfers } = useSuspenseQuery(
    trpc.inventory.transfers.queryOptions(
      { limit: 100, storeId },
      { retry: false },
    ),
  )
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return balances.rows
    return balances.rows.filter((row) =>
      [row.productName, row.variantName, row.inventoryUnitName, row.custodyType]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
  }, [balances.rows, query])
  const transitionMutation = useMutation(
    trpc.inventory.transitionTransfer.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.transfers.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.balanceReport.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.operationHistory.queryKey(),
          }),
        ])
      },
    }),
  )

  return (
    <div className="grid gap-6">
      <DashboardTable
        rows={rows}
        columns={inventoryColumns}
        getRowKey={(row) => row.balanceSourceId}
        emptyState={<InventoryEmptyState filtered={Boolean(query.trim())} />}
      />
      <section className="grid gap-3">
        <h2 className="font-semibold">Recent operations</h2>
        {history.slice(0, 12).map((operation) => (
          <div
            className="flex items-center justify-between gap-4 border-b border-border px-1 py-3 text-sm"
            key={operation.id}
          >
            <div>
              <p className="font-medium capitalize">{label(operation.type)}</p>
              <p className="text-xs text-muted-foreground">
                {operation.reason}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {operation.movementCount} movement
              {operation.movementCount === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </section>
      <section className="grid gap-3">
        <h2 className="font-semibold">Stock transfers</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No transfers for this Store.
          </p>
        ) : (
          transfers.map((transfer) => (
            <div
              className="flex flex-col gap-3 border-b border-border px-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              key={transfer.id}
            >
              <div>
                <p className="font-medium">
                  {transfer.productName} · {transfer.variantName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {transfer.quantity} {transfer.inventoryUnitName} ·{" "}
                  {transfer.sourceStore.name} → {transfer.targetStore.name} ·{" "}
                  {label(transfer.status)}
                </p>
              </div>
              {transfer.status === "IN_TRANSIT" &&
              transfer.transitRevision !== null ? (
                <div className="flex gap-2">
                  {transfer.targetStore.id === storeId ? (
                    <Button
                      size="sm"
                      disabled={transitionMutation.isPending}
                      onClick={() => {
                        const transitRevision = transfer.transitRevision
                        if (transitRevision === null) return
                        transitionMutation.mutate({
                          clientOperationId: crypto.randomUUID(),
                          expectedTransitRevision: transitRevision,
                          reason: "Received at target Store",
                          schemaVersion: 1,
                          source: "dashboard_inventory",
                          transferId: transfer.id,
                          transition: "receive",
                        })
                      }}
                    >
                      Receive
                    </Button>
                  ) : null}
                  {transfer.sourceStore.id === storeId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={transitionMutation.isPending}
                      onClick={() => {
                        const transitRevision = transfer.transitRevision
                        if (transitRevision === null) return
                        transitionMutation.mutate({
                          clientOperationId: crypto.randomUUID(),
                          expectedTransitRevision: transitRevision,
                          reason: "Cancelled by source Store",
                          schemaVersion: 1,
                          source: "dashboard_inventory",
                          transferId: transfer.id,
                          transition: "cancel",
                        })
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </div>
  )
}
