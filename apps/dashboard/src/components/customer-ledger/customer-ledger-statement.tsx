"use client"
import { CustomerLedgerDataTable } from "@/components/tables/customer-ledger/data-table"
import { CustomerLedgerEmptyState } from "@/components/tables/customer-ledger/empty-states"
import { CustomerLedgerSkeleton } from "@/components/tables/customer-ledger/skeleton"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import {
  Alert,
  AlertDescription,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { useCustomerLedgerExport } from "./statement-export"

type LedgerMode = "receipt" | "apply" | "opening" | "refund"

/**
 * One customer's statement in one currency: actions, the three totals and
 * every recorded charge and payment, oldest first. `renderHeader` places the
 * actions beside the customer's name.
 */
export function CustomerLedgerStatement({
  accountId,
  customerName,
  initialSettings,
  onEditCustomer,
  renderHeader,
}: {
  accountId: string
  customerName?: string
  initialSettings?: Partial<TableSettings>
  onEditCustomer?: () => void
  renderHeader: (actions: ReactNode) => ReactNode
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { ledgerSnapshot, ledgerAfter, setParams } = useCustomerLedgerParams()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    trpc.customerLedger.statement.queryOptions(
      {
        accountId,
        snapshotSequence: ledgerSnapshot ?? undefined,
        afterSequence: ledgerAfter ?? undefined,
        limit: 30,
      },
      {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: "always",
      },
    ),
  )
  const detail = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false },
    ),
  )
  useEffect(() => {
    if (
      !ledgerSnapshot &&
      query.data &&
      !query.isFetching &&
      !query.isError &&
      !refreshing
    )
      void setParams(
        { ledgerSnapshot: query.data.snapshotSequence },
        { history: "replace" },
      )
  }, [
    ledgerSnapshot,
    query.data,
    query.isFetching,
    query.isError,
    refreshing,
    setParams,
  ])
  const open = useCallback(
    (id: string) => {
      void setParams({
        ledgerAction: "entry",
        ledgerEntry: id,
        ledgerAccount: accountId,
      })
    },
    [setParams, accountId],
  )
  async function refresh() {
    if (query.isFetching || refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      const latest = await client.fetchQuery(
        trpc.customerLedger.statement.queryOptions(
          { accountId, limit: 30 },
          { staleTime: 0, retry: false },
        ),
      )
      client.setQueryData(
        trpc.customerLedger.statement.queryKey({
          accountId,
          snapshotSequence: latest.snapshotSequence,
          limit: 30,
        }),
        latest,
      )
      await setParams({
        ledgerSnapshot: latest.snapshotSequence,
        ledgerAfter: null,
      })
      await detail.refetch()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t refresh. The statement below is from before.",
      )
    } finally {
      setRefreshing(false)
    }
  }
  const exporter = useCustomerLedgerExport({
    accountId,
    snapshotSequence: query.data?.snapshotSequence ?? "",
    customerName,
  })
  const book = Boolean(detail.data?.book)
  const startAction = (mode: LedgerMode) =>
    void setParams({
      ledgerAction: mode,
      ledgerAccount: accountId,
      ledgerEntry: null,
      ledgerAllocation: null,
    })
  const busy = query.isFetching || refreshing
  const actions = (
    <div className="flex flex-wrap gap-2">
      {book ? (
        <Button onClick={() => startAction("receipt")}>Record payment</Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline">
              More
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                data-icon="inline-end"
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          }
        />
        <DropdownMenuContent
          appearance="dashboard"
          align="end"
          className="min-w-56"
        >
          {onEditCustomer ? (
            <DropdownMenuItem onClick={onEditCustomer}>
              Edit customer details
            </DropdownMenuItem>
          ) : null}
          {book ? (
            <>
              <DropdownMenuItem onClick={() => startAction("apply")}>
                Use on an Order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => startAction("opening")}>
                Add starting balance
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => startAction("refund")}>
                Return paid-ahead money
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!query.data || exporter.busy}
            onClick={() => void exporter.download()}
          >
            {exporter.busy ? "Preparing file…" : "Download statement (CSV)"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onClick={() => void refresh()}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
  if (query.isPending || (!ledgerSnapshot && query.isFetching))
    return (
      <>
        {renderHeader(actions)}
        <CustomerLedgerSkeleton />
      </>
    )
  if (query.isError)
    return (
      <>
        {renderHeader(actions)}
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            Couldn’t load this statement. Check your connection and try again.
          </AlertDescription>
          <Button
            onClick={() =>
              void setParams({ ledgerSnapshot: null, ledgerAfter: null })
            }
          >
            Try again
          </Button>
        </Alert>
      </>
    )
  const statement = query.data
  const money = (v: string) => formatFinanceMoney(v, statement.currencyCode)
  const net = BigInt(statement.totals.netBalanceMinor)
  const owed = BigInt(statement.totals.outstandingDebtMinor)
  const paidAhead = BigInt(statement.totals.availableCreditMinor)
  const updated = new Intl.DateTimeFormat("en-NG", {
    timeStyle: "short",
  }).format(new Date(query.dataUpdatedAt))
  return (
    <section className="flex min-w-0 flex-col gap-5">
      {renderHeader(actions)}
      <dl
        data-summary-grid
        data-summary-money
        className="grid gap-3 sm:grid-cols-3"
      >
        <div className="border border-border p-4">
          <dt className="text-sm text-muted-foreground">Owes you</dt>
          <dd
            className={`mt-1 text-2xl font-semibold tabular-nums ${owed > BigInt(0) ? "text-amber-700 dark:text-amber-300" : ""}`}
          >
            {money(statement.totals.outstandingDebtMinor)}
          </dd>
          <dd className="text-sm text-muted-foreground">
            Orders and starting balance on this statement
          </dd>
        </div>
        <div className="border border-border p-4">
          <dt className="text-sm text-muted-foreground">Paid ahead</dt>
          <dd
            className={`mt-1 text-2xl font-semibold tabular-nums ${paidAhead > BigInt(0) ? "text-primary" : ""}`}
          >
            {money(statement.totals.availableCreditMinor)}
          </dd>
          <dd className="text-sm text-muted-foreground">
            Paid before an Order, not used yet
          </dd>
        </div>
        <div className="border border-border bg-muted p-4">
          <dt className="text-sm text-muted-foreground">Balance</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {net > BigInt(0)
              ? money(net.toString())
              : net < BigInt(0)
                ? money((-net).toString())
                : money("0")}
            {net !== BigInt(0) ? (
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                {net > BigInt(0) ? "owed" : "paid ahead"}
              </span>
            ) : null}
          </dd>
          <dd className="text-sm text-muted-foreground">
            {net > BigInt(0)
              ? "Owes you, minus paid ahead"
              : net < BigInt(0)
                ? "Paid ahead, minus what they owe"
                : owed > BigInt(0) || paidAhead > BigInt(0)
                  ? "Evens out, but the paid-ahead money hasn’t been used on what they owe yet."
                  : "Nothing owed"}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Shows only what’s been added to this statement: Orders, payments and any
        starting balance. Orders not added here aren’t counted. A payment stays
        as paid ahead until it’s used on something they owe.
      </p>
      {error || exporter.error ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>{error ?? exporter.error}</AlertDescription>
        </Alert>
      ) : null}
      {statement.entries.length ? (
        <CustomerLedgerDataTable
          initialSettings={initialSettings}
          entries={statement.entries}
          currencyCode={statement.currencyCode}
          onOpen={open}
        />
      ) : (
        <CustomerLedgerEmptyState
          customerName={customerName}
          onRecordPayment={book ? () => startAction("receipt") : undefined}
          onStartingBalance={book ? () => startAction("opening") : undefined}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {statement.entries.length
            ? `${statement.entries.length} ${statement.entries.length === 1 ? "entry" : "entries"}, oldest first · `
            : ""}
          Updated {updated}
        </span>
        <div className="flex flex-wrap gap-2">
          {ledgerAfter ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void setParams({ ledgerAfter: null })}
            >
              Back to the start
            </Button>
          ) : null}
          {statement.nextCursor && ledgerSnapshot ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void setParams({ ledgerAfter: statement.nextCursor })
              }
            >
              Show later entries
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
    </section>
  )
}
