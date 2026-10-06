"use client"
import { CustomerLedgerDataTable } from "@/components/tables/customer-ledger/data-table"
import { CustomerLedgerEmptyState } from "@/components/tables/customer-ledger/empty-states"
import { CustomerLedgerSkeleton } from "@/components/tables/customer-ledger/skeleton"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { CustomerLedgerExport } from "./statement-export"
export function CustomerLedgerStatement({
  accountId,
  initialSettings,
}: { accountId: string; initialSettings?: Partial<TableSettings> }) {
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
          : "Refresh failed; previous snapshot retained.",
      )
    } finally {
      setRefreshing(false)
    }
  }
  if (query.isPending || (!ledgerSnapshot && query.isFetching))
    return <CustomerLedgerSkeleton />
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>{query.error.message}</AlertDescription>
        <Button onClick={() => void query.refetch()}>Try again</Button>
        <Button
          variant="outline"
          onClick={() =>
            void setParams({ ledgerSnapshot: null, ledgerAfter: null })
          }
        >
          Start a new snapshot
        </Button>
      </Alert>
    )
  const statement = query.data
  const money = (v: string) => formatFinanceMoney(v, statement.currencyCode)
  const busy = query.isFetching || refreshing
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <Alert appearance="dashboard">
        <AlertDescription>
          Recorded customer ledger entries only. Unintegrated Order history is
          excluded. Amount owed and available credit are separate; credit
          becomes settlement only when explicitly applied.
        </AlertDescription>
      </Alert>
      <dl
        data-summary-grid
        data-summary-money
        className="grid gap-5 border-b border-border pb-5 sm:grid-cols-3"
      >
        <div>
          <dt className="text-sm text-muted-foreground">
            Recorded amount owed
          </dt>
          <dd className="mt-2 text-2xl tabular-nums">
            {money(statement.totals.outstandingDebtMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Credit available</dt>
          <dd className="mt-2 text-2xl tabular-nums">
            {money(statement.totals.availableCreditMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            Net balance (debt − credit)
          </dt>
          <dd className="mt-2 text-2xl tabular-nums">
            {money(statement.totals.netBalanceMinor)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {detail.data?.book ? (
          <>
            {(
              [
                ["receipt", "Receive payment"],
                ["apply", "Apply credit"],
                ["opening", "Opening balance"],
                ["refund", "Return unused credit"],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                appearance="form"
                variant={mode === "receipt" ? "default" : "outline"}
                onClick={() =>
                  void setParams({
                    ledgerAction: mode,
                    ledgerAccount: accountId,
                    ledgerEntry: null,
                    ledgerAllocation: null,
                  })
                }
              >
                {label}
              </Button>
            ))}
          </>
        ) : null}
        <Button
          appearance="form"
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {refreshing ? "Refreshing…" : "Refresh statement"}
        </Button>
      </div>
      {error ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <CustomerLedgerExport
        key={`${accountId}:${statement.snapshotSequence}`}
        accountId={accountId}
        snapshotSequence={statement.snapshotSequence}
      />
      <p className="text-sm text-muted-foreground">
        Snapshot #{statement.snapshotSequence} · balances cover the whole posted
        account at this snapshot. Refresh to include newer entries or
        corrections.
      </p>
      {statement.entries.length ? (
        <CustomerLedgerDataTable
          initialSettings={initialSettings}
          entries={statement.entries}
          currencyCode={statement.currencyCode}
          onOpen={open}
        />
      ) : (
        <CustomerLedgerEmptyState onRefresh={() => void refresh()} />
      )}
      <div className="flex gap-2">
        <Button
          appearance="form"
          variant="outline"
          disabled={!ledgerAfter || busy}
          onClick={() => void setParams({ ledgerAfter: null })}
        >
          First page
        </Button>
        <Button
          appearance="form"
          variant="outline"
          disabled={!statement.nextCursor || !ledgerSnapshot || busy}
          onClick={() => void setParams({ ledgerAfter: statement.nextCursor })}
        >
          Next page
        </Button>
      </div>
    </section>
  )
}
