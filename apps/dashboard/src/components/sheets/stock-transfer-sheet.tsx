"use client"
import { StockTransferHistory } from "@/components/inventory/stock-transfer-history"
import {
  inventoryDate,
  inventoryLabel,
} from "@/components/tables/inventory-ledger/format"
import type { StockTransfer } from "@/components/tables/stock-transfers/columns"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"
export function StockTransferSheet({
  record,
  storeId,
  onClose,
}: { record: StockTransfer | null; storeId?: string; onClose: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const mutation = useMutation(
    trpc.inventory.transitionTransfer.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.inventory.transferReview.pathKey() }),
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
  function transition(value: "receive" | "cancel") {
    if (
      !record ||
      record.status !== "IN_TRANSIT" ||
      record.transitRevision === null ||
      mutation.isPending
    )
      return
    if (
      value === "receive"
        ? Boolean(storeId && record.targetStore.id !== storeId)
        : Boolean(storeId && record.sourceStore.id !== storeId)
    )
      return
    mutation.mutate({
      clientOperationId: crypto.randomUUID(),
      expectedTransitRevision: record.transitRevision,
      reason:
        value === "receive"
          ? "Received at target Store"
          : "Cancelled by source Store",
      schemaVersion: 1,
      source: "dashboard_inventory",
      transferId: record.id,
      transition: value,
    })
  }
  const actionable =
    record?.status === "IN_TRANSIT" && record.transitRevision !== null
  return (
    <Sheet
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      {record ? (
        <SheetFrame
          closeDisabled={mutation.isPending}
          title="Stock transfer"
          description={`${record.productName} · ${record.variantName}`}
          footer={
            actionable ? (
              <>
                {!storeId || record.targetStore.id === storeId ? (
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => transition("receive")}
                  >
                    {mutation.isPending ? "Updating…" : "Receive transfer"}
                  </Button>
                ) : null}
                {!storeId || record.sourceStore.id === storeId ? (
                  <Button
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => transition("cancel")}
                  >
                    {mutation.isPending ? "Updating…" : "Cancel transfer"}
                  </Button>
                ) : null}
              </>
            ) : undefined
          }
        >
          <div className="grid gap-5 text-sm">
            <dl className="grid gap-4">
              {[
                ["Status", inventoryLabel(record.status)],
                [
                  "Originally dispatched",
                  `${formatInventoryQuantity(record.quantity)} ${record.inventoryUnitName}`,
                ],
                ["Remaining in transit", `${formatInventoryQuantity(record.remainingQuantity)} ${record.inventoryUnitName}`],
                ["From", record.sourceStore.name],
                ["To", record.targetStore.name],
                ["Created (UTC)", inventoryDate(record.createdAt)],
                ["Transfer ID", record.id],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <StockTransferHistory key={record.id} transferId={record.id} storeId={storeId} />
            {actionable ? (
              <p className="text-muted-foreground">
                {!storeId || record.targetStore.id === storeId
                  ? "Receive after confirming the stock has arrived at this store."
                  : "This stock is in transit. Switch to the destination store to receive it, or cancel here to return it to the source."}
              </p>
            ) : null}
            {mutation.error ? (
              <p role="alert" className="text-destructive">
                {mutation.error.message}
              </p>
            ) : null}
            {mutation.isSuccess ? <output>Transfer updated.</output> : null}
          </div>
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
