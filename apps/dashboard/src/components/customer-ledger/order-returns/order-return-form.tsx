"use client"
import {
  OrderPaymentAccount,
  originalReceipt,
  useOrderPaymentAccountChoice,
} from "@/components/orders/order-payment-account"
import {
  DialogField,
  OrderDialog,
} from "@/components/orders/overview/order-dialog-frame"
import {
  type OrderPaymentMethod,
  type OverviewOrder,
  PAYMENT_METHODS,
} from "@/components/orders/overview/order-overview-model"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  ControlField,
  Input,
  MoneyInput,
  SelectControl,
  Switch,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { Wallet01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { RefundCommandStatus } from "../refunds/refund-command-status"
import {
  type AvailableOrderReturn,
  minorToMajorText,
  orderReturnCommandRevision,
  orderReturnConfirmationKey,
  orderReturnDraft,
} from "./order-return-model"

const dateFormat = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

/**
 * Banking02 v18 "Review original payment sources": held credit goes back to
 * the allocation it came from, collected money is returned separately, and
 * nothing is saved until the exact amounts are confirmed. The Order total
 * stays the same; a wrong price uses the existing refund.
 */
export function OrderReturnForm({
  review,
  order,
  actorUserId,
  tenantId,
  canReturn,
  onOpenReturn,
  onOrdinary,
  onPin,
  onRefresh,
  onClose,
  onDone,
}: {
  review: AvailableOrderReturn
  order: OverviewOrder
  actorUserId: string
  tenantId: string
  canReturn: boolean
  onOpenReturn: () => void
  /** Use the existing refund (price was wrong). */
  onOrdinary: () => void
  /** Keep this review while a submission and its recovery are on screen. */
  onPin: () => void
  onRefresh: () => void
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const command = useCustomerLedgerCommand({
    actorUserId,
    tenantId,
    bookId: review.bookId,
    accountId: review.accountId,
  })
  const returnFunds = useMutation(
    trpc.customerLedger.returnOrderFunds.mutationOptions(),
  )
  const money = (minor: string) =>
    formatFinanceMoney(minor, review.currencyCode)
  // The server's remaining amounts are the starting proposal, never more.
  const [credit, setCredit] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      review.creditSources.map((source) => [
        source.allocationId,
        minorToMajorText(source.remainingMinor),
      ]),
    ),
  )
  const cashHeld = BigInt(review.ordinaryCashMaxMinor) > BigInt(0)
  const [cashOn, setCashOn] = useState(cashHeld)
  const [cash, setCash] = useState(() =>
    cashHeld ? minorToMajorText(review.ordinaryCashMaxMinor) : "",
  )
  const original = originalReceipt(order.payments)
  const [method, setMethod] = useState<OrderPaymentMethod>(
    original.method ?? "cash",
  )
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null)
  const account = useOrderPaymentAccountChoice({
    method,
    refund: true,
    suggestedAccountId: original.moneyAccountId,
    enabled: cashOn,
  })
  const draft = orderReturnDraft(
    {
      bookId: review.bookId,
      accountId: review.accountId,
      expectedRevision: orderReturnCommandRevision(
        review.accountRevision,
        command.retained?.command ?? null,
      ),
      orderId: review.orderId,
      storeId: review.storeId,
      currencyCode: review.currencyCode,
    },
    {
      reason,
      credit: review.creditSources.map((source) => ({
        allocationId: source.allocationId,
        entered: credit[source.allocationId] ?? "",
        capMinor: source.remainingMinor,
      })),
      cash: cashOn
        ? {
            entered: cash,
            capMinor: review.ordinaryCashMaxMinor,
            method,
            reference: method === "cash" ? "" : reference,
            moneyAccountId: account.payloadAccountId,
          }
        : null,
    },
  )
  const problems = draft.kind === "invalid" ? draft.problems : {}
  const accountProblem = cashOn
    ? account.book?.id !== review.bookId
      ? "Check the money accounts for this Order’s currency in Finance."
      : account.problem
    : null
  const key =
    draft.kind === "ready" && !accountProblem
      ? orderReturnConfirmationKey(draft.payload)
      : null
  // Confirmation belongs to these exact amounts; any edit clears it.
  const confirmed = key !== null && confirmedKey === key
  const locked = command.pending || command.saved
  const creditMinor = draft.kind === "ready" ? draft.creditMinor : "0"
  const cashMinor = draft.kind === "ready" ? draft.cashMinor : "0"
  const paidBy = PAYMENT_METHODS.find(
    (row) => row.value === original.method,
  )?.label.toLowerCase()

  async function submit() {
    if (draft.kind !== "ready" || !confirmed || locked || !command.ready) return
    const payload = draft.payload
    onPin()
    const saved = await command.run("returnOrderFunds", payload, (id) =>
      returnFunds.mutateAsync({ ...payload, clientCommandId: id }),
    )
    if (!saved) return
    // Saved: refreshing the Order's credit row and the Order may fail
    // without ever sending the return again.
    await client
      .invalidateQueries({
        queryKey: trpc.businessBanking.orderCustomerFunds.pathKey(),
      })
      .catch(() => undefined)
    await onDone().catch(() => undefined)
  }

  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={command.pending}
      title="Refund"
      description="Review original payment sources"
    >
      <dl className="divide-y divide-border overflow-hidden rounded-md border border-border text-sm">
        <Row
          label="Order paid with held credit"
          value={money(review.creditMaxMinor)}
        />
        <Row
          label={
            paidBy
              ? `Order paid by ${paidBy}`
              : "Order paid with money received"
          }
          value={money(review.ordinaryCashRemainingMinor)}
        />
        <Row
          label="Proposed credit restoration"
          value={draft.kind === "ready" ? money(creditMinor) : "Review below"}
        />
        <Row
          label="Proposed cash refund"
          value={draft.kind === "ready" ? money(cashMinor) : "Review below"}
        />
      </dl>
      <div className="flex gap-2 rounded-md bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <HugeiconsIcon icon={Wallet01Icon} className="mt-0.5 size-4 shrink-0" />
        <p>
          Restore credit through the original allocation source. Return bank
          money through the original eligible payment. Never restore and pay out
          the same value.
        </p>
      </div>
      <fieldset className="grid gap-3" disabled={locked}>
        <legend className="mb-2 text-sm font-medium">
          Back to customer credit
        </legend>
        {review.creditSources.map((source) => (
          <DialogField
            key={source.allocationId}
            label={`${source.sourceKind === "UNBILLED" ? "Credit held for this Order" : "Credit used on this Order"} · ${dateFormat.format(source.effectiveAt)}`}
            htmlFor={`order-return-${source.allocationId}`}
            hint={
              problems[source.allocationId] ??
              `Up to ${money(source.remainingMinor)} goes back to the customer’s credit.`
            }
          >
            <MoneyInput
              id={`order-return-${source.allocationId}`}
              currencyCode={review.currencyCode}
              value={credit[source.allocationId] ?? ""}
              onChange={(event) =>
                setCredit((current) => ({
                  ...current,
                  [source.allocationId]: event.target.value,
                }))
              }
            />
          </DialogField>
        ))}
      </fieldset>
      {cashHeld ? (
        <fieldset className="grid gap-3" disabled={locked}>
          <div className="flex items-center justify-between gap-4">
            <span id="order-return-cash-on" className="text-sm font-medium">
              Also return money received
            </span>
            <Switch
              aria-labelledby="order-return-cash-on"
              checked={cashOn}
              onCheckedChange={(checked) => setCashOn(checked === true)}
            />
          </div>
          {cashOn ? (
            <>
              <DialogField
                label="Amount paid back"
                htmlFor="order-return-cash"
                hint={
                  problems.cash ??
                  `Up to ${money(review.ordinaryCashMaxMinor)}. Customer credit is never paid out as cash.`
                }
              >
                <MoneyInput
                  id="order-return-cash"
                  currencyCode={review.currencyCode}
                  value={cash}
                  onChange={(event) => setCash(event.target.value)}
                />
              </DialogField>
              <ControlField label="Paid back by">
                <SelectControl<OrderPaymentMethod>
                  aria-label="Paid back by"
                  value={method}
                  onValueChange={setMethod}
                  options={PAYMENT_METHODS.map((row) => ({
                    value: row.value,
                    label: row.label,
                  }))}
                />
              </ControlField>
              <OrderPaymentAccount
                label="Paid back from"
                choice={account}
                disabled={locked}
              />
              {method === "cash" ? null : (
                <DialogField
                  label="Reference (optional)"
                  htmlFor="order-return-reference"
                >
                  <Input
                    id="order-return-reference"
                    maxLength={160}
                    placeholder="Transfer or receipt number"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </DialogField>
              )}
            </>
          ) : null}
        </fieldset>
      ) : null}
      <DialogField
        label="Reason"
        htmlFor="order-return-reason"
        hint={reason ? problems.reason : undefined}
      >
        <Input
          id="order-return-reason"
          maxLength={400}
          placeholder="Why the money goes back"
          value={reason}
          disabled={locked}
          onChange={(event) => setReason(event.target.value)}
        />
      </DialogField>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        The Order total stays the same.
        {canReturn ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={locked}
            onClick={onOpenReturn}
          >
            Items came back?
          </Button>
        ) : null}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          disabled={locked}
          onClick={onOrdinary}
        >
          Price was wrong?
        </Button>
      </p>
      <div className="flex items-start justify-between gap-4 border border-border px-3 py-2.5">
        <span className="grid gap-0.5">
          <span id="order-return-confirm" className="text-sm font-medium">
            {key
              ? `Restore ${money(creditMinor)} to credit${cashMinor === "0" ? "" : ` and record ${money(cashMinor)} paid back`}`
              : "Check the amounts above"}
          </span>
          <span className="text-xs text-muted-foreground">
            {accountProblem ??
              (draft.kind === "invalid" && draft.empty
                ? "Choose credit to restore or money to return."
                : cashMinor !== "0"
                  ? "I have already paid back the cash amount shown. Credit goes back to its original source."
                  : "Credit goes back to its original source; no cash is paid out.")}
          </span>
        </span>
        <Switch
          aria-labelledby="order-return-confirm"
          checked={confirmed}
          disabled={key === null || locked}
          onCheckedChange={(checked) =>
            setConfirmedKey(checked === true ? key : null)
          }
        />
      </div>
      {command.retained && command.error ? (
        <p role="alert" className="text-sm text-destructive">
          {command.error}
        </p>
      ) : null}
      <RefundCommandStatus
        command={{
          ...command,
          // Resolve the saved identity before replacing the original review.
          error: command.retained ? null : command.error,
          acknowledge: async () => {
            onPin()
            await command.acknowledge()
          },
        }}
        onRefresh={onRefresh}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={command.pending}
          onClick={onClose}
        >
          {command.saved ? "Done" : "Back"}
        </Button>
        {command.saved ? null : (
          <Button
            type="button"
            variant="destructive"
            disabled={!confirmed || !command.ready || command.pending}
            onClick={() => void submit()}
          >
            {command.pending ? "Saving…" : "Return to original sources"}
          </Button>
        )}
      </div>
    </OrderDialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
