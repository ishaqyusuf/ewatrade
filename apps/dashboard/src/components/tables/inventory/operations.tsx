"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

/** Operational history and transfer transitions stay separate from the balance table. */
export function InventoryOperations({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
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
    <>
      <section className="grid gap-3">
        <h2 className="font-semibold">Recent operations</h2>
        {history.slice(0, 12).map((operation) => (
          <div
            className="flex items-center justify-between gap-4 border-b border-border px-1 py-3 text-sm"
            key={operation.id}
          >
            <div>
              <p className="font-medium capitalize">{label(operation.type)}</p>
              {operation.categories.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {operation.categories.map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full border border-border bg-muted px-2 py-1 text-xs"
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {operation.reason}
                </p>
              )}
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
                      appearance="form"
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
                      appearance="form"
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
    </>
  )
}
