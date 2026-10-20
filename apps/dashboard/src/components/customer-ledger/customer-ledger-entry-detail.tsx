"use client"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Badge, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { AllocationHistory } from "./allocation-history"
import { type LedgerAccount, ledgerLabels } from "./types"
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
    return <output aria-busy="true">Loading entry and allocations…</output>
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>{query.error.message}</AlertDescription>
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
  return (
    <div className="flex flex-col gap-5">
      <h3 className="font-medium">
        {ledgerLabels[entry.kind] ?? entry.kind} · #{entry.sequence}
      </h3>
      <p className="text-2xl tabular-nums">
        {money(entry.amountMinor)} {entry.side.toLowerCase()}
      </p>
      <p>{entry.description}</p>
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Effective date (UTC)</dt>
          <dd>{new Date(entry.effectiveAt).toISOString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Recorded date (UTC)</dt>
          <dd>{new Date(entry.recordedAt).toISOString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="break-words">
            {entry.sourceKind} · {entry.sourceId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Recorded by</dt>
          <dd className="break-words">{entry.actorUserId}</dd>
        </div>
        {entry.orderId ? (
          <div>
            <dt className="text-muted-foreground">Order reference</dt>
            <dd className="break-words">{entry.orderId}</dd>
          </div>
        ) : null}
        {detail.receipt ? (
          <div>
            <dt className="text-muted-foreground">
              Receipt method / reference
            </dt>
            <dd>
              {detail.receipt.method} ·{" "}
              {detail.receipt.reference ?? "No reference"}
            </dd>
          </div>
        ) : null}
      </dl>
      {entry.reversalOfId ? (
        <Badge variant="secondary">
          Correction of {entry.reversalOfId}; original retained
        </Badge>
      ) : null}
      {detail.reversal ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            Reversed by entry #{detail.reversal.sequence}:{" "}
            {detail.reversal.description}. The original remains in the
            statement.
          </AlertDescription>
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ ledgerEntry: detail.reversal?.id ?? null })
            }
          >
            View correction
          </Button>
        </Alert>
      ) : null}
      {detail.reconciliationRequired ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            Settlement history needs reconciliation. Financial actions are
            unavailable.
          </AlertDescription>
        </Alert>
      ) : null}
      {correctable && account.book ? (
        <Button
          appearance="form"
          variant="outline"
          onClick={() =>
            void setParams({
              ledgerAction: "reverse",
              ledgerAccount: account.id,
              ledgerEntry: entry.id,
            })
          }
        >
          Correct this entry
        </Button>
      ) : null}
      <h4 className="font-medium">
        Allocations · {money(detail.usedAmountMinor)} currently used
      </h4>
      {detail.allocations.length ? (
        detail.allocations.map((a) => (
          <section
            key={a.id}
            className="grid gap-2 border-b border-border pb-4"
          >
            <p>
              {ledgerLabels[a.credit.kind] ?? a.credit.kind} #
              {a.credit.sequence} →{" "}
              {ledgerLabels[a.charge.kind] ?? a.charge.kind} #
              {a.charge.sequence}
            </p>
            <p className="text-sm">
              Applied {money(a.amountMinor)} · Released{" "}
              {money(a.releasedAmountMinor)} · Remaining{" "}
              {money(a.remainingAmountMinor)}
            </p>
            <AllocationHistory account={account} allocationId={a.id} />
            {BigInt(a.remainingAmountMinor) > BigInt(0) &&
            ["OPENING_CREDIT", "RECEIPT"].includes(a.credit.kind) &&
            ["OPENING_DEBT", "ORDER_CHARGE"].includes(a.charge.kind) &&
            account.book &&
            !detail.reconciliationRequired ? (
              <Button
                appearance="form"
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
                Release allocation
              </Button>
            ) : null}
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          No allocations for this entry.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={cursors.length === 1 || query.isFetching}
          onClick={() => setCursors((v) => v.slice(0, -1))}
        >
          Previous allocations
        </Button>
        <Button
          variant="outline"
          disabled={!detail.nextCursor || query.isFetching}
          onClick={() =>
            setCursors((v) => [...v, detail.nextCursor ?? undefined])
          }
        >
          More allocations
        </Button>
      </div>
    </div>
  )
}
