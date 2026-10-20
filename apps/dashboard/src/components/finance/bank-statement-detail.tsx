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
import { financeSourceLabel } from "./bank-source-detail"
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
          : "Saved matching progress isn't available.",
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
        <AlertTitle>Couldn't load this statement</AlertTitle>
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
      failure instanceof Error ? failure.message : "Check what you selected."
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
  // Select-all follows the match rules: lines not matched yet, at most 50.
  const selectionLocked = query.isFetching || Boolean(recoveryError)
  const eligibleBankRowIds = data.rows
    .filter((row) => !row.activeMatchId)
    .map((row) => row.id)
  const candidateIds = data.candidates.map((line) => line.id)
  const allBankSelected =
    eligibleBankRowIds.length > 0 &&
    eligibleBankRowIds.every((id) => bankRowIds.includes(id))
  const allCandidatesSelected =
    candidateIds.length > 0 &&
    candidateIds.every((id) => journalLineIds.includes(id))
  const account = book.accounts.find((item) => item.id === data.accountId)
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{data.statement.reference}</h3>
          <p className="text-sm text-muted-foreground">
            {account?.name ?? "Money account"} ·{" "}
            {new Date(data.statement.startsAt).toISOString().slice(0, 10)} –{" "}
            {new Date(data.statement.endsAt).toISOString().slice(0, 10)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            As of the latest records.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ["Start balance", data.statement.openingBalanceMinor],
          ["Your records at start", data.postedOpeningMinor],
          ["End balance", data.statement.closingBalanceMinor],
          ["Your records at end", data.postedClosingMinor],
          ["Difference at start", data.openingDifferenceMinor],
          ["Difference at end", data.closingDifferenceMinor],
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
        <AlertTitle>Still to match</AlertTitle>
        <AlertDescription>
          {data.unmatchedBankRows}{" "}
          {data.unmatchedBankRows === 1 ? "bank line" : "bank lines"} not
          matched yet · net {money(data.unmatchedBankMinor)}. Matching a line
          doesn't change any money. If something is wrong, fix the original
          record. Matching every line doesn't prove every naira is accounted
          for.
        </AlertDescription>
      </Alert>
      <FieldSet className="grid min-w-0 gap-3">
        <FieldLegend>Bank lines</FieldLegend>
        <p className="text-xs text-muted-foreground">
          {data.statement.rowCount} lines from your bank file, kept exactly as
          uploaded.
        </p>
        {data.rows.length ? (
          <div className="max-h-80 overflow-auto overscroll-contain border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label={
                        eligibleBankRowIds.length > 50
                          ? "Select all bank lines not matched yet (more than 50; pick up to 50 one by one)"
                          : "Select all bank lines not matched yet"
                      }
                      checked={allBankSelected}
                      indeterminate={bankRowIds.length > 0 && !allBankSelected}
                      disabled={
                        selectionLocked ||
                        eligibleBankRowIds.length === 0 ||
                        eligibleBankRowIds.length > 50
                      }
                      onCheckedChange={(checked) =>
                        setBankRowIds(checked ? eligibleBankRowIds : [])
                      }
                    />
                  </TableHead>
                  <TableHead>Bank ref</TableHead>
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
                        aria-label={`Select bank line ${row.externalId}`}
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
                        {row.activeMatchId ? "Matched" : "Not matched"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This statement has no lines.
          </p>
        )}
      </FieldSet>
      <FieldSet className="grid min-w-0 gap-3">
        <FieldLegend>Records not matched yet</FieldLegend>
        {!data.candidateCoverageComplete ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertTitle>This list is incomplete</AlertTitle>
            <AlertDescription>
              Only the first {data.candidateReviewLimit} records are shown.
              There are more records to check.
            </AlertDescription>
          </Alert>
        ) : null}
        {data.candidates.length ? (
          <div className="max-h-80 overflow-auto overscroll-contain border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label={
                        candidateIds.length > 50
                          ? "Select all records (more than 50; pick up to 50 one by one)"
                          : "Select all records"
                      }
                      checked={allCandidatesSelected}
                      indeterminate={
                        journalLineIds.length > 0 && !allCandidatesSelected
                      }
                      disabled={
                        selectionLocked ||
                        candidateIds.length === 0 ||
                        candidateIds.length > 50
                      }
                      onCheckedChange={(checked) =>
                        setJournalLineIds(checked ? candidateIds : [])
                      }
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Your record</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.candidates.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select record ${line.sequence}`}
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
                        Record {line.sequence}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {financeSourceLabel(line.sourceKind)}
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
                        Open original record
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
            No records waiting to be matched up to this statement's end date.
          </p>
        )}
      </FieldSet>
      {recoveryError ? (
        <Alert variant="destructive" appearance="dashboard">
          <AlertDescription>{recoveryError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="sticky bottom-0 grid gap-3 border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {bankRowIds.length}/50 bank lines · {money(bankTotal)}
          </span>
          <span>
            {journalLineIds.length}/50 records · {money(postedTotal)}
          </span>
          {bankRowIds.length || journalLineIds.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setBankRowIds([])
                setJournalLineIds([])
              }}
            >
              Deselect all
            </Button>
          ) : null}
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
          Match
        </Button>
      </div>
      <Alert appearance="dashboard">
        <AlertTitle>If something doesn't match</AlertTitle>
        <AlertDescription>
          Check the original payment, expense or Customer or Supplier record
          before fixing anything. If real money moved and isn't recorded, add
          it. Bank lines never change.
        </AlertDescription>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ financeSheet: "expense", statementId: null })
            }
          >
            Add the missing expense
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ financeSheet: "money", statementId: null })
            }
          >
            Add the missing money movement
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
