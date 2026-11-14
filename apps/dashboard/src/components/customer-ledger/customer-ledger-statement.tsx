"use client"
import { CustomerLedgerDataTable } from "@/components/tables/customer-ledger/data-table"
import { CustomerLedgerEmptyState } from "@/components/tables/customer-ledger/empty-states"
import { CustomerLedgerEntryList } from "@/components/tables/customer-ledger/entry-list"
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
import { ArrowDown01Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import { EarlierOrdersBanner } from "./earlier-orders"
import { OwedByAge } from "./owed-by-age"
import { useCustomerLedgerExport } from "./statement-export"
import { StatementPdfDialog } from "./statement-pdf-sheet"

type LedgerMode =
  | "receipt"
  | "apply"
  | "opening"
  | "refund"
  | "remind"
  | "summary"
  | "link"

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
  const [printing, setPrinting] = useState(false)
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
    ) {
      // Seed the pinned read with this answer so pinning doesn't read the
      // same statement a second time.
      client.setQueryData(
        trpc.customerLedger.statement.queryKey({
          accountId,
          snapshotSequence: query.data.snapshotSequence,
          afterSequence: ledgerAfter ?? undefined,
          limit: 30,
        }),
        query.data,
      )
      void setParams(
        { ledgerSnapshot: query.data.snapshotSequence },
        { history: "replace" },
      )
    }
  }, [
    accountId,
    client,
    ledgerAfter,
    ledgerSnapshot,
    query.data,
    query.isFetching,
    query.isError,
    refreshing,
    setParams,
    trpc,
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
      <Button variant="outline" onClick={() => startAction("remind")}>
        <HugeiconsIcon
          icon={WhatsappIcon}
          data-icon="inline-start"
          aria-hidden="true"
        />
        Send reminder
      </Button>
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
                Use on an order
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
          <DropdownMenuItem onClick={() => startAction("summary")}>
            Share summary
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startAction("link")}>
            Link earlier orders
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!query.data}
            onClick={() => setPrinting(true)}
          >
            Share or print PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!query.data || exporter.busy}
            onClick={() => void exporter.download()}
          >
            {exporter.busy ? "Preparing file…" : "Download statement (CSV)"}
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
  // Current holds come only from a successful live account read, never from
  // this pinned snapshot or a stale cached read after a failed refresh.
  const current = detail.status === "success" ? detail.data : null
  const updated = new Intl.DateTimeFormat("en-NG", {
    timeStyle: "short",
  }).format(new Date(query.dataUpdatedAt))
  return (
    <section className="flex min-w-0 flex-col gap-5">
      {renderHeader(actions)}
      <StatementPdfDialog
        open={printing}
        onOpenChange={setPrinting}
        accountId={accountId}
        snapshotSequence={statement.snapshotSequence}
        customerName={customerName ?? current?.customer.name}
        currencyCode={statement.currencyCode}
      />
      {current ? (
        <EarlierOrdersBanner
          customerId={current.customer.id}
          customerName={customerName ?? current.customer.name}
          onReview={() => startAction("link")}
        />
      ) : null}
      <section
        aria-label="Balance"
        className="grid gap-2 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4"
      >
        <p className="text-3xl font-semibold tabular-nums">
          {money(net < BigInt(0) ? (-net).toString() : net.toString())}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {net > BigInt(0)
              ? "owes you"
              : net < BigInt(0)
                ? "paid ahead"
                : "nothing owed"}
          </span>
        </p>
        {owed > BigInt(0) && paidAhead > BigInt(0) ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {`Owes ${money(owed.toString())}, paid ahead ${money(paidAhead.toString())} not used yet`}
          </p>
        ) : null}
        {current && BigInt(current.reservedCreditMinor) > BigInt(0) ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {`${money(current.reservedCreditMinor)} held for a refund; ${money(current.totals.availableCreditMinor)} can be used.`}
          </p>
        ) : null}
        {detail.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            Couldn’t check refund holds.
            <Button
              variant="outline"
              disabled={detail.isFetching}
              onClick={() => void detail.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : null}
      </section>
      {owed > BigInt(0) ? <OwedByAge accountId={accountId} /> : null}
      {error || exporter.error ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>{error ?? exporter.error}</AlertDescription>
        </Alert>
      ) : null}
      {statement.entries.length ? (
        <>
          <div className="md:hidden">
            <CustomerLedgerEntryList
              entries={statement.entries}
              currencyCode={statement.currencyCode}
              onOpen={open}
            />
          </div>
          <div className="max-md:hidden">
            <CustomerLedgerDataTable
              initialSettings={initialSettings}
              entries={statement.entries}
              currencyCode={statement.currencyCode}
              onOpen={open}
            />
          </div>
        </>
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
