"use client"

import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { FinanceCommandNotSentError } from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  Button,
  DateControl,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useFinanceForm } from "./form-context"
import { FinanceField, FinanceReview } from "./form-fields"
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
    useCompleteFinanceForm(),
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
  const label =
    target.kind === "SUPPLIER" ? "supplier entry" : "purchase payment"
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, target.kind === "SUPPLIER" ? 10 : 23),
  )
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
        throw new Error("Enter a reason of 1 to 400 characters.")
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
        throw new Error(
          "Choose a valid correction date no later than today (UTC).",
        )
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
        throw new Error(
          "This original source record has already been reversed.",
        )
      const originalAt = new Date(original.effectiveAt)
      if (
        purchase
          ? effectiveAt < originalAt
          : date < originalAt.toISOString().slice(0, 10)
      )
        throw new Error(
          "The correction cannot precede the original source record.",
        )
      const requestedAt = effectiveAt < originalAt ? originalAt : effectiveAt
      if (
        !command.uncertain &&
        requestedAt < new Date(original.latestEffectiveAt)
      )
        throw new Error(
          `Choose a correction date at or after the latest original bill activity (${new Date(original.latestEffectiveAt).toISOString()}).`,
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
      >
        <h4 className="font-medium">Reverse original {label}</h4>
        <p className="break-words">
          {review.target.description} ·{" "}
          {formatFinanceMoney(review.target.amountMinor, book.currencyCode)}
        </p>
        <p className="break-all text-xs text-muted-foreground">
          Original entry {review.target.id}
        </p>
        <p className="text-sm">
          This corrects the accounting entry and retains its original history.
          It does not send a payment or refund.{" "}
          {target.kind === "SUPPLIER"
            ? "Every consumed part of an advance must be released through its original purchase before reversal."
            : "This reopens the recorded amount owed on the original supplier bill. The purchase and its original payment remain in history."}
        </p>
        <p className="text-sm">
          Correction date: {review.effectiveAt.toISOString()} · Reason:{" "}
          {review.reason}
        </p>
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
        <h3 className="font-medium">Correct original {label}</h3>
        <p className="break-words text-sm">
          {target.description} ·{" "}
          {formatFinanceMoney(target.amountMinor, book.currencyCode)}
        </p>
        {command.uncertain ? (
          <Alert appearance="dashboard">
            <AlertDescription>
              Re-enter the original reason and date to recover the saved
              submission. Changed details cannot retry it.
            </AlertDescription>
          </Alert>
        ) : null}
        <FinanceField label="Correction date (UTC)">
          <DateControl
            value={date.slice(0, 10)}
            min={
              command.uncertain
                ? undefined
                : new Date(target.latestEffectiveAt).toISOString().slice(0, 10)
            }
            max={new Date().toISOString().slice(0, 10)}
            onValueChange={(value) =>
              setDate(
                target.kind === "SUPPLIER" || !value
                  ? value
                  : `${value}T${date.split("T")[1] || "00:00"}`,
              )
            }
            disabled={busy || command.pending}
          />
        </FinanceField>
        {target.kind === "PURCHASE_PAYMENT" ? (
          <FinanceField label="Correction time (UTC)">
            <Input
              type="time"
              step="0.001"
              value={date.split("T")[1] ?? ""}
              onChange={(event) =>
                setDate(`${date.slice(0, 10)}T${event.target.value}`)
              }
              disabled={busy || command.pending || !date.slice(0, 10)}
            />
          </FinanceField>
        ) : null}
        <FinanceField label="Reason for correction">
          <Input
            value={reason}
            maxLength={400}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy || command.pending}
          />
        </FinanceField>
        {error || command.error ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{error ?? command.error}</AlertDescription>
          </Alert>
        ) : null}
        <FormActions>
          <Button
            type="button"
            variant="outline"
            disabled={busy || command.pending || command.uncertain}
            onClick={onBack}
          >
            Back to original transaction
          </Button>
          <SubmitButton
            type="submit"
            isSubmitting={busy}
            disabled={busy || command.pending || !command.ready}
          >
            Review {label} correction
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
