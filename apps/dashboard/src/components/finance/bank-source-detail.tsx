"use client"

import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { readPendingFinanceCommand } from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, AlertTitle, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { FinanceBankOwnedCorrectionForm } from "./bank-owned-correction-form"
import { bankOwnedCorrectionTarget } from "./bank-owned-correction-target"
import { FinanceBankSupplierCorrectionForm } from "./bank-supplier-correction-form"
import { useFinanceForm } from "./form-context"
import type { FinanceBook } from "./types"

/** Resolves original domain identities; a journal source ID is not a UI record ID. */
export function FinanceBankSourceDetail({
  book,
  accountId,
  entryId,
  statementId,
}: {
  book: FinanceBook
  accountId: string
  entryId: string
  statementId: string | null
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  const { setParams } = useFinanceParams()
  const { actorUserId, tenantId, setLocked, recoveryRefresh } = useFinanceForm()
  const [supplierCorrection, setSupplierCorrection] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const navigating = useRef(false)
  const initial = useRef({
    actorUserId,
    tenantId,
    bookId: book.id,
    accountId,
    entryId,
  })
  const current = useRef(initial.current)
  current.current = {
    actorUserId,
    tenantId,
    bookId: book.id,
    accountId,
    entryId,
  }
  const sourceOptions =
    trpc.finance.bankStatements.resolveCorrectionSource.queryOptions(
      { bookId: book.id, accountId, entryId },
      { staleTime: 0, retry: false },
    )
  const query = useQuery(sourceOptions)
  useEffect(() => {
    if (recoveryRefresh < 0 || !query.data) return
    const original = bankOwnedCorrectionTarget(query.data.target)
    if (!original) return
    try {
      const pending = readPendingFinanceCommand(window.localStorage, {
        actorUserId,
        tenantId,
        bookId: book.id,
      })
      if (
        pending?.operation ===
          (original.kind === "SUPPLIER"
            ? "reverseSupplierEntry"
            : "reversePurchasePayment") &&
        pending.recoveryMetadata?.entryId === original.id &&
        pending.recoveryMetadata.accountId === accountId
      )
        setSupplierCorrection(true)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Saved source correction is unavailable.",
      )
    }
  }, [actorUserId, tenantId, book.id, accountId, query.data, recoveryRefresh])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    setLocked(busy)
    return () => setLocked(false)
  }, [busy, setLocked])

  function assertCurrent() {
    if (
      !mounted.current ||
      !onlineManager.isOnline() ||
      JSON.stringify(initial.current) !== JSON.stringify(current.current)
    )
      throw new Error(
        "Your finance scope or connection changed. Reopen the original transaction.",
      )
    if (
      readPendingFinanceCommand(window.localStorage, {
        actorUserId,
        tenantId,
        bookId: book.id,
      })
    )
      throw new Error(
        "Resolve the saved finance submission before opening another correction.",
      )
  }
  async function authority() {
    assertCurrent()
    const actual = await readFinanceCloseScope()
    assertCurrent()
    if (
      !actual ||
      actual.actorUserId !== actorUserId ||
      actual.tenantId !== tenantId ||
      !["OWNER", "ADMIN"].includes(actual.role.toUpperCase())
    )
      throw new Error(
        "Your finance authority changed. Reopen the original transaction.",
      )
  }
  async function openOriginal() {
    if (navigating.current || !query.data) return
    navigating.current = true
    setBusy(true)
    setError(null)
    try {
      await authority()
      const bookOptions = trpc.finance.book.queryOptions(undefined, {
        staleTime: 0,
        retry: false,
      })
      await client.cancelQueries(
        { queryKey: bookOptions.queryKey, exact: true },
        { silent: true },
      )
      assertCurrent()
      const actualBook = await client.fetchQuery(bookOptions)
      assertCurrent()
      const bookState = client.getQueryState(bookOptions.queryKey)
      if (
        !actualBook ||
        bookState?.status !== "success" ||
        bookState.fetchStatus !== "idle" ||
        actualBook.id !== book.id ||
        actualBook.tenantId !== tenantId ||
        actualBook.currencyCode !== book.currencyCode
      )
        throw new Error(
          "The active financial book changed. Reopen the original transaction.",
        )
      await client.cancelQueries(
        { queryKey: sourceOptions.queryKey, exact: true },
        { silent: true },
      )
      assertCurrent()
      const source = await client.fetchQuery(sourceOptions)
      assertCurrent()
      const sourceState = client.getQueryState(sourceOptions.queryKey)
      if (
        sourceState?.status !== "success" ||
        sourceState.fetchStatus !== "idle" ||
        source.bookId !== book.id ||
        source.bankAccountId !== accountId ||
        source.journalEntryId !== entryId
      )
        throw new Error(
          "The original source does not belong to this bank transaction.",
        )
      if (JSON.stringify(source.target) !== JSON.stringify(query.data.target))
        throw new Error(
          "The original source changed. Refresh and review it again.",
        )
      await authority()
      const target = source.target
      if (target.kind === "MONEY")
        await setParams({
          financeSheet: "money-reversal",
          moneyEntryId: target.entryId,
        })
      else if (target.kind === "BILL")
        await setParams({ financeSheet: "bill", billId: target.billId })
      else if (target.kind === "SUPPLIER")
        await setParams({
          financeSheet: "supplier-statement",
          supplierId: target.supplierId,
        })
      else if (target.kind === "CUSTOMER") {
        const search = new URLSearchParams({
          ledgerAccount: target.accountId,
          ledgerAction: "entry",
          ledgerEntry: target.entryId,
        })
        router.push(
          `/customers/${encodeURIComponent(target.customerId)}/statement?${search.toString()}`,
        )
      } else
        throw new Error(
          target.kind === "UNAVAILABLE"
            ? target.reason
            : "Purchase correction is not yet available in this dashboard.",
        )
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Original transaction is unavailable.",
        )
    } finally {
      navigating.current = false
      if (mounted.current) setBusy(false)
    }
  }

  if (query.isPending)
    return <output aria-busy="true">Loading original transaction…</output>
  if (query.isError)
    return (
      <Alert variant="destructive" appearance="dashboard">
        <AlertTitle>Original transaction unavailable</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Alert>
    )
  const source = query.data
  if (
    source.bookId !== book.id ||
    source.bankAccountId !== accountId ||
    source.journalEntryId !== entryId
  )
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          The original transaction scope changed. Reopen the bank statement.
        </AlertDescription>
      </Alert>
    )
  const target = source.target
  const correctionTarget = bankOwnedCorrectionTarget(target)
  if (supplierCorrection && target.kind === "SUPPLIER")
    return (
      <FinanceBankSupplierCorrectionForm
        book={book}
        accountId={accountId}
        entryId={entryId}
        target={target}
        onBack={() => setSupplierCorrection(false)}
      />
    )
  if (supplierCorrection && correctionTarget)
    return (
      <FinanceBankOwnedCorrectionForm
        book={book}
        accountId={accountId}
        entryId={entryId}
        target={correctionTarget}
        onBack={() => setSupplierCorrection(false)}
      />
    )
  const available = ["MONEY", "BILL", "SUPPLIER", "CUSTOMER"].includes(
    target.kind,
  )
  return (
    <div className="grid min-w-0 gap-5">
      <div>
        <h3 className="text-lg font-medium">Original posted transaction</h3>
        <p className="break-words text-sm">{source.posted.description}</p>
        <p className="mt-2 font-medium tabular-nums">
          {formatFinanceMoney(source.posted.amountMinor, book.currencyCode)}
        </p>
        <p className="text-xs text-muted-foreground">
          Entry {source.posted.sequence} ·{" "}
          {new Date(source.posted.effectiveAt).toISOString().slice(0, 10)} UTC
        </p>
      </div>
      <dl className="grid min-w-0 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Posted source</dt>
          <dd className="break-words">{source.sourceKind}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Original source reference</dt>
          <dd className="break-all font-mono text-xs">{source.sourceId}</dd>
        </div>
        {target.kind === "BILL" || target.kind === "PURCHASE" ? (
          <div>
            <dt className="text-muted-foreground">Original bill</dt>
            <dd className="break-all font-mono text-xs">
              {target.billId}
              {target.paymentId ? ` · Payment ${target.paymentId}` : ""}
            </dd>
          </div>
        ) : null}
        {target.kind === "PURCHASE" && target.payment ? (
          <>
            <div>
              <dt className="text-muted-foreground">
                Original purchase payment
              </dt>
              <dd className="break-words">
                {target.payment.description} ·{" "}
                {formatFinanceMoney(
                  target.payment.amountMinor,
                  book.currencyCode,
                )}{" "}
                ·{" "}
                {new Date(target.payment.effectiveAt)
                  .toISOString()
                  .slice(0, 10)}{" "}
                UTC
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest bill activity</dt>
              <dd className="break-words">
                {new Date(target.payment.latestEffectiveAt).toISOString()} UTC
              </dd>
            </div>
            {target.payment.reversed ? (
              <div>
                <dt className="text-muted-foreground">
                  Retained payment reversal
                </dt>
                <dd>
                  {target.payment.reversalEffectiveAt
                    ? `${new Date(target.payment.reversalEffectiveAt).toISOString()} UTC`
                    : "Already reversed; accounting date unavailable."}
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
        {target.kind === "SUPPLIER" ? (
          <>
            <div>
              <dt className="text-muted-foreground">Original supplier entry</dt>
              <dd className="break-all font-mono text-xs">
                {target.supplierEntryId}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Original supplier record
              </dt>
              <dd className="break-words">
                {target.description} ·{" "}
                {formatFinanceMoney(target.amountMinor, book.currencyCode)} ·{" "}
                {new Date(target.effectiveAt).toISOString().slice(0, 10)} UTC
              </dd>
            </div>
            {target.reversal ? (
              <div>
                <dt className="text-muted-foreground">Retained reversal</dt>
                <dd className="break-all text-xs">
                  {target.reversal.id} ·{" "}
                  {new Date(target.reversal.effectiveAt)
                    .toISOString()
                    .slice(0, 10)}{" "}
                  UTC
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
        {target.kind === "CUSTOMER" ? (
          <div>
            <dt className="text-muted-foreground">Original customer entry</dt>
            <dd className="break-all font-mono text-xs">{target.entryId}</dd>
          </div>
        ) : null}
      </dl>
      <Alert appearance="dashboard">
        <AlertTitle>
          {available || correctionTarget
            ? "Review the original record before correcting"
            : "Correction entry point unavailable"}
        </AlertTitle>
        <AlertDescription>
          {target.kind === "UNAVAILABLE"
            ? target.reason
            : target.kind === "PURCHASE" && !correctionTarget
              ? "This purchase has no supported original bank payment to correct here. Review its source purchase workflow."
              : "The original record owns its correction. Any correction must retain its history; importing or matching a bank transaction does not post a payment."}
        </AlertDescription>
      </Alert>
      {error ? (
        <Alert variant="destructive" appearance="dashboard">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {target.kind === "PURCHASE" && correctionTarget ? (
          <Button
            disabled={busy || query.isFetching || correctionTarget.reversed}
            onClick={() => setSupplierCorrection(true)}
          >
            {correctionTarget.reversed
              ? "Original purchase payment already reversed"
              : "Correct original purchase payment"}
          </Button>
        ) : null}
        {target.kind === "SUPPLIER" ? (
          <Button
            disabled={busy || query.isFetching || Boolean(target.reversal)}
            onClick={() => setSupplierCorrection(true)}
          >
            {target.reversal
              ? "Original supplier entry already reversed"
              : "Correct original supplier entry"}
          </Button>
        ) : null}
        {available ? (
          <Button
            disabled={busy || query.isFetching}
            onClick={() => void openOriginal()}
          >
            {busy
              ? "Checking original record…"
              : target.kind === "SUPPLIER"
                ? "Open original supplier statement"
                : "Open original record"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh original record
        </Button>
        {statementId ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void setParams({
                financeSheet: "bank-statement",
                bankSourceEntryId: null,
                bankSourceAccountId: null,
              })
            }
          >
            Back to bank statement
          </Button>
        ) : null}
      </div>
    </div>
  )
}
