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
import { formatFinanceDate } from "./format-date"
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
            {formatFinanceDate(data.statement.startsAt)} –{" "}
            {formatFinanceDate(data.statement.endsAt)}
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
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            [
              "Start",
              data.statement.openingBalanceMinor,
              data.postedOpeningMinor,
              data.openingDifferenceMinor,
            ],
            [
              "End",
              data.statement.closingBalanceMinor,
              data.postedClosingMinor,
              data.closingDifferenceMinor,
            ],
          ] as const
        ).map(([label, bank, records, difference]) => (
          <section
            key={label}
            aria-label={label}
            className="rounded-[var(--ui-radius-surface)] border border-border p-4"
          >
            <h4 className="mb-2 font-semibold">{label}</h4>
            <dl className="grid gap-1.5">
              {(
                [
                  ["Bank says", bank],
                  ["Your records", records],
                  ["Difference", difference],
                ] as const
              ).map(([name, amount]) => (
                <div key={name} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd
                    className={
                      name === "Difference" && amount && amount !== "0"
                        ? "font-semibold tabular-nums text-[color:var(--warning-foreground)]"
                        : "font-semibold tabular-nums"
                    }
                  >
                    {money(amount ?? "0")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="rounded-[var(--ui-radius-item)] bg-muted px-3 py-2">
        <b className="font-semibold">
          {data.unmatchedBankRows}{" "}
          {data.unmatchedBankRows === 1 ? "bank line" : "bank lines"} to match
        </b>{" "}
        · {money(data.unmatchedBankMinor)}. Matching doesn&apos;t move any
        money.
      </p>
      <FieldSet className="grid min-w-0 gap-3">
        <FieldLegend>Bank lines</FieldLegend>
        {data.rows.length ? (
          <>
            <ul
              aria-label="Bank lines"
              className="max-h-96 divide-y divide-border overflow-y-auto overscroll-contain rounded-[var(--ui-radius-surface)] border border-border md:hidden"
            >
              {data.rows.map((row) => (
                <li key={row.id}>
                  <label className="flex min-h-14 items-center gap-3 px-4 py-2.5">
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
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="break-words">
                        {row.description || row.externalId}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatFinanceDate(row.occurredAt)}
                      </span>
                    </span>
                    <span className="grid shrink-0 justify-items-end gap-1">
                      <span className="font-semibold tabular-nums">
                        {money(row.amountMinor)}
                      </span>
                      <Badge
                        variant={row.activeMatchId ? "secondary" : "outline"}
                      >
                        {row.activeMatchId ? "Matched" : "Not matched"}
                      </Badge>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="max-h-80 overflow-auto overscroll-contain rounded-[var(--ui-radius-surface)] border border-border max-md:hidden">
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
                        indeterminate={
                          bankRowIds.length > 0 && !allBankSelected
                        }
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
                      <TableCell className="font-mono text-sm">
                        {row.externalId}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatFinanceDate(row.occurredAt)}
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
          </>
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
          <>
            <ul
              aria-label="Records not matched yet"
              className="max-h-96 divide-y divide-border overflow-y-auto overscroll-contain rounded-[var(--ui-radius-surface)] border border-border md:hidden"
            >
              {data.candidates.map((line) => (
                <li key={line.id} className="grid gap-2 px-4 py-2.5">
                  <label className="flex min-h-11 items-center gap-3">
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
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="break-words">{line.description}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatFinanceDate(line.effectiveAt)} ·{" "}
                        {financeSourceLabel(line.sourceKind)}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {money(line.amountMinor)}
                    </span>
                  </label>
                  <Button
                    variant="outline"
                    className="justify-self-start"
                    disabled={query.isFetching || Boolean(recoveryError)}
                    aria-label={`Open original record ${line.sequence}`}
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
                </li>
              ))}
            </ul>
            <div className="max-h-80 overflow-auto overscroll-contain rounded-[var(--ui-radius-surface)] border border-border max-md:hidden">
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
                        {formatFinanceDate(line.effectiveAt)}
                      </TableCell>
                      <TableCell className="max-w-80 whitespace-normal break-words">
                        {line.description}
                        <span className="block text-sm text-muted-foreground">
                          Record {line.sequence}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
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
          </>
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
      <div className="sticky -bottom-6 z-10 -mx-6 grid gap-3 border-t border-border bg-background px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {bankRowIds.length}{" "}
            {bankRowIds.length === 1 ? "bank line" : "bank lines"} ·{" "}
            {money(bankTotal)}
          </span>
          <span>
            {journalLineIds.length}{" "}
            {journalLineIds.length === 1 ? "record" : "records"} ·{" "}
            {money(postedTotal)}
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
        <AlertTitle>Money missing from your records?</AlertTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ financeSheet: "expense", statementId: null })
            }
          >
            Add expense
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void setParams({ financeSheet: "money", statementId: null })
            }
          >
            Add money movement
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
