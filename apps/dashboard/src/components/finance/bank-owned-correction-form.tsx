"use client"

import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { FinanceCommandNotSentError } from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  DatePicker,
  FieldGroup,
  Input,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useFinanceForm } from "./form-context"
import {
  FinanceBackTo,
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import { plainDay } from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

import {
  type BankOwnedCorrectionTarget,
  bankOwnedCorrectionTarget,
} from "./bank-owned-correction-target"

type Review = {
  target: BankOwnedCorrectionTarget
  effectiveAt: Date
  reason: string
}

export function FinanceBankOwnedCorrectionForm({
  book,
  accountId,
  entryId,
  target,
  onBack,
}: {
  book: FinanceBook
  accountId: string
  entryId: string
  target: BankOwnedCorrectionTarget
  onBack: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { actorUserId, tenantId, setLocked } = useFinanceForm()
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      "Record undone. Now record what really happened, then match the bank line.",
    ),
    book.id,
    target.kind === "SUPPLIER"
      ? "reverseSupplierEntry"
      : "reversePurchasePayment",
  )
  const supplierMutation = useMutation(
    trpc.finance.reverseSupplierEntry.mutationOptions(),
  )
  const purchaseMutation = useMutation(
    trpc.finance.reversePurchasePayment.mutationOptions(),
  )
  const [reason, setReason] = useState("")
  // A day; a payment correction is timed now (today) or at the end of that day.
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10))
  const date =
    target.kind === "SUPPLIER"
      ? day
      : day === new Date().toISOString().slice(0, 10)
        ? new Date().toISOString().slice(0, 23)
        : `${day}T23:59:59.999`
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const preparing = useRef(false)
  const mutationEntered = useRef(false)
  const initial = useRef({
    actorUserId,
    tenantId,
    bookId: book.id,
    accountId,
    entryId,
    sourceId: target.id,
    kind: target.kind,
    ownerId: target.ownerId,
    supplierId: target.supplierId,
  })
  const current = useRef(initial.current)
  current.current = {
    actorUserId,
    tenantId,
    bookId: book.id,
    accountId,
    entryId,
    sourceId: target.id,
    kind: target.kind,
    ownerId: target.ownerId,
    supplierId: target.supplierId,
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    setLocked(busy || command.pending)
    return () => setLocked(false)
  }, [busy, command.pending, setLocked])
  function assertCurrent() {
    if (
      !mounted.current ||
      !onlineManager.isOnline() ||
      JSON.stringify(current.current) !== JSON.stringify(initial.current)
    )
      throw new Error(
        "Your finance scope or connection changed. Reopen the original source record.",
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
        "Your finance authority changed. Reopen the original source record.",
      )
  }
  async function freshSource() {
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
    const currentBook = await client.fetchQuery(bookOptions)
    assertCurrent()
    const bookState = client.getQueryState(bookOptions.queryKey)
    if (
      !currentBook ||
      bookState?.status !== "success" ||
      bookState.fetchStatus !== "idle" ||
      currentBook.id !== book.id ||
      currentBook.tenantId !== tenantId ||
      currentBook.currencyCode !== book.currencyCode
    )
      throw new Error(
        "The active financial book changed. Reopen the original source record.",
      )
    const sourceOptions =
      trpc.finance.bankStatements.resolveCorrectionSource.queryOptions(
        { bookId: book.id, accountId, entryId },
        { staleTime: 0, retry: false },
      )
    await client.cancelQueries(
      { queryKey: sourceOptions.queryKey, exact: true },
      { silent: true },
    )
    assertCurrent()
    const source = await client.fetchQuery(sourceOptions)
    assertCurrent()
    const sourceState = client.getQueryState(sourceOptions.queryKey)
    const original = bankOwnedCorrectionTarget(source.target)
    if (
      sourceState?.status !== "success" ||
      sourceState.fetchStatus !== "idle" ||
      source.bookId !== book.id ||
      source.bankAccountId !== accountId ||
      source.journalEntryId !== entryId ||
      !original ||
      original.kind !== target.kind ||
      original.id !== target.id ||
      original.ownerId !== target.ownerId ||
      original.supplierId !== target.supplierId
    )
      throw new Error(
        "The original source record is unavailable for this bank transaction.",
      )
    return original
  }
  async function prepare() {
    if (preparing.current || !command.ready) return
    preparing.current = true
    setBusy(true)
    setError(null)
    try {
      const trimmed = reason.trim()
      if (!trimmed || trimmed.length > 400)
        throw new Error("Say what's wrong, so others understand later.")
      const purchase = target.kind === "PURCHASE_PAYMENT"
      const effectiveAt = new Date(
        purchase ? `${date}Z` : `${date}T00:00:00.000Z`,
      )
      if (
        !(
          purchase
            ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/
            : /^\d{4}-\d{2}-\d{2}$/
        ).test(date) ||
        !Number.isFinite(effectiveAt.getTime()) ||
        effectiveAt.toISOString().slice(0, 10) !== date.slice(0, 10) ||
        (purchase
          ? effectiveAt > new Date()
          : date > new Date().toISOString().slice(0, 10))
      )
        throw new Error("Pick today or an earlier day.")
      const original = await freshSource()
      if (
        !(
          target.kind === "SUPPLIER"
            ? ["OPENING_PAYABLE", "OPENING_ADVANCE", "ADVANCE"]
            : ["PURCHASE_PAYMENT"]
        ).includes(original.entryKind)
      )
        throw new Error(
          "Correct this supplier record through its original purchase command.",
        )
      if (original.reversed && !command.uncertain)
        throw new Error("This record has already been undone.")
      const originalAt = new Date(original.effectiveAt)
      if (
        purchase
          ? effectiveAt < originalAt
          : date < originalAt.toISOString().slice(0, 10)
      )
        throw new Error("Pick the day of the original record or later.")
      const requestedAt = effectiveAt < originalAt ? originalAt : effectiveAt
      if (
        !command.uncertain &&
        requestedAt < new Date(original.latestEffectiveAt)
      )
        throw new Error(
          `Pick ${plainDay(new Date(original.latestEffectiveAt).toISOString().slice(0, 10))} or later, after the bill's last change.`,
        )
      await authority()
      setReview({
        target: original,
        effectiveAt: requestedAt,
        reason: trimmed,
      })
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Original source record unavailable.",
        )
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function confirm(value: Review) {
    const common = {
      bookId: book.id,
      reason: value.reason,
      effectiveAt: value.effectiveAt,
    }
    const payload =
      target.kind === "SUPPLIER"
        ? { ...common, entryId: value.target.id }
        : { ...common, paymentId: value.target.id }
    void command.run({
      payload,
      recoveryMetadata: { entryId: value.target.id, accountId },
      write: async (clientCommandId) => {
        try {
          const original = await freshSource()
          if (
            original.reversed ||
            JSON.stringify(original) !== JSON.stringify(value.target)
          )
            throw new Error(
              "The original source record changed. Refresh its correction review.",
            )
          await authority()
          assertCurrent()
        } catch (failure) {
          throw new FinanceCommandNotSentError(
            failure instanceof Error
              ? failure.message
              : "Original source record unavailable.",
          )
        }
        mutationEntered.current = true
        return target.kind === "SUPPLIER"
          ? supplierMutation.mutateAsync({
              ...common,
              entryId: value.target.id,
              clientCommandId,
            })
          : purchaseMutation.mutateAsync({
              ...common,
              paymentId: value.target.id,
              clientCommandId,
            })
      },
    })
  }
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => confirm(review)}
        backDisabled={command.uncertain && mutationEntered.current}
        confirmLabel="Undo record"
        sentence={
          <>
            This undoes{" "}
            <b>
              {formatFinanceMoney(review.target.amountMinor, book.currencyCode)}
            </b>{" "}
            {review.target.description} in your records. No money moves. The
            original stays in history, marked Undone. Then record what really
            happened.
          </>
        }
        note={
          target.kind === "SUPPLIER"
            ? "If any of this paid-ahead money was used on a bill, undo that use first."
            : "The bill it paid will show the amount as still to pay again."
        }
      >
        <FinanceDetails
          rows={[
            ["Record", review.target.description],
            ["Date", plainDay(review.effectiveAt.toISOString().slice(0, 10))],
            ["What's wrong", review.reason],
          ]}
        />
      </FinanceReview>
    )
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void prepare()
      }}
    >
      <FieldGroup className="gap-5">
        <FinanceBackTo
          label="Back to bank line"
          onBack={onBack}
          title="Fix the original record"
          description="The record is wrong. Undo it here, then record what really happened."
        />
        <div className="flex justify-between gap-3 border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="break-words font-medium">{target.description}</span>
          <span className="tabular-nums">
            {formatFinanceMoney(target.amountMinor, book.currencyCode)}
          </span>
        </div>
        {command.uncertain ? (
          <Alert appearance="dashboard">
            <AlertDescription>
              Enter the same reason and date again to finish what you started.
              If you change them, it can't be retried.
            </AlertDescription>
          </Alert>
        ) : null}
        <FinanceField label="Date">
          <DatePicker
            value={day}
            min={
              command.uncertain
                ? undefined
                : new Date(target.latestEffectiveAt).toISOString().slice(0, 10)
            }
            max={new Date().toISOString().slice(0, 10)}
            onValueChange={setDay}
            disabled={busy || command.pending}
          />
        </FinanceField>
        <FinanceField label="What's wrong with it?">
          <Input
            value={reason}
            maxLength={400}
            placeholder="Paid to the wrong Supplier"
            onChange={(event) => setReason(event.target.value)}
            disabled={busy || command.pending}
          />
        </FinanceField>
        {error || command.error ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{error ?? command.error}</AlertDescription>
          </Alert>
        ) : null}
        <FinanceFormFooter
          onCancel={
            busy || command.pending || command.uncertain ? undefined : onBack
          }
          submitLabel="Review"
          isSubmitting={busy}
          disabled={busy || command.pending || !command.ready}
        />
      </FieldGroup>
    </form>
  )
}
