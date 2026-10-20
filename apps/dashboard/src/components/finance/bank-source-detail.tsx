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

const sourceLabels: Record<string, string> = {
  EXPENSE: "Expense",
  EXPENSE_BILL: "Expense",
  EXPENSE_BILL_REVERSAL: "Expense undone",
  BILL_PAYMENT: "Expense payment",
  BILL_PAYMENT_REVERSAL: "Expense payment undone",
  OWNER_BILL_PAYMENT: "Expense paid with owner's money",
  OWNER_BILL_PAYMENT_REVERSAL: "Owner-paid expense undone",
  OWNER_CONTRIBUTION: "Owner put money in",
  OWNER_WITHDRAWAL: "Owner took money out",
  TRANSFER: "Moved between accounts",
  MONEY_REVERSAL: "Money movement undone",
  OPENING_BALANCE: "Starting balance",
  CASH_COUNT_ADJUSTMENT: "Cash count change",
  CASH_COUNT_ADJUSTMENT_REVERSAL: "Cash count change undone",
  PURCHASE_BILL: "Bill",
  PURCHASE_PAYMENT: "Supplier payment",
  PURCHASE_PAYMENT_REVERSAL: "Supplier payment undone",
  SUPPLIER_ADVANCE: "Paid ahead",
  SUPPLIER_ADVANCE_ALLOCATION: "Paid-ahead money used on a bill",
  SUPPLIER_ALLOCATION_RELEASE: "Undo using paid-ahead money",
  SUPPLIER_ENTRY_REVERSAL: "Supplier entry undone",
  SUPPLIER_OPENING_PAYABLE: "Owed before you started",
  SUPPLIER_OPENING_PAYMENT: "Paid toward starting balance",
  CUSTOMER_RECEIPT: "Customer payment",
  CUSTOMER_HELD_CREDIT_REFUND: "Paid-ahead money returned",
  CUSTOMER_LEDGER_REVERSAL: "Customer entry undone",
  COMMERCIAL_PAYMENT: "Order payment",
  COMMERCIAL_ORDER_COLLECTION: "Order payment",
}

/** Plain label for a record's source; never shows a raw code. */
export function financeSourceLabel(kind: string) {
  const known = sourceLabels[kind]
  if (known) return known
  const text = kind.toLowerCase().replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

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
          : "Saved change isn't available.",
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
        "Your connection or access changed. Open the original record again.",
      )
    if (
      readPendingFinanceCommand(window.localStorage, {
        actorUserId,
        tenantId,
        bookId: book.id,
      })
    )
      throw new Error("Finish the saved entry before opening another one.")
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
      throw new Error("Your access changed. Open the original record again.")
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
        throw new Error("Finance changed. Open the original record again.")
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
          "This original record doesn't belong to this bank line.",
        )
      if (JSON.stringify(source.target) !== JSON.stringify(query.data.target))
        throw new Error("The original record changed. Refresh and look again.")
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
            : "This can't be undone from here yet.",
        )
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Original record isn't available.",
        )
    } finally {
      navigating.current = false
      if (mounted.current) setBusy(false)
    }
  }

  if (query.isPending)
    return <output aria-busy="true">Loading original record…</output>
  if (query.isError)
    return (
      <Alert variant="destructive" appearance="dashboard">
        <AlertTitle>Original record not available</AlertTitle>
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
          Something changed. Open the bank statement again.
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
        <h3 className="text-lg font-medium">Original record</h3>
        <p className="break-words text-sm">{source.posted.description}</p>
        <p className="mt-2 font-medium tabular-nums">
          {formatFinanceMoney(source.posted.amountMinor, book.currencyCode)}
        </p>
        <p className="text-xs text-muted-foreground">
          Record {source.posted.sequence} ·{" "}
          {new Date(source.posted.effectiveAt).toISOString().slice(0, 10)}
        </p>
      </div>
      <dl className="grid min-w-0 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="break-words">
            {financeSourceLabel(source.sourceKind)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="break-all font-mono text-xs">{source.sourceId}</dd>
        </div>
        {target.kind === "BILL" || target.kind === "PURCHASE" ? (
          <div>
            <dt className="text-muted-foreground">Original expense</dt>
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
                Original supplier payment
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
                  .slice(0, 10)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Latest activity on the bill
              </dt>
              <dd className="break-words">
                {new Date(target.payment.latestEffectiveAt).toISOString()}
              </dd>
            </div>
            {target.payment.reversed ? (
              <div>
                <dt className="text-muted-foreground">Payment undone</dt>
                <dd>
                  {target.payment.reversalEffectiveAt
                    ? new Date(target.payment.reversalEffectiveAt).toISOString()
                    : "Already undone; date not available."}
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
        {target.kind === "SUPPLIER" ? (
          <>
            <div>
              <dt className="text-muted-foreground">Original Supplier entry</dt>
              <dd className="break-all font-mono text-xs">
                {target.supplierEntryId}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Original Supplier record
              </dt>
              <dd className="break-words">
                {target.description} ·{" "}
                {formatFinanceMoney(target.amountMinor, book.currencyCode)} ·{" "}
                {new Date(target.effectiveAt).toISOString().slice(0, 10)}
              </dd>
            </div>
            {target.reversal ? (
              <div>
                <dt className="text-muted-foreground">Undone</dt>
                <dd className="break-all text-xs">
                  {target.reversal.id} ·{" "}
                  {new Date(target.reversal.effectiveAt)
                    .toISOString()
                    .slice(0, 10)}
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
        {target.kind === "CUSTOMER" ? (
          <div>
            <dt className="text-muted-foreground">Original Customer entry</dt>
            <dd className="break-all font-mono text-xs">{target.entryId}</dd>
          </div>
        ) : null}
      </dl>
      <Alert appearance="dashboard">
        <AlertTitle>
          {available || correctionTarget
            ? "Check the original record before fixing"
            : "Can't fix this from here"}
        </AlertTitle>
        <AlertDescription>
          {target.kind === "UNAVAILABLE"
            ? target.reason
            : target.kind === "PURCHASE" && !correctionTarget
              ? "This purchase has no bank payment that can be undone here."
              : "Fix this on the original record. The original stays in history. Uploading or matching a bank line does not record a payment."}
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
              ? "This payment is already undone"
              : "Undo this payment"}
          </Button>
        ) : null}
        {target.kind === "SUPPLIER" ? (
          <Button
            disabled={busy || query.isFetching || Boolean(target.reversal)}
            onClick={() => setSupplierCorrection(true)}
          >
            {target.reversal
              ? "This entry is already undone"
              : "Undo this Supplier entry"}
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
                ? "Open Supplier"
                : "Open original record"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
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
