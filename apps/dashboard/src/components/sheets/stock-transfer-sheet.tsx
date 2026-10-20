"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { StockTransferHistory } from "@/components/inventory/stock-transfer-history"
import {
  type StockTransfer,
  TransferStatusBadge,
} from "@/components/tables/stock-transfers/columns"
import { stockDate } from "@/lib/inventory-labels"
import {
  normalizeQuantityInput,
  plainQuantityError,
} from "@/lib/inventory-quantity"
import { formatStockQuantity, pluralizeUnitName } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button, ControlField, Input, Sheet, Textarea } from "@ewatrade/ui"
import {
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

type View = "details" | "receive" | "cancel"

/**
 * One transfer. Receive and Cancel are steps inside this sheet with Back,
 * following the dashboard rule for changing an existing record.
 */
export function StockTransferSheet({
  record,
  storeId,
  onClose,
}: { record: StockTransfer | null; storeId?: string; onClose: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>("details")
  const [arrived, setArrived] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const mutation = useMutation(
    trpc.inventory.transitionTransfer.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.transferReview.pathKey(),
          }),
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
  if (!record) return <Sheet open={false} onOpenChange={() => undefined} />

  const unit = record.inventoryUnitName
  const onTheWay = formatStockQuantity(record.remainingQuantity, unit)
  const actionable =
    record.status === "IN_TRANSIT" && record.transitRevision !== null
  const canReceive = !storeId || record.targetStore.id === storeId
  const canCancel = !storeId || record.sourceStore.id === storeId

  function open(next: View) {
    setView(next)
    setError(null)
    setNotice(null)
    setNote("")
    if (next === "receive" && record) setArrived(record.remainingQuantity)
  }

  function send(transition: "receive" | "cancel", quantity?: string) {
    if (!record || record.transitRevision === null || mutation.isPending) return
    const target = record.targetStore.name
    const source = record.sourceStore.name
    mutation.mutate(
      {
        clientOperationId: crypto.randomUUID(),
        expectedTransitRevision: record.transitRevision,
        ...(quantity ? { quantity } : {}),
        reason:
          note.trim() ||
          (transition === "receive"
            ? `Received at ${target}`
            : `Cancelled by ${source}`),
        schemaVersion: 1,
        source: "dashboard_inventory",
        transferId: record.id,
        transition,
      },
      {
        onSuccess: () => {
          setView("details")
          setError(null)
          setNotice(
            transition === "receive"
              ? `Received ${formatStockQuantity(quantity ?? record.remainingQuantity, unit)} at ${target}.`
              : `Transfer cancelled. ${onTheWay} went back to ${source}.`,
          )
        },
        onError: (failure) => setError(failure.message),
      },
    )
  }

  function receive() {
    if (!record) return
    const typed = normalizeQuantityInput(arrived)
    if (!typed) {
      setError("Enter how many arrived.")
      return
    }
    let quantity: string
    try {
      quantity = parseExactDecimal(typed, { allowZero: true })
    } catch (failure) {
      setError(
        plainQuantityError(
          failure instanceof Error ? failure.message : "",
          pluralizeUnitName(unit),
        ),
      )
      return
    }
    if (compareExactDecimals(quantity, "0") <= 0) {
      setError("Enter more than 0. If nothing arrived, leave it On the way.")
      return
    }
    if (compareExactDecimals(quantity, record.remainingQuantity) > 0) {
      setError(`Only ${onTheWay} are on the way.`)
      return
    }
    send(
      "receive",
      compareExactDecimals(quantity, record.remainingQuantity) < 0
        ? quantity
        : undefined,
    )
  }

  const back = {
    label: "Back to transfer",
    onClick: () => open("details"),
  }
  const title = `${record.productName}${record.variantName && record.variantName !== record.productName ? ` · ${record.variantName}` : ""}`
  const route = `${record.sourceStore.name} → ${record.targetStore.name}`
  const typedArrived = normalizeQuantityInput(arrived)
  const part =
    /^\d+(\.\d+)?$/.test(typedArrived) &&
    compareExactDecimals(typedArrived, "0") > 0 &&
    compareExactDecimals(typedArrived, record.remainingQuantity) < 0

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose()
      }}
    >
      {view === "receive" && actionable ? (
        <SheetFrame
          back={back}
          closeDisabled={mutation.isPending}
          title="Receive"
          description={`${title} · ${route}`}
          footer={
            <>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={back.onClick}
              >
                Back
              </Button>
              <Button disabled={mutation.isPending} onClick={receive}>
                {mutation.isPending
                  ? "Saving…"
                  : part
                    ? `Receive ${formatStockQuantity(typedArrived, unit)}`
                    : "Receive all"}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 text-sm">
            {error ? (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            ) : null}
            <p>
              {onTheWay} on the way from {record.sourceStore.name}, sent{" "}
              {stockDate(record.createdAt)}.
            </p>
            <ControlField
              label="How many arrived?"
              description={
                part
                  ? `The other ${formatStockQuantity(
                      subtractExactDecimals(
                        record.remainingQuantity,
                        typedArrived,
                      ),
                      unit,
                    )} stay On the way. Receive them when they arrive, or ${record.sourceStore.name} can cancel them.`
                  : `In ${pluralizeUnitName(unit).toLowerCase()}. Change this if fewer arrived.`
              }
            >
              <Input
                inputMode="decimal"
                value={arrived}
                maxLength={40}
                onChange={(event) => setArrived(event.target.value)}
              />
            </ControlField>
            <ControlField label="Note (optional)">
              <Textarea
                value={note}
                maxLength={500}
                placeholder="e.g. One bag torn"
                onChange={(event) => setNote(event.target.value)}
              />
            </ControlField>
          </div>
        </SheetFrame>
      ) : view === "cancel" && actionable ? (
        <SheetFrame
          back={back}
          closeDisabled={mutation.isPending}
          title="Cancel this transfer?"
          description={`${title} · ${route}`}
          footer={
            <>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={back.onClick}
              >
                Keep transfer
              </Button>
              <Button
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() => send("cancel")}
              >
                {mutation.isPending ? "Cancelling…" : "Cancel transfer"}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 text-sm">
            {error ? (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            ) : null}
            <p>
              <span className="font-medium">
                {onTheWay} go back to {record.sourceStore.name}.
              </span>{" "}
              {record.targetStore.name} won’t be able to receive them. This
              can’t be undone.
            </p>
            <ControlField label="Why are you cancelling? (optional)">
              <Textarea
                value={note}
                maxLength={500}
                placeholder="e.g. Sent by mistake"
                onChange={(event) => setNote(event.target.value)}
              />
            </ControlField>
          </div>
        </SheetFrame>
      ) : (
        <SheetFrame title={title} description={`Transfer · ${route}`}>
          <div className="grid gap-5 text-sm">
            {notice ? <output className="text-primary">{notice}</output> : null}
            <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <TransferStatusBadge status={record.status} />
              </dd>
              <dt className="text-muted-foreground">Sent</dt>
              <dd>{formatStockQuantity(record.quantity, unit)}</dd>
              <dt className="text-muted-foreground">Still on the way</dt>
              <dd>
                {compareExactDecimals(record.remainingQuantity, "0") > 0
                  ? onTheWay
                  : "None"}
              </dd>
              <dt className="text-muted-foreground">From → To</dt>
              <dd>{route}</dd>
              <dt className="text-muted-foreground">Sent on</dt>
              <dd>{stockDate(record.createdAt)}</dd>
            </dl>
            {actionable && (canReceive || canCancel) ? (
              <section className="grid gap-2 border border-border p-4">
                <h3 className="font-medium">What do you want to do?</h3>
                <div className="flex flex-wrap gap-2">
                  {canReceive ? (
                    <Button variant="outline" onClick={() => open("receive")}>
                      Receive
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button variant="outline" onClick={() => open("cancel")}>
                      Cancel transfer
                    </Button>
                  ) : null}
                </div>
                <p className="text-muted-foreground">
                  {canReceive && !canCancel
                    ? `Receive it once it is here. Only ${record.sourceStore.name} can cancel it.`
                    : canCancel && !canReceive
                      ? `Only ${record.targetStore.name} can receive it. You can cancel it until then.`
                      : "Receive it once it is here, or cancel it to send it back."}
                </p>
              </section>
            ) : null}
            <StockTransferHistory
              key={record.id}
              transferId={record.id}
              storeId={storeId}
            />
          </div>
        </SheetFrame>
      )}
    </Sheet>
  )
}
