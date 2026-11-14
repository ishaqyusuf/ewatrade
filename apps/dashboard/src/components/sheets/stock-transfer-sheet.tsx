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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  ControlField,
  Input,
  Sheet,
  Textarea,
} from "@ewatrade/ui"
import {
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

type View = "details" | "receive"

/**
 * One transfer. Receive is a step inside this sheet with Back (it takes a
 * quantity); Cancel sends stock back, so it is an alert naming what moves.
 */
export function StockTransferSheet({
  record,
  onClose,
}: { record: StockTransfer | null; onClose: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>("details")
  const [confirmCancel, setConfirmCancel] = useState(false)
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
            queryKey: trpc.inventory.transfersPage.pathKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.balanceReport.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.operationHistory.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.operationHistoryPage.pathKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.inventory.operationTotals.pathKey(),
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
          setConfirmCancel(false)
          setError(null)
          setNotice(
            transition === "receive"
              ? `Received ${formatStockQuantity(quantity ?? record.remainingQuantity, unit)} at ${target}.`
              : `Transfer cancelled. ${onTheWay} went back to ${source}.`,
          )
        },
        onError: (failure) => {
          setConfirmCancel(false)
          setError(failure.message)
        },
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
          title={`Receive ${title}`}
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
              label={`How many ${pluralizeUnitName(unit).toLowerCase()} arrived?`}
              description={
                part
                  ? `The other ${formatStockQuantity(
                      subtractExactDecimals(
                        record.remainingQuantity,
                        typedArrived,
                      ),
                      unit,
                    )} stay On the way.`
                  : undefined
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
      ) : (
        <SheetFrame
          title={title}
          footer={
            actionable ? (
              <>
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setError(null)
                    setNote("")
                    setConfirmCancel(true)
                  }}
                >
                  Cancel transfer
                </Button>
                <Button
                  disabled={mutation.isPending}
                  onClick={() => open("receive")}
                >
                  Receive
                </Button>
              </>
            ) : undefined
          }
        >
          <div className="grid gap-5">
            {notice ? (
              <output className="text-success-foreground">{notice}</output>
            ) : null}
            {error ? (
              <FormFeedback appearance="dashboard">{error}</FormFeedback>
            ) : null}
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <TransferStatusBadge status={record.status} />
              </dd>
              <dt className="text-muted-foreground">Sent</dt>
              <dd className="tabular-nums">
                {formatStockQuantity(record.quantity, unit)}
              </dd>
              <dt className="text-muted-foreground">Still on the way</dt>
              <dd className="tabular-nums">
                {compareExactDecimals(record.remainingQuantity, "0") > 0
                  ? onTheWay
                  : "None"}
              </dd>
              <dt className="text-muted-foreground">From → To</dt>
              <dd>{route}</dd>
              <dt className="text-muted-foreground">Sent on</dt>
              <dd>{stockDate(record.createdAt)}</dd>
            </dl>
            <StockTransferHistory key={record.id} transferId={record.id} />
          </div>
        </SheetFrame>
      )}
      <AlertDialog
        open={confirmCancel && actionable}
        onOpenChange={(next) => {
          if (!next && !mutation.isPending) setConfirmCancel(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle className="text-lg font-medium">
            Cancel the transfer of {onTheWay}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {title}: {onTheWay} go back to {record.sourceStore.name}.{" "}
            {record.targetStore.name} won’t receive them. This can’t be undone.
          </AlertDialogDescription>
          <ControlField label="Why? (optional)">
            <Textarea
              value={note}
              maxLength={500}
              placeholder="e.g. Sent by mistake"
              onChange={(event) => setNote(event.target.value)}
            />
          </ControlField>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Keep transfer
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => send("cancel")}
            >
              {mutation.isPending ? "Cancelling…" : "Cancel transfer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
