"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Input, MoneyInput, cn } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useMutation } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { orderMoney } from "../order-draft"
import {
  DialogField,
  MutationError,
  OrderDialog,
  ReasonField,
} from "./order-dialog-frame"
import {
  type OrderPaymentMethod,
  type OverviewOrder,
  PAYMENT_METHODS,
  canFulfilLine,
  formatQuantity,
  lineDetail,
  lineTitle,
  readyLines,
} from "./order-overview-model"

type DialogProps = {
  order: OverviewOrder
  onClose: () => void
  onDone: () => Promise<void>
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              value === option.value &&
                "border-primary bg-primary/10 hover:bg-primary/15",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Record a payment against the balance, or pay money back (refund). */
export function PaymentDialog({
  order,
  type,
  refundableMinor = 0,
  onClose,
  onDone,
}: DialogProps & { type: "payment" | "refund"; refundableMinor?: number }) {
  const trpc = useTRPC()
  const refund = type === "refund"
  const limit = refund ? refundableMinor : order.balanceDueMinor
  const [amount, setAmount] = useState(minorToMajorInput(limit))
  const [method, setMethod] = useState<OrderPaymentMethod>("cash")
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const clientPaymentId = useRef(`${type}-${crypto.randomUUID()}`).current
  const record = useMutation(
    trpc.orders.recordPayment.mutationOptions({
      onSuccess: async () => {
        await onDone()
        onClose()
      },
    }),
  )
  const amountMinor = majorToMinor(amount)
  const money = (value: number) => orderMoney(value, order.currencyCode)
  const problem =
    amountMinor === null || amountMinor <= 0
      ? "Enter an amount."
      : amountMinor > limit
        ? refund
          ? `You can refund up to ${money(limit)}.`
          : `The balance due is ${money(limit)}.`
        : null
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={record.isPending}
      title={refund ? "Refund" : "Record payment"}
      description={
        refund
          ? `Money paid back to the customer. ${money(refundableMinor)} has been paid on ${order.orderNumber}.`
          : `${money(order.balanceDueMinor)} is due on ${order.orderNumber}.`
      }
    >
      <DialogField
        label="Amount"
        htmlFor="order-payment-amount"
        hint={amount && problem ? problem : undefined}
      >
        <MoneyInput
          id="order-payment-amount"
          currencyCode={order.currencyCode}
          value={amount}
          disabled={record.isPending}
          onChange={(event) => setAmount(event.target.value)}
        />
      </DialogField>
      <Choice
        label={refund ? "Paid back by" : "Paid by"}
        value={method}
        options={PAYMENT_METHODS}
        onChange={setMethod}
        disabled={record.isPending}
      />
      {method !== "cash" ? (
        <DialogField
          label="Reference (optional)"
          htmlFor="order-payment-reference"
        >
          <Input
            id="order-payment-reference"
            maxLength={160}
            placeholder="Transfer or receipt number"
            value={reference}
            disabled={record.isPending}
            onChange={(event) => setReference(event.target.value)}
          />
        </DialogField>
      ) : null}
      {refund ? (
        <ReasonField
          value={reason}
          onChange={setReason}
          chips={["Item returned", "Overpaid", "Order cancelled", "Goodwill"]}
          disabled={record.isPending}
        />
      ) : null}
      <MutationError message={record.isError ? record.error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={record.isPending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={refund ? "destructive" : "default"}
          disabled={
            Boolean(problem) || (refund && !reason.trim()) || record.isPending
          }
          onClick={() =>
            amountMinor &&
            record.mutate({
              orderId: order.id,
              amountMinor,
              clientPaymentId,
              method,
              reference: reference.trim() || undefined,
              note: refund ? reason.trim() : undefined,
              type,
            })
          }
        >
          {record.isPending
            ? "Saving…"
            : problem
              ? refund
                ? "Refund"
                : "Record payment"
              : `${refund ? "Refund" : "Record"} ${money(amountMinor ?? 0)}`}
        </Button>
      </div>
    </OrderDialog>
  )
}

const DISPOSITIONS = [
  { value: "restock", label: "Back to stock" },
  { value: "damaged", label: "Damaged" },
  { value: "quarantine", label: "Set aside to check" },
  { value: "no_restock", label: "Don’t restock" },
] as const

type Disposition = (typeof DISPOSITIONS)[number]["value"]

/** Take items back from the customer. Money is refunded separately. */
export function ReturnDialog({
  order,
  returnable,
  initialLineId,
  onClose,
  onDone,
}: DialogProps & {
  returnable: Array<{ orderLineId: string; quantity: string }>
  initialLineId?: string
}) {
  const trpc = useTRPC()
  const first =
    returnable.find((row) => row.orderLineId === initialLineId) ?? returnable[0]
  const [lineId, setLineId] = useState(first?.orderLineId ?? "")
  const [quantity, setQuantity] = useState(
    first ? formatQuantity(first.quantity) : "",
  )
  const [disposition, setDisposition] = useState<Disposition>("restock")
  const [reason, setReason] = useState("")
  const clientReturnId = useRef(`return-${crypto.randomUUID()}`).current
  const save = useMutation(
    trpc.orders.returnProductLine.mutationOptions({
      onSuccess: async () => {
        await onDone()
        onClose()
      },
    }),
  )
  const selected = returnable.find((row) => row.orderLineId === lineId)
  const max = selected ? Number(selected.quantity) : 0
  const problem =
    !/^\d{1,12}(\.\d{1,6})?$/.test(quantity.trim()) || Number(quantity) <= 0
      ? "Enter how many came back."
      : Number(quantity) > max
        ? `Only ${formatQuantity(selected?.quantity ?? "0")} was handed over.`
        : null
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={save.isPending}
      title="Return an item"
      description="Records items the customer brought back. Money isn’t refunded automatically — use Refund if you pay them back."
    >
      <fieldset className="grid gap-2" disabled={save.isPending}>
        <legend className="mb-2 text-sm font-medium">Item</legend>
        {returnable.map((row) => {
          const line = order.lines.find((item) => item.id === row.orderLineId)
          return (
            <label
              key={row.orderLineId}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3",
                lineId === row.orderLineId && "border-primary bg-primary/5",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="radio"
                  name="return-line"
                  checked={lineId === row.orderLineId}
                  onChange={() => {
                    setLineId(row.orderLineId)
                    setQuantity(formatQuantity(row.quantity))
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {line ? lineTitle(line) : "Item"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {line ? lineDetail(line) : null}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatQuantity(row.quantity)} handed over
              </span>
            </label>
          )
        })}
      </fieldset>
      <DialogField
        label="Quantity returned"
        htmlFor="order-return-quantity"
        hint={quantity && problem ? problem : undefined}
      >
        <Input
          id="order-return-quantity"
          inputMode="decimal"
          value={quantity}
          disabled={save.isPending}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </DialogField>
      <Choice
        label="What happens to it"
        value={disposition}
        options={DISPOSITIONS}
        onChange={setDisposition}
        disabled={save.isPending}
      />
      <ReasonField
        value={reason}
        onChange={setReason}
        chips={["Damaged", "Wrong item", "Customer changed mind", "Expired"]}
        disabled={save.isPending}
      />
      <MutationError message={save.isError ? save.error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={
            !selected || Boolean(problem) || !reason.trim() || save.isPending
          }
          onClick={() =>
            save.mutate({
              clientReturnId,
              orderLineId: lineId,
              quantity: quantity.trim(),
              disposition,
              reason: reason.trim(),
              schemaVersion: 1,
            })
          }
        >
          {save.isPending ? "Saving…" : "Record return"}
        </Button>
      </div>
    </OrderDialog>
  )
}

/** Confirm handing over one line, or every ready line. */
export function FulfilDialog({
  order,
  lineId,
  onClose,
  onDone,
}: DialogProps & { lineId?: string }) {
  const trpc = useTRPC()
  const clientOperationId = useRef(`fulfilment-${crypto.randomUUID()}`).current
  const options = {
    onSuccess: async () => {
      await onDone()
      onClose()
    },
  }
  const one = useMutation(
    trpc.orders.fulfillProductLine.mutationOptions(options),
  )
  const all = useMutation(trpc.orders.fulfillProducts.mutationOptions(options))
  const lines = lineId
    ? order.lines.filter((line) => line.id === lineId && canFulfilLine(line))
    : readyLines(order)
  const pending = one.isPending || all.isPending
  const error = one.error ?? all.error
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={pending}
      title={lineId ? "Fulfil this item" : "Fulfil all ready items"}
      description="Records the items as handed over and moves the stock. Confirm only when they are ready."
    >
      <ul className="grid gap-2">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
          >
            <span className="min-w-0">
              <span className="block font-medium">{lineTitle(line)}</span>
              <span className="block text-xs text-muted-foreground">
                {lineDetail(line)}
              </span>
            </span>
            <span className="shrink-0">× {formatQuantity(line.quantity)}</span>
          </li>
        ))}
      </ul>
      <MutationError message={error ? error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!lines.length || pending}
          onClick={() =>
            lineId
              ? one.mutate({
                  clientOperationId,
                  orderLineId: lineId,
                  schemaVersion: 1,
                })
              : all.mutate({
                  clientOperationId,
                  orderId: order.id,
                  schemaVersion: 1,
                })
          }
        >
          {pending
            ? "Recording…"
            : lineId
              ? "Confirm fulfilment"
              : `Fulfil ${lines.length} ${lines.length === 1 ? "item" : "items"}`}
        </Button>
      </div>
    </OrderDialog>
  )
}
