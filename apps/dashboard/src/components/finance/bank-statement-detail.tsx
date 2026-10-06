"use client"

import { FinanceBankStatementTableSkeleton } from "@/components/tables/finance-bank-statements/skeleton"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { readPendingFinanceCommand } from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  FieldLegend,
  FieldSet,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { type BankReviewAction, FinanceBankMatchForm } from "./bank-match-form"
import { FinanceBankMatchHistory } from "./bank-match-history"
import { bankMatchSelection } from "./bank-match-state"
import { useFinanceForm } from "./form-context"
import type { FinanceBook } from "./types"

export function FinanceBankStatementDetail({
  book,
  statementId,
}: { book: FinanceBook; statementId: string }) {
  const trpc = useTRPC()
  const { setParams } = useFinanceParams()
  const { actorUserId, tenantId, recoveryRefresh } = useFinanceForm()
  const [bankRowIds, setBankRowIds] = useState<string[]>([])
  const [journalLineIds, setJournalLineIds] = useState<string[]>([])
  const [action, setAction] = useState<BankReviewAction | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const selectionRevision = useRef<string | null>(null)
  useEffect(() => {
    if (recoveryRefresh < 0) return
    try {
      const pending = readPendingFinanceCommand(window.localStorage, {
        actorUserId,
        tenantId,
        bookId: book.id,
      })
      const saved = pending?.recoveryMetadata?.bankReview
      if (saved?.statementId !== statementId) return
      if (saved.action === "MATCH" && saved.bankRowIds && saved.journalLineIds)
        setAction({
          kind: "MATCH",
          bankRowIds: saved.bankRowIds,
          journalLineIds: saved.journalLineIds,
        })
      else if (
        saved.action === "UNMATCH" &&
        saved.matchId &&
        saved.matchRevision
      )
        setAction({
          kind: "UNMATCH",
          matchId: saved.matchId,
          matchRevision: saved.matchRevision,
        })
    } catch (failure) {
      setRecoveryError(
        failure instanceof Error
          ? failure.message
          : "Saved matching status is unavailable.",
      )
    }
  }, [actorUserId, tenantId, book.id, statementId, recoveryRefresh])
  const query = useQuery(
    trpc.finance.bankStatements.get.queryOptions(
      { bookId: book.id, statementId },
      { retry: false, staleTime: 0 },
    ),
  )
  useEffect(() => {
    if (!query.data) return
    const revision = JSON.stringify([
      query.data.bookId,
      query.data.accountId,
      query.data.statement.id,
      query.data.bankRevision,
      query.data.snapshotSequence,
    ])
    if (selectionRevision.current === revision) return
    selectionRevision.current = revision
    // New evidence requires a new explicit selection.
    setBankRowIds([])
    setJournalLineIds([])
  }, [query.data])
  const toggle = (values: string[], id: string, checked: boolean) =>
    checked
      ? [...new Set([...values, id])]
      : values.filter((value) => value !== id)
  if (query.isPending)
    return (
      <div className="grid gap-4">
        <output aria-live="polite">Loading bank statement…</output>
        <FinanceBankStatementTableSkeleton />
      </div>
    )
  if (query.isError)
    return (
      <Alert variant="destructive" appearance="dashboard">
        <AlertTitle>Statement review unavailable</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Alert>
    )
  const data = query.data
  if (action)
    return (
      <FinanceBankMatchForm
        book={book}
        data={data}
        action={action}
        onBack={() => setAction(null)}
      />
    )
  let selectionError: string | null = null
  try {
    bankMatchSelection(data, bankRowIds, journalLineIds)
  } catch (failure) {
    selectionError =
      failure instanceof Error ? failure.message : "Review selected sources."
  }
  const bankTotal = data.rows
    .filter((row) => bankRowIds.includes(row.id))
    .reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)
    .toString()
  const postedTotal = data.candidates
    .filter((line) => journalLineIds.includes(line.id))
    .reduce((sum, line) => sum + BigInt(line.amountMinor), 0n)
    .toString()
  const money = (amount: string) =>
    formatFinanceMoney(amount, data.currencyCode)
  const account = book.accounts.find((item) => item.id === data.accountId)
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{data.statement.reference}</h3>
          <p className="text-sm text-muted-foreground">
            {account?.name ?? "Bank account"} ·{" "}
            {new Date(data.statement.startsAt).toISOString().slice(0, 10)} –{" "}
            {new Date(data.statement.endsAt).toISOString().slice(0, 10)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bank revision {data.bankRevision} · Posted snapshot{" "}
            {data.snapshotSequence}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh review"}
        </Button>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ["Statement opening", data.statement.openingBalanceMinor],
          ["Posted opening", data.postedOpeningMinor],
          ["Statement closing", data.statement.closingBalanceMinor],
          ["Posted closing", data.postedClosingMinor],
          ["Opening difference", data.openingDifferenceMinor],
          ["Closing difference", data.closingDifferenceMinor],
        ].map(([label, amount]) => (
          <div key={label} className="border border-border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-lg font-medium tabular-nums">
              {money(amount ?? "0")}
            </dd>
          </div>
        ))}
      </dl>
      <Alert appearance="dashboard">
        <AlertTitle>Review remains open</AlertTitle>
        <AlertDescription>
          {data.unmatchedBankRows} unmatched bank transactions · net{" "}
          {money(data.unmatchedBankMinor)}. Matching and original-record
          correction preserve original records. These figures do not certify
          that the business is fully reconciled.
        </AlertDescription>
      </Alert>
      <FieldSet className="grid min-w-0 gap-3">
        <FieldLegend>Original bank transactions</FieldLegend>
        <p className="text-xs text-muted-foreground">
          {data.statement.rowCount} retained transactions. Original bank IDs,
          dates, signed amounts and descriptions are preserved.
        </p>
        {data.rows.length ? (
          <div className="max-h-80 overflow-auto overscroll-contain border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Select bank transaction</span>
                  </TableHead>
                  <TableHead>Bank ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select bank ${row.externalId}`}
                        checked={bankRowIds.includes(row.id)}
                        disabled={
                          Boolean(row.activeMatchId) ||
                          query.isFetching ||
                          Boolean(recoveryError) ||
                          (!bankRowIds.includes(row.id) &&
                            bankRowIds.length >= 50)
                        }
                        onCheckedChange={(checked) =>
                          setBankRowIds((values) =>
                            toggle(values, row.id, checked),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.externalId}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(row.occurredAt).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal break-words">
                      {row.description || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {money(row.amountMinor)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.activeMatchId ? "secondary" : "outline"}
                      >
                        {row.activeMatchId ? "Matched" : "Unmatched"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This original statement has no movements.
          </p>
        )}
      </FieldSet>
      <FieldSet className="grid min-w-0 gap-3">
        <FieldLegend>Unmatched posted candidates</FieldLegend>
        {!data.candidateCoverageComplete ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertTitle>Candidate list is incomplete</AlertTitle>
            <AlertDescription>
              Only the first {data.candidateReviewLimit} candidates are shown.
              Additional posted records require review; this list cannot certify
              reconciliation.
            </AlertDescription>
          </Alert>
        ) : null}
        {data.candidates.length ? (
          <div className="max-h-80 overflow-auto overscroll-contain border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Select posted record</span>
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Posted record</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.candidates.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select posted entry ${line.sequence}`}
                        checked={journalLineIds.includes(line.id)}
                        disabled={
                          query.isFetching ||
                          Boolean(recoveryError) ||
                          (!journalLineIds.includes(line.id) &&
                            journalLineIds.length >= 50)
                        }
                        onCheckedChange={(checked) =>
                          setJournalLineIds((values) =>
                            toggle(values, line.id, checked),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(line.effectiveAt).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal break-words">
                      {line.description}
                      <span className="block text-xs text-muted-foreground">
                        Entry {line.sequence}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {line.sourceKind}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={query.isFetching || Boolean(recoveryError)}
                        onClick={() =>
                          void setParams({
                            financeSheet: "bank-source",
                            bankSourceEntryId: line.entryId,
                            bankSourceAccountId: data.accountId,
                          })
                        }
                      >
                        Review original transaction
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {money(line.amountMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No unmatched posted candidates in this statement cutoff.
          </p>
        )}
      </FieldSet>
      {recoveryError ? (
        <Alert variant="destructive" appearance="dashboard">
          <AlertDescription>{recoveryError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="sticky bottom-0 grid gap-3 border border-border bg-background p-4">
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          <span>
            {bankRowIds.length}/50 bank · {money(bankTotal)}
          </span>
          <span>
            {journalLineIds.length}/50 posted · {money(postedTotal)}
          </span>
        </div>
        {selectionError && (bankRowIds.length || journalLineIds.length) ? (
          <p className="text-sm text-muted-foreground">{selectionError}</p>
        ) : null}
        <Button
          disabled={
            Boolean(selectionError) ||
            query.isFetching ||
            Boolean(recoveryError)
          }
          onClick={() =>
            setAction({
              kind: "MATCH",
              bankRowIds: [...bankRowIds],
              journalLineIds: [...journalLineIds],
            })
          }
        >
          Review selected match
        </Button>
      </div>
      <Alert appearance="dashboard">
        <AlertTitle>Investigate differences at their source</AlertTitle>
        <AlertDescription>
          Review original payments, expenses or customer/supplier records before
          recording a correction. For an unrecorded real movement, record its
          actual source. Imported bank IDs and amounts stay unchanged.
        </AlertDescription>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ financeSheet: "expense", statementId: null })
            }
          >
            Record actual expense
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ financeSheet: "money", statementId: null })
            }
          >
            Record actual movement
          </Button>
        </div>
      </Alert>
      <FinanceBankMatchHistory
        key={`${data.accountId}:${data.bankRevision}`}
        book={book}
        accountId={data.accountId}
        snapshotRevision={data.bankRevision}
        activeMatchIds={[
          ...new Set(
            data.rows.flatMap((row) =>
              row.activeMatchId ? [row.activeMatchId] : [],
            ),
          ),
        ]}
        disabled={query.isFetching || Boolean(recoveryError)}
        onRelease={(event) =>
          setAction({
            kind: "UNMATCH",
            matchId: event.id,
            matchRevision: event.revision,
          })
        }
      />
    </div>
  )
}
