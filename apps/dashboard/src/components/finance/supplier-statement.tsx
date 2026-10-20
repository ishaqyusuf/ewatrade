"use client"

import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { FinanceSupplierAging } from "./supplier-aging"
import type { FinanceBook } from "./types"

const entryLabels = {
  OPENING_PAYABLE: "Opening payable",
  OPENING_ADVANCE: "Opening advance",
  ADVANCE: "Paid advance",
  PURCHASE_BILL: "Purchase bill",
  PURCHASE_PAYMENT: "Purchase payment",
  ADVANCE_ALLOCATION: "Advance applied to purchase",
  ALLOCATION_RELEASE: "Advance allocation released",
  REVERSAL: "Accounting correction",
} as const

export function FinanceSupplierStatement({
  book,
  supplierId,
}: {
  book: FinanceBook
  supplierId: string
}) {
  return (
    <SupplierWorkspace
      key={`${book.id}:${supplierId}`}
      book={book}
      supplierId={supplierId}
    />
  )
}

function SupplierWorkspace({
  book,
  supplierId,
}: { book: FinanceBook; supplierId: string }) {
  const [mode, setMode] = useState<"statement" | "aging">("statement")
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap gap-2" aria-label="Supplier views">
        <Button
          appearance="form"
          variant={mode === "statement" ? "secondary" : "outline"}
          aria-pressed={mode === "statement"}
          onClick={() => setMode("statement")}
        >
          Statement
        </Button>
        <Button
          appearance="form"
          variant={mode === "aging" ? "secondary" : "outline"}
          aria-pressed={mode === "aging"}
          onClick={() => setMode("aging")}
        >
          Payable aging
        </Button>
      </div>
      {mode === "statement" ? (
        <FinanceSupplierHistory book={book} supplierId={supplierId} />
      ) : (
        <FinanceSupplierAging book={book} supplierId={supplierId} />
      )}
    </div>
  )
}

function FinanceSupplierHistory({
  book,
  supplierId,
}: { book: FinanceBook; supplierId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { setParams } = useFinanceParams()
  const [snapshot, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const query = useQuery(
    trpc.finance.supplierStatement.queryOptions(
      {
        bookId: book.id,
        supplierId,
        snapshotSequence: snapshot,
        cursor: cursors.at(-1),
        limit: 30,
      },
      {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  useEffect(() => {
    if (
      snapshot === undefined &&
      query.data &&
      !query.isFetching &&
      !refreshing
    ) {
      setSnapshot(query.data.snapshotSequence)
    }
  }, [query.data, query.isFetching, refreshing, snapshot])

  const entryIds = useMemo(
    () => query.data?.data.map((entry) => entry.id) ?? [],
    [query.data],
  )
  const selection = useInlineSelection({
    ids: entryIds,
    scope: `${snapshot ?? ""}:${cursors.at(-1) ?? ""}`,
    disabled: query.isFetching || refreshing,
  })

  async function refresh() {
    if (refreshing || query.isFetching) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const latest = await client.fetchQuery(
        trpc.finance.supplierStatement.queryOptions(
          { bookId: book.id, supplierId, limit: 30 },
          { staleTime: 0, retry: false },
        ),
      )
      client.setQueryData(
        trpc.finance.supplierStatement.queryKey({
          bookId: book.id,
          supplierId,
          snapshotSequence: latest.snapshotSequence,
          cursor: undefined,
          limit: 30,
        }),
        latest,
      )
      setCursors([undefined])
      setSnapshot(latest.snapshotSequence)
    } catch (failure) {
      setRefreshError(
        failure instanceof Error
          ? failure.message
          : "The statement could not be refreshed.",
      )
    } finally {
      setRefreshing(false)
    }
  }

  if (query.isPending)
    return <output aria-busy="true">Loading supplier statement…</output>
  if (query.isError) {
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertTitle>Supplier statement could not be loaded</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
        <Button
          appearance="form"
          variant="outline"
          className="w-fit"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
        {cursors.length > 1 ? (
          <Button
            appearance="form"
            variant="outline"
            className="w-fit"
            onClick={() => setCursors((value) => value.slice(0, -1))}
          >
            Previous page
          </Button>
        ) : null}
      </Alert>
    )
  }
  const statement = query.data
  const money = (value: string) =>
    formatFinanceMoney(value, statement.currencyCode)
  const busy = refreshing || query.isFetching
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h3 className="font-medium">{statement.supplier.name}</h3>
        <p className="text-sm text-muted-foreground">
          {statement.supplier.code}
        </p>
      </div>
      <Alert appearance="dashboard">
        <AlertDescription>
          This statement includes recorded opening balances, purchase bills,
          payments, advances, allocations and their corrections. Payables and
          advances are shown separately.
        </AlertDescription>
      </Alert>
      <dl
        data-summary-grid
        data-summary-money
        className="grid gap-4 sm:grid-cols-2"
      >
        <div>
          <dt className="text-sm text-muted-foreground">Recorded payable</dt>
          <dd className="font-medium tabular-nums">
            {money(statement.payableMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            Recorded supplier advance
          </dt>
          <dd className="font-medium tabular-nums">
            {money(statement.advanceMinor)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="form"
          variant="outline"
          onClick={() =>
            void setParams({ financeSheet: "supplier-opening", supplierId })
          }
        >
          Record opening balance
        </Button>
        <Button
          appearance="form"
          variant="outline"
          onClick={() =>
            void setParams({ financeSheet: "supplier-advance", supplierId })
          }
        >
          Pay an advance
        </Button>
        <Button
          appearance="form"
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {refreshing ? "Refreshing…" : "Refresh statement"}
        </Button>
      </div>
      {refreshError ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            {refreshError} The previous snapshot is retained.
          </AlertDescription>
        </Alert>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Page {cursors.length} · Snapshot {statement.snapshotSequence}. Refresh
        to include newer entries or corrections.
      </p>
      <InlineSelectionStatus selection={selection} />
      <section
        className="overflow-x-auto border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: This wide historical table needs keyboard scrolling.
        tabIndex={0}
        aria-label="Supplier statement entries"
      >
        <Table className="min-w-[660px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-10">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all loaded supplier entries"
                />
              </TableHead>
              <TableHead scope="col">Date (UTC)</TableHead>
              <TableHead scope="col">Record</TableHead>
              <TableHead scope="col" className="text-right">
                Debit
              </TableHead>
              <TableHead scope="col" className="text-right">
                Credit
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.data.length ? (
              statement.data.map((entry) => (
                <TableRow
                  key={entry.id}
                  data-state={
                    selection.isSelected(entry.id) ? "selected" : undefined
                  }
                >
                  <TableCell className="align-top">
                    <InlineRowCheckbox
                      selection={selection}
                      id={entry.id}
                      label={`Select entry ${entry.sequence}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top">
                    {new Date(entry.effectiveAt).toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="break-words">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {entryLabels[entry.kind]} · #{entry.sequence}
                    </p>
                    {entry.reversalOfId ? (
                      <Badge variant="secondary">Correction entry</Badge>
                    ) : entry.reversal ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary">
                          Reversed; original retained
                        </Badge>
                        <p className="break-words text-xs text-muted-foreground">
                          {entry.reversal.description} ·{" "}
                          {new Date(entry.reversal.effectiveAt)
                            .toISOString()
                            .slice(0, 10)}{" "}
                          UTC
                        </p>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {money(entry.side === "DEBIT" ? entry.amountMinor : "0")}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {money(entry.side === "CREDIT" ? entry.amountMinor : "0")}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  No recorded supplier activity.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="form"
          variant="outline"
          disabled={cursors.length === 1 || busy}
          onClick={() => setCursors((value) => value.slice(0, -1))}
        >
          Previous page
        </Button>
        <Button
          appearance="form"
          variant="outline"
          disabled={!statement.nextCursor || snapshot === undefined || busy}
          onClick={() => {
            if (statement.nextCursor && snapshot !== undefined)
              setCursors((value) => [
                ...value,
                statement.nextCursor ?? undefined,
              ])
          }}
        >
          Next page
        </Button>
      </div>
    </div>
  )
}
