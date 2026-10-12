"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Input, MoneyInput, cn } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import {
  InformationCircleIcon,
  MinusSignIcon,
  PackageIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation } from "@tanstack/react-query"
import { type ReactNode, useRef, useState } from "react"
import { orderMoney } from "../order-draft"
import {
  OrderPaymentAccount,
  originalReceipt,
  useOrderPaymentAccountChoice,
} from "../order-payment-account"
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
import { LockedReason } from "./order-overview-parts"

type DialogProps = {
  order: OverviewOrder
  onClose: () => void
  onDone: () => Promise<void>
}

type Option = { allowed: boolean; reason: string | null }

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T | null
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>
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
            disabled={option.disabled}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
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

/** Before → after rows the person sees before confirming money back. */
function Outcome({
  title,
  tone,
  rows,
}: {
  title?: string
  tone: "amber" | "mint"
  rows: Array<{ label: string; before?: string; after: string; big?: boolean }>
}) {
  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-lg border p-3 text-sm",
        tone === "amber"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      {title ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />
          {title}
        </p>
      ) : null}
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-3",
            row.big && "border-t border-border pt-1.5 text-base font-semibold",
          )}
        >
          <span className={row.big ? undefined : "text-muted-foreground"}>
            {row.label}
          </span>
          <span className="tabular-nums">
            {row.before && row.before !== row.after ? (
              <>
                <s className="text-muted-foreground">{row.before}</s> →{" "}
              </>
            ) : null}
            <b className="font-semibold">{row.after}</b>
          </span>
        </div>
      ))}
    </div>
  )
}

function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: "rose" | "sky"
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        tone === "rose"
          ? "border-red-500/30 bg-red-500/5"
          : "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  )
}

/** Record a payment against the balance due. */
export function PaymentDialog({ order, onClose, onDone }: DialogProps) {
  const trpc = useTRPC()
  const limit = order.balanceDueMinor
  const [amount, setAmount] = useState(minorToMajorInput(limit))
  const [method, setMethod] = useState<OrderPaymentMethod>("cash")
  const [reference, setReference] = useState("")
  const account = useOrderPaymentAccountChoice({ method })
  const clientPaymentId = useRef(`payment-${crypto.randomUUID()}`).current
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
  const amountProblem =
    amountMinor === null || amountMinor <= 0
      ? "Enter an amount."
      : amountMinor > limit
        ? `The balance due is ${money(limit)}.`
        : null
  const problem = amountProblem ?? account.problem
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={record.isPending}
      title="Record payment"
      description={`${money(order.balanceDueMinor)} is due on ${order.orderNumber}.`}
    >
      <DialogField
        label="Amount"
        htmlFor="order-payment-amount"
        hint={amount && amountProblem ? amountProblem : undefined}
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
        label="Paid by"
        value={method}
        options={PAYMENT_METHODS}
        onChange={setMethod}
        disabled={record.isPending}
      />
      <OrderPaymentAccount choice={account} disabled={record.isPending} />
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
          disabled={Boolean(problem) || record.isPending}
          onClick={() =>
            amountMinor &&
            record.mutate({
              orderId: order.id,
              amountMinor,
              clientPaymentId,
              method,
              moneyAccountId: account.payloadAccountId,
              reference: reference.trim() || undefined,
            })
          }
        >
          {record.isPending
            ? "Saving…"
            : problem
              ? "Record payment"
              : `Record ${money(amountMinor ?? 0)}`}
        </Button>
      </div>
    </OrderDialog>
  )
}

const REFUND_REASONS = [
  { value: "overcharged", label: "Overcharged" },
  { value: "items", label: "Items came back" },
  { value: "goodwill", label: "Goodwill" },
  { value: "other", label: "Other" },
] as const

type RefundReason = (typeof REFUND_REASONS)[number]["value"]

/**
 * Money back with the outcome shown first (design 02 "Amount + outcome").
 * "Overcharged" also lowers the total, so nothing shows as owed afterwards.
 */
export function RefundDialog({
  order,
  credit,
  canReturn,
  onOpenReturn,
  onClose,
  onDone,
}: DialogProps & {
  /** Whether the total may drop with the refund (an order credit). */
  credit: Option
  canReturn: boolean
  onOpenReturn: () => void
}) {
  const trpc = useTRPC()
  const paid = order.amountPaidMinor
  const money = (value: number) => orderMoney(value, order.currencyCode)
  const [share, setShare] = useState<"all" | "half" | "other">("all")
  const [other, setOther] = useState("")
  const original = originalReceipt(order.payments)
  const [method, setMethod] = useState<OrderPaymentMethod>(
    original.method ?? "cash",
  )
  const [reference, setReference] = useState("")
  const account = useOrderPaymentAccountChoice({
    method,
    refund: true,
    suggestedAccountId: original.moneyAccountId,
  })
  const [why, setWhy] = useState<RefundReason | null>(null)
  const [ownReason, setOwnReason] = useState("")
  const clientOperationId = useRef(`refund-${crypto.randomUUID()}`).current
  const refund = useMutation(
    trpc.orders.refund.mutationOptions({
      onSuccess: async () => {
        await onDone()
        onClose()
      },
    }),
  )
  const amountMinor =
    share === "all"
      ? paid
      : share === "half"
        ? Math.round(paid / 2)
        : (majorToMinor(other) ?? 0)
  const lowerTotal = why === "overcharged"
  const paidAfter = paid - amountMinor
  const totalAfter = lowerTotal
    ? order.totalMinor - amountMinor
    : order.totalMinor
  const stillDue = Math.max(0, totalAfter - paidAfter)
  const reason =
    why === "other"
      ? ownReason.trim()
      : (REFUND_REASONS.find((row) => row.value === why)?.label ?? "")
  const amountProblem =
    amountMinor <= 0
      ? "Enter an amount."
      : amountMinor > paid
        ? `You can refund up to ${money(paid)}.`
        : lowerTotal && amountMinor > order.totalMinor
          ? `The total is ${money(order.totalMinor)}.`
          : null
  const problem = amountProblem ?? account.problem
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={refund.isPending}
      title="Refund"
      description={`Paid so far ${money(paid)} · total ${money(order.totalMinor)}`}
    >
      <Choice
        label="How much goes back?"
        value={share}
        options={[
          { value: "all", label: `All ${money(paid)}` },
          { value: "half", label: "Half" },
          { value: "other", label: "Other amount" },
        ]}
        onChange={setShare}
        disabled={refund.isPending}
      />
      {share === "other" ? (
        <DialogField
          label="Amount"
          htmlFor="order-refund-amount"
          hint={other && amountProblem ? amountProblem : undefined}
        >
          <MoneyInput
            id="order-refund-amount"
            currencyCode={order.currencyCode}
            value={other}
            disabled={refund.isPending}
            onChange={(event) => setOther(event.target.value)}
          />
        </DialogField>
      ) : null}
      <Choice
        label="Paid back by"
        value={method}
        options={PAYMENT_METHODS}
        onChange={setMethod}
        disabled={refund.isPending}
      />
      <OrderPaymentAccount
        label="Paid back from"
        choice={account}
        disabled={refund.isPending}
      />
      {method !== "cash" ? (
        <DialogField
          label="Reference (optional)"
          htmlFor="order-refund-reference"
        >
          <Input
            id="order-refund-reference"
            maxLength={160}
            placeholder="Transfer or receipt number"
            value={reference}
            disabled={refund.isPending}
            onChange={(event) => setReference(event.target.value)}
          />
        </DialogField>
      ) : null}
      <div className="grid gap-2">
        <Choice
          label="Reason"
          value={why}
          options={REFUND_REASONS.map((row) => ({
            ...row,
            disabled: row.value === "overcharged" && !credit.allowed,
          }))}
          onChange={setWhy}
          disabled={refund.isPending}
        />
        {!credit.allowed && credit.reason ? (
          <LockedReason
            reason={`Overcharged (lower the total): ${credit.reason}`}
            wrap
          />
        ) : null}
        {why === "other" ? (
          <Input
            aria-label="Your reason"
            maxLength={500}
            placeholder="Write the reason"
            value={ownReason}
            disabled={refund.isPending}
            onChange={(event) => setOwnReason(event.target.value)}
          />
        ) : null}
      </div>
      {why === "items" && canReturn ? (
        <Notice
          tone="sky"
          title="Use Return items instead"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenReturn}
            >
              Open
            </Button>
          }
        >
          It puts the stock back and works out the money from what came back.
        </Notice>
      ) : null}
      <Outcome
        title="What the order shows after"
        tone="amber"
        rows={[
          { label: "Paid", before: money(paid), after: money(paidAfter) },
          {
            label: "Total",
            before: money(order.totalMinor),
            after: money(totalAfter),
          },
          { label: "Still to collect", after: money(stillDue), big: true },
        ]}
      />
      {!lowerTotal && stillDue > 0 && !amountProblem ? (
        <Notice tone="rose" title={`${money(stillDue)} will show as owed`}>
          {credit.allowed
            ? "Choose “Overcharged” if the price was wrong, so the total drops too."
            : "The total stays the same, so the order asks for this again."}
        </Notice>
      ) : null}
      <MutationError message={refund.isError ? refund.error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={refund.isPending}
          onClick={onClose}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={Boolean(problem) || !reason || refund.isPending}
          onClick={() =>
            refund.mutate({
              orderId: order.id,
              clientOperationId,
              amountMinor,
              method,
              moneyAccountId: account.payloadAccountId,
              reference: reference.trim() || undefined,
              reason,
              lowerTotal,
            })
          }
        >
          {refund.isPending
            ? "Saving…"
            : `Refund ${money(Math.max(0, amountMinor))}`}
        </Button>
      </div>
    </OrderDialog>
  )
}

const CONDITIONS = [
  { value: "restock", label: "Back on shelf" },
  { value: "quarantine", label: "Set aside" },
  { value: "damaged", label: "Damaged" },
  { value: "no_restock", label: "Not restocked" },
] as const

type Condition = (typeof CONDITIONS)[number]["value"]

const QUANTITY = /^\d{1,12}(\.\d{1,6})?$/

/**
 * Items back, several lines at once, with one switch to give the returned
 * value back (design 02 "All lines + money"). The switch starts on whenever
 * a credit is allowed, as on mobile.
 */
export function ReturnItemsDialog({
  order,
  returnable,
  credit,
  initialLineId,
  onClose,
  onDone,
}: DialogProps & {
  returnable: Array<{ orderLineId: string; quantity: string }>
  /** Whether money may go back with the return (an order credit). */
  credit: Option
  initialLineId?: string
}) {
  const trpc = useTRPC()
  const money = (value: number) => orderMoney(value, order.currencyCode)
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      returnable.map((row) => [
        row.orderLineId,
        row.orderLineId === initialLineId ? formatQuantity(row.quantity) : "0",
      ]),
    ),
  )
  const [conditions, setConditions] = useState<Record<string, Condition>>({})
  const [moneyChoice, setMoneyChoice] = useState<boolean | null>(null)
  const original = originalReceipt(order.payments)
  const [method, setMethod] = useState<OrderPaymentMethod>(
    original.method ?? "cash",
  )
  const [reference, setReference] = useState("")
  const account = useOrderPaymentAccountChoice({
    method,
    refund: true,
    suggestedAccountId: original.moneyAccountId,
  })
  const [reason, setReason] = useState("")
  const clientOperationId = useRef(`return-${crypto.randomUUID()}`).current
  const save = useMutation(
    trpc.orders.returnItems.mutationOptions({
      onSuccess: async () => {
        await onDone()
        onClose()
      },
    }),
  )
  const rows = returnable.flatMap((row) => {
    const line = order.lines.find((item) => item.id === row.orderLineId)
    if (!line) return []
    const text = counts[row.orderLineId] ?? "0"
    const valid = QUANTITY.test(text.trim())
    const count = valid ? Number(text) : Number.NaN
    const max = Number(row.quantity)
    const sold = Number(line.quantity)
    return [
      {
        line,
        max,
        text,
        count,
        invalid: !valid || count > max,
        value:
          valid && count > 0 && sold > 0
            ? Math.round((line.totalMinor * count) / sold)
            : 0,
        condition: conditions[row.orderLineId] ?? ("restock" as Condition),
      },
    ]
  })
  const chosen = rows.filter((row) => !row.invalid && row.count > 0)
  const invalid = rows.some((row) => row.invalid)
  const value = Math.min(
    order.totalMinor,
    chosen.reduce((sum, row) => sum + row.value, 0),
  )
  // The server refuses a credit of ₦0: the total is already ₦0 (say, after a
  // full "Overcharged" refund) or the chosen items carry no value.
  const nothingToCredit =
    order.totalMinor <= 0 || (chosen.length > 0 && value <= 0)
  const giveMoney = credit.allowed && !nothingToCredit && (moneyChoice ?? true)
  const totalAfter = order.totalMinor - value
  const refundNow = Math.max(0, order.amountPaidMinor - totalAfter)
  const stillDue = Math.max(0, totalAfter - (order.amountPaidMinor - refundNow))
  // Nothing paid comes back: the credit only lowers what they still owe.
  const takeOff = giveMoney && chosen.length > 0 && refundNow === 0
  const stockBack = chosen
    .filter((row) => row.condition === "restock")
    .map(
      (row) => `${formatQuantity(String(row.count))} × ${lineTitle(row.line)}`,
    )
  const setCount = (orderLineId: string, next: string) =>
    setCounts((current) => ({ ...current, [orderLineId]: next }))
  const step = (row: (typeof rows)[number], by: number) =>
    setCount(
      row.line.id,
      formatQuantity(
        String(
          Math.min(
            row.max,
            Math.max(0, (Number.isNaN(row.count) ? 0 : row.count) + by),
          ),
        ),
      ),
    )
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={save.isPending}
      title="Items came back"
      description="Set how many of each came back."
    >
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li
            key={row.line.id}
            className={cn(
              "grid gap-2 rounded-lg border border-border p-3",
              row.count > 0 && !row.invalid
                ? "border-primary/40 bg-primary/5"
                : "opacity-80",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{lineTitle(row.line)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatQuantity(String(row.max))} handed over
                  {row.line.unitPriceMinor === null
                    ? ""
                    : ` · ${money(row.line.unitPriceMinor)} each`}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums">
                {row.value ? money(row.value) : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`One less ${lineTitle(row.line)}`}
                disabled={save.isPending || !(row.count > 0)}
                onClick={() => step(row, -1)}
              >
                <HugeiconsIcon icon={MinusSignIcon} className="size-4" />
              </Button>
              <Input
                aria-label={`${lineTitle(row.line)} returned`}
                inputMode="decimal"
                className="h-8 w-20 text-center tabular-nums"
                value={row.text}
                disabled={save.isPending}
                onChange={(event) => setCount(row.line.id, event.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                / {formatQuantity(String(row.max))}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`One more ${lineTitle(row.line)}`}
                disabled={save.isPending || row.count >= row.max}
                onClick={() => step(row, 1)}
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
              </Button>
            </div>
            {row.invalid ? (
              <p className="text-xs text-red-700 dark:text-red-300">
                Up to {formatQuantity(String(row.max))} can come back.
              </p>
            ) : null}
            {row.count > 0 && !row.invalid ? (
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((condition) => (
                  <button
                    key={condition.value}
                    type="button"
                    aria-pressed={row.condition === condition.value}
                    disabled={save.isPending}
                    className={cn(
                      "rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                      row.condition === condition.value &&
                        "border-primary bg-primary/10 hover:bg-primary/15",
                    )}
                    onClick={() =>
                      setConditions((current) => ({
                        ...current,
                        [row.line.id]: condition.value,
                      }))
                    }
                  >
                    {condition.label}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <label
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-border p-3",
          (!credit.allowed || nothingToCredit) && "opacity-70",
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {takeOff ? "Take it off what they owe" : "Give money back now"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {!credit.allowed && credit.reason ? (
              <LockedReason reason={credit.reason} wrap />
            ) : nothingToCredit ? (
              order.totalMinor <= 0 ? (
                `Nothing left to credit: the total is already ${money(0)}`
              ) : (
                "These items have no value to credit"
              )
            ) : !giveMoney ? (
              "Stock only, no money"
            ) : !chosen.length ? (
              "Choose what came back first"
            ) : takeOff ? (
              `Takes ${money(value)} off what they owe`
            ) : (
              `${money(refundNow)} back to the customer`
            )}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={giveMoney}
          className="size-5 accent-[var(--primary)]"
          checked={giveMoney}
          disabled={!credit.allowed || nothingToCredit || save.isPending}
          onChange={(event) => setMoneyChoice(event.target.checked)}
        />
      </label>
      {giveMoney && refundNow > 0 ? (
        <>
          <Choice
            label="Paid back by"
            value={method}
            options={PAYMENT_METHODS}
            onChange={setMethod}
            disabled={save.isPending}
          />
          <OrderPaymentAccount
            label="Paid back from"
            choice={account}
            disabled={save.isPending}
          />
          {method !== "cash" ? (
            <DialogField
              label="Reference (optional)"
              htmlFor="order-return-reference"
            >
              <Input
                id="order-return-reference"
                maxLength={160}
                placeholder="Transfer or receipt number"
                value={reference}
                disabled={save.isPending}
                onChange={(event) => setReference(event.target.value)}
              />
            </DialogField>
          ) : null}
        </>
      ) : null}
      {giveMoney && chosen.length ? (
        <Outcome
          tone="mint"
          rows={[
            { label: "Returned value", after: money(value) },
            {
              label: "Total",
              before: money(order.totalMinor),
              after: money(totalAfter),
            },
            ...(takeOff
              ? []
              : [{ label: "Refund now", after: money(refundNow) }]),
            {
              label: "Still to collect",
              after: money(stillDue),
              big: true,
            },
          ]}
        />
      ) : null}
      <ReasonField
        value={reason}
        onChange={setReason}
        chips={["Customer returned it", "Wrong item", "Damaged"]}
        disabled={save.isPending}
      />
      {chosen.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon icon={PackageIcon} className="size-4 shrink-0" />
          <span>
            Stock back:{" "}
            <b className="font-medium text-foreground">
              {stockBack.join(", ") || "None"}
            </b>{" "}
            · Money back:{" "}
            <b className="font-medium text-foreground">
              {giveMoney && refundNow > 0 ? money(refundNow) : "None"}
            </b>
          </span>
        </p>
      ) : null}
      <MutationError message={save.isError ? save.error.message : null} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={save.isPending}
          onClick={onClose}
        >
          Back
        </Button>
        <Button
          type="button"
          disabled={
            !chosen.length ||
            invalid ||
            !reason.trim() ||
            (giveMoney && refundNow > 0 && Boolean(account.problem)) ||
            save.isPending
          }
          onClick={() =>
            save.mutate({
              orderId: order.id,
              clientOperationId,
              reason: reason.trim(),
              lines: chosen.map((row) => ({
                orderLineId: row.line.id,
                quantity: row.text.trim(),
                disposition: row.condition,
              })),
              money: giveMoney
                ? {
                    method,
                    moneyAccountId:
                      refundNow > 0 ? account.payloadAccountId : undefined,
                    reference:
                      refundNow > 0 ? reference.trim() || undefined : undefined,
                  }
                : null,
            })
          }
        >
          {save.isPending
            ? "Saving…"
            : !giveMoney || !chosen.length
              ? "Record return"
              : takeOff
                ? `Return and take off ${money(value)}`
                : `Return and refund ${money(refundNow)}`}
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
