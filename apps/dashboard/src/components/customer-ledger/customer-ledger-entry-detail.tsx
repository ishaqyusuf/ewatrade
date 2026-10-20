"use client"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { AllocationHistory } from "./allocation-history"
import {
  type LedgerAccount,
  formatLedgerDate,
  ledgerLabels,
  paymentMethodLabels,
} from "./types"

const AMOUNT_NOTE: Record<string, string> = {
  ORDER_CHARGE: "Charged",
  RECEIPT: "Paid",
  REFUND: "Returned to the customer",
  OPENING_DEBT: "Owed before you started using ewatrade",
  OPENING_CREDIT: "Paid ahead before you started using ewatrade",
  REVERSAL: "Undoes an earlier entry",
}
export function CustomerLedgerEntryDetail({
  account,
  entryId,
}: { account: LedgerAccount; entryId: string }) {
  const trpc = useTRPC()
  const { setParams } = useCustomerLedgerParams()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.customerLedger.entryDetail.queryOptions(
      {
        accountId: account.id,
        entryId,
        expectedRevision: account.revision,
        afterAllocationId: cursors.at(-1),
        limit: 50,
      },
      { retry: false },
    ),
  )
  if (query.isPending)
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        Loading…
      </output>
    )
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          Couldn’t load this entry. Check your connection and try again.
        </AlertDescription>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </Alert>
    )
  const detail = query.data
  const entry = detail.entry
  const money = (v: string) => formatFinanceMoney(v, account.currencyCode)
  const correctable =
    ["OPENING_DEBT", "OPENING_CREDIT", "RECEIPT", "REFUND"].includes(
      entry.kind,
    ) &&
    !entry.reversalOfId &&
    !detail.reversal &&
    !detail.reconciliationRequired &&
    (entry.kind === "REFUND" || detail.usedAmountMinor === "0")
  const label = ledgerLabels[entry.kind] ?? "Entry"
  const remaining = detail.allocations.filter(
    (a) => BigInt(a.remainingAmountMinor) > BigInt(0),
  )
  const unused =
    entry.kind === "RECEIPT" || entry.kind === "OPENING_CREDIT"
      ? BigInt(entry.amountMinor) - BigInt(detail.usedAmountMinor)
      : BigInt(0)
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1">
        <h3 className="font-medium">{label}</h3>
        <p className="text-2xl font-semibold tabular-nums">
          {money(entry.amountMinor)}
        </p>
        <p className="text-sm text-muted-foreground">
          {AMOUNT_NOTE[entry.kind] ?? ""}
        </p>
      </div>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Date</dt>
        <dd>{formatLedgerDate(entry.effectiveAt, true)}</dd>
        {detail.receipt ? (
          <>
            <dt className="text-muted-foreground">Paid by</dt>
            <dd>
              {paymentMethodLabels[detail.receipt.method] ?? "Other"}
              {detail.receipt.reference
                ? ` · Ref ${detail.receipt.reference}`
                : ""}
            </dd>
          </>
        ) : null}
        {entry.orderId ? (
          <>
            <dt className="text-muted-foreground">Order</dt>
            <dd>
              <Link
                className="underline underline-offset-4"
                href={`/sales/orders/${encodeURIComponent(entry.orderId)}`}
              >
                Open the Order
              </Link>
            </dd>
          </>
        ) : null}
        {entry.description && entry.description !== label ? (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd className="break-words">{entry.description}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Recorded</dt>
        <dd>{formatLedgerDate(entry.recordedAt, true)}</dd>
      </dl>
      {entry.reversalOfId ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            This undoes an earlier entry. Both stay on the statement.
          </AlertDescription>
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ ledgerEntry: entry.reversalOfId ?? null })
            }
          >
            See the original
          </Button>
        </Alert>
      ) : null}
      {detail.reversal ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            Undone on {formatLedgerDate(detail.reversal.effectiveAt)}
            {detail.reversal.description
              ? `: ${detail.reversal.description}`
              : ""}
            . It stays on the statement so the history is complete.
          </AlertDescription>
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ ledgerEntry: detail.reversal?.id ?? null })
            }
          >
            See the undo
          </Button>
        </Alert>
      ) : null}
      {detail.reconciliationRequired ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            This entry’s history doesn’t add up. Payments are paused until
            someone in Finance checks it.
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.allocations.length ? (
        <section className="grid gap-3">
          <h4 className="font-medium">
            {entry.side === "CREDIT" ? "Used on" : "Paid by"}
          </h4>
          {detail.allocations.map((a) => {
            const other = entry.side === "CREDIT" ? a.charge : a.credit
            return (
              <article
                key={a.id}
                className="grid gap-2 border-b border-border pb-4 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    {ledgerLabels[other.kind] ?? "Entry"}
                    {other.description &&
                    other.description !== ledgerLabels[other.kind]
                      ? ` · ${other.description}`
                      : ""}{" "}
                    <span className="text-muted-foreground">
                      {formatLedgerDate(other.effectiveAt)}
                    </span>
                  </p>
                  <p className="font-medium tabular-nums">
                    {money(a.remainingAmountMinor)}
                  </p>
                </div>
                {a.releasedAmountMinor !== "0" ? (
                  <p className="text-muted-foreground">
                    {money(a.releasedAmountMinor)} of {money(a.amountMinor)} was
                    taken back.
                  </p>
                ) : null}
                <AllocationHistory account={account} allocationId={a.id} />
                {BigInt(a.remainingAmountMinor) > BigInt(0) &&
                ["OPENING_CREDIT", "RECEIPT"].includes(a.credit.kind) &&
                ["OPENING_DEBT", "ORDER_CHARGE"].includes(a.charge.kind) &&
                account.book &&
                !detail.reconciliationRequired ? (
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={() =>
                      void setParams({
                        ledgerAction: "release",
                        ledgerEntry: entry.id,
                        ledgerAllocation: a.id,
                        ledgerAllocationAfter: cursors.at(-1) ?? null,
                      })
                    }
                  >
                    Undo
                  </Button>
                ) : null}
              </article>
            )
          })}
          {cursors.length > 1 || detail.nextCursor ? (
            <div className="flex gap-2">
              {cursors.length > 1 ? (
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => setCursors((v) => v.slice(0, -1))}
                >
                  Back
                </Button>
              ) : null}
              {detail.nextCursor ? (
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() =>
                    setCursors((v) => [...v, detail.nextCursor ?? undefined])
                  }
                >
                  Show more
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {unused > BigInt(0) && !detail.reversal ? (
        <p className="text-sm text-muted-foreground">
          {money(unused.toString())} not used yet. It stays as paid ahead until
          it’s used on an Order.
        </p>
      ) : null}
      {remaining.length === 0 && correctable && account.book ? (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() =>
            void setParams({
              ledgerAction: "reverse",
              ledgerAccount: account.id,
              ledgerEntry: entry.id,
            })
          }
        >
          Undo this {entry.kind === "RECEIPT" ? "payment" : "entry"}
        </Button>
      ) : null}
    </div>
  )
}
