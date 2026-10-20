"use client"
import {
  Button,
  DateControl,
  FieldGroup,
  FormActions,
  Input,
  SelectControl,
} from "@ewatrade/ui"

import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { useFinanceForm } from "@/components/finance/form-context"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useTRPC } from "@/trpc/client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  assertFinanceCloseChecklistScope,
  financeCloseChecklistCanProceed,
  financeCloseChecklistMatchesReview,
} from "@ewatrade/utils/finance-close-checklist"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { FinanceField, FinanceReview } from "./form-fields"
import { FinancePeriodCloseChecklistView } from "./period-close-checklist-view"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

type Review =
  | {
      action: "CLOSE"
      through: Date
      snapshot: string
      difference: string
      date: string
      reason: string
      generation: number
      checklist: RouterOutputs["finance"]["periodCloseChecklist"]
    }
  | {
      action: "REOPEN"
      periodId: string
      periodEndsAt: Date
      snapshot: string
      date: string
      reason: string
      generation: number
    }
export function FinancePeriodForm({ book }: { book: FinanceBook }) {
  const { actorUserId, tenantId } = useFinanceForm()
  const trpc = useTRPC()
  const client = useQueryClient()
  const query = useQuery(trpc.finance.periods.queryOptions({ bookId: book.id }))
  const mutation = useMutation(trpc.finance.changePeriod.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "changePeriod",
  )
  const [action, setAction] = useState<"CLOSE" | "REOPEN">("CLOSE")
  const [date, setDate] = useState(
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  )
  const [reason, setReason] = useState("")
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const reading = useRef(false)
  const mounted = useRef(false)
  const scope = useRef({ actorUserId, tenantId, bookId: book.id })
  const currentScope = useRef(scope.current)
  currentScope.current = { actorUserId, tenantId, bookId: book.id }
  useEffect(() => {
    mounted.current = true
    const unsubscribe = onlineManager.subscribe((online) => {
      if (!online) {
        generation.current++
        setError(
          "Connection changed. Review current records before confirming.",
        )
      }
    })
    return () => {
      mounted.current = false
      generation.current++
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    const saved = command.recoveryMetadata
    if (saved?.action) setAction(saved.action)
    if (saved?.through) setDate(saved.through.slice(0, 10))
  }, [command.recoveryMetadata])
  function current(token: number) {
    return (
      mounted.current &&
      generation.current === token &&
      onlineManager.isOnline() &&
      currentScope.current.actorUserId === scope.current.actorUserId &&
      currentScope.current.tenantId === scope.current.tenantId &&
      currentScope.current.bookId === scope.current.bookId
    )
  }
  async function fresh<T>(
    key: readonly unknown[],
    token: number,
    fetch: () => Promise<T>,
  ) {
    if (!current(token))
      throw new Error("Finance scope changed. Refresh the close review.")
    await client.cancelQueries({ queryKey: key, exact: true }, { silent: true })
    if (!current(token))
      throw new Error("Finance scope changed. Refresh the close review.")
    const result = await fetch()
    if (!current(token))
      throw new Error("Finance scope changed. Refresh the close review.")
    const state = client.getQueryState(key)
    if (state?.status !== "success" || state.fetchStatus !== "idle")
      throw new Error("Fresh online finance records are unavailable.")
    return result
  }
  function readPeriods(token: number) {
    const input = { bookId: book.id }
    const options = trpc.finance.periods.queryOptions(input, {
      staleTime: 0,
      retry: false,
    })
    return fresh(options.queryKey, token, () => client.fetchQuery(options))
  }
  function readBook(token: number) {
    const options = trpc.finance.book.queryOptions(undefined, {
      staleTime: 0,
      retry: false,
    })
    return fresh(options.queryKey, token, () => client.fetchQuery(options))
  }
  function readChecklist(token: number, through: Date) {
    const input = { bookId: book.id, through }
    const options = trpc.finance.periodCloseChecklist.queryOptions(input, {
      staleTime: 0,
      retry: false,
    })
    return fresh(options.queryKey, token, () => client.fetchQuery(options))
  }
  async function assertCurrentScope(token: number) {
    const actual = await readFinanceCloseScope()
    if (
      !current(token) ||
      !actual ||
      actual.actorUserId !== scope.current.actorUserId ||
      actual.tenantId !== scope.current.tenantId ||
      !["OWNER", "ADMIN"].includes(actual.role.trim().toUpperCase())
    )
      throw new Error("Your finance access changed. Refresh the close review.")
  }
  async function prepare() {
    if (preparing || reading.current) return
    reading.current = true
    const token = ++generation.current
    setPreparing(true)
    setError(null)
    try {
      if (!reason.trim()) throw new Error("Enter a reason for this change.")
      await assertCurrentScope(token)
      const [state, currentBook] = await Promise.all([
        readPeriods(token),
        readBook(token),
      ])
      if (
        !currentBook ||
        currentBook.id !== book.id ||
        currentBook.currencyCode !== book.currencyCode ||
        new Date(currentBook.startsAt).getTime() !==
          new Date(book.startsAt).getTime()
      )
        throw new Error(
          "The active finance book changed. Refresh this close review.",
        )
      await assertCurrentScope(token)
      if (action === "REOPEN") {
        const period = state.periods.find(
          (item) =>
            !item.reopenedAt &&
            state.closedThrough &&
            new Date(item.endsAt).getTime() ===
              new Date(state.closedThrough).getTime(),
        )
        if (!period) throw new Error("There is no closed period to reopen.")
        const saved = command.recoveryMetadata
        if (saved && (saved.action !== action || saved.periodId !== period.id))
          throw new Error(
            "Use the saved period details or check their result first.",
          )
        const snapshot =
          saved?.expectedSnapshotSequence ?? state.snapshotSequence
        if (snapshot !== state.snapshotSequence)
          throw new Error(
            "The saved period snapshot changed. Check its result before continuing.",
          )
        setReview({
          action,
          periodId: period.id,
          periodEndsAt: new Date(period.endsAt),
          snapshot,
          date: new Date(period.endsAt).toISOString().slice(0, 10),
          reason: reason.trim(),
          generation: token,
        })
      } else {
        const through = new Date(`${date}T23:59:59.999Z`)
        const saved = command.recoveryMetadata
        const throughIso = through.toISOString()
        if (saved && (saved.action !== action || saved.through !== throughIso))
          throw new Error(
            "Use the saved cutoff or check its result before continuing.",
          )
        const snapshot =
          saved?.expectedSnapshotSequence ?? state.snapshotSequence
        const expectedFrom = state.closedThrough
          ? new Date(new Date(state.closedThrough).getTime() + 1)
          : new Date(currentBook.startsAt)
        const checklist = await readChecklist(token, through)
        assertFinanceCloseChecklistScope({
          checklist,
          bookId: book.id,
          currencyCode: book.currencyCode,
          from: expectedFrom,
          through,
          snapshotSequence: snapshot,
        })
        if (state.snapshotSequence !== snapshot)
          throw new Error(
            "The journal changed since this close command was saved.",
          )
        if (!current(token)) return
        setReview({
          action,
          through,
          snapshot,
          difference: checklist.trialBalance.differenceMinor,
          date,
          reason: reason.trim(),
          generation: token,
          checklist,
        })
      }
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to prepare the period change.",
        )
    } finally {
      reading.current = false
      if (mounted.current) setPreparing(false)
    }
  }
  async function submit(value: Review) {
    if (preparing || reading.current || !current(value.generation)) return
    reading.current = true
    setPreparing(true)
    setError(null)
    let validated = false
    try {
      await assertCurrentScope(value.generation)
      const [state, currentBook] = await Promise.all([
        readPeriods(value.generation),
        readBook(value.generation),
      ])
      if (
        !currentBook ||
        currentBook.id !== book.id ||
        currentBook.currencyCode !== book.currencyCode ||
        new Date(currentBook.startsAt).getTime() !==
          new Date(book.startsAt).getTime()
      )
        throw new Error(
          "The active finance book changed. Refresh the close review.",
        )
      await assertCurrentScope(value.generation)
      if (value.action === "CLOSE") {
        const checklist = await readChecklist(value.generation, value.through)
        const expectedFrom = state.closedThrough
          ? new Date(new Date(state.closedThrough).getTime() + 1)
          : new Date(currentBook.startsAt)
        assertFinanceCloseChecklistScope({
          checklist,
          bookId: book.id,
          currencyCode: book.currencyCode,
          from: expectedFrom,
          through: value.through,
          snapshotSequence: value.snapshot,
        })
        if (
          state.snapshotSequence !== value.snapshot ||
          !financeCloseChecklistMatchesReview(checklist, value.checklist) ||
          !financeCloseChecklistCanProceed(checklist)
        )
          throw new Error(
            "The close checklist changed. Refresh and review the current records.",
          )
      } else {
        const period = state.periods.find(
          (item) =>
            item.id === value.periodId &&
            !item.reopenedAt &&
            state.closedThrough &&
            new Date(item.endsAt).getTime() ===
              new Date(state.closedThrough).getTime() &&
            new Date(item.endsAt).getTime() === value.periodEndsAt.getTime() &&
            new Date(item.endsAt).toISOString().slice(0, 10) === value.date,
        )
        if (
          state.snapshotSequence !== value.snapshot ||
          !state.closedThrough ||
          !period
        )
          throw new Error(
            "The latest closed period changed. Refresh and review the current records.",
          )
      }
      await assertCurrentScope(value.generation)
      if (!current(value.generation)) return
      validated = true
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to refresh the close checklist.",
        )
      return
    } finally {
      if (!validated) {
        reading.current = false
        if (mounted.current) setPreparing(false)
      }
    }
    const common = {
      bookId: book.id,
      reason: value.reason,
      expectedSnapshotSequence: value.snapshot,
    }
    const payload =
      value.action === "CLOSE"
        ? { ...common, action: value.action, through: value.through }
        : { ...common, action: value.action, periodId: value.periodId }
    try {
      await command.run({
        payload,
        recoveryMetadata: {
          action: value.action,
          expectedSnapshotSequence: value.snapshot,
          ...(value.action === "CLOSE"
            ? { through: value.through.toISOString() }
            : { periodId: value.periodId }),
        },
        write: async (clientCommandId) => {
          await assertCurrentScope(value.generation)
          if (!current(value.generation))
            throw new Error(
              "The reviewed finance scope changed. Nothing was sent.",
            )
          return mutation.mutateAsync({ ...payload, clientCommandId })
        },
      })
    } finally {
      reading.current = false
      if (mounted.current) setPreparing(false)
    }
  }
  function backFromReview() {
    if (reading.current || preparing || command.pending || command.saved) return
    generation.current++
    setReview(null)
    setError(null)
  }
  if (query.isPending) return <output>Loading periods…</output>
  if (query.isError)
    return (
      <FormFeedback appearance="dashboard">{query.error.message}</FormFeedback>
    )
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={backFromReview}
        backDisabled={preparing || reading.current}
        confirmDisabled={
          preparing ||
          !current(review.generation) ||
          !command.ready ||
          (review.action === "CLOSE" &&
            !financeCloseChecklistCanProceed(review.checklist))
        }
        onConfirm={() => void submit(review)}
      >
        <h3 className="font-medium">
          {review.action === "CLOSE"
            ? "Lock postings through"
            : "Reopen period ending"}{" "}
          {review.date} UTC
        </h3>
        <p className="text-sm">
          {review.action === "CLOSE"
            ? "New entries and corrections dated on or before this cutoff will be rejected. Later-dated entries remain available."
            : "This permits postings into the reopened period. Earlier closed periods remain locked."}
        </p>
        {review.action === "CLOSE" ? (
          <FinancePeriodCloseChecklistView checklist={review.checklist} />
        ) : null}
        <p className="text-sm">Reason: {review.reason}</p>
        <p className="text-sm">
          Reviewed journal snapshot {review.snapshot}
          {review.action === "CLOSE"
            ? ` · Trial-balance difference ${formatFinanceMoney(review.difference, book.currencyCode)}`
            : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          This date lock does not certify complete financial records or
          reconcile your cash, stock and customer balances.
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
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm">
          {query.data.closedThrough
            ? `Currently locked through ${new Date(query.data.closedThrough).toISOString().slice(0, 10)} UTC.`
            : "No posting dates are currently locked."}
        </p>
        <FinanceField label="Action">
          <SelectControl
            value={action}
            disabled={preparing}
            onValueChange={(value) =>
              setAction(value === "REOPEN" ? "REOPEN" : "CLOSE")
            }
            options={[
              { value: "CLOSE", label: <>Close a period</> },
              {
                value: "REOPEN",
                label: <>Reopen latest closed period</>,
                disabled: !query.data.closedThrough,
              },
            ]}
          />
        </FinanceField>
        {action === "CLOSE" ? (
          <FinanceField label="Lock through date (UTC)">
            <DateControl
              required
              type="date"
              value={date}
              disabled={preparing}
              min={new Date(book.startsAt).toISOString().slice(0, 10)}
              max={new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}
              onValueChange={(value) => setDate(value)}
            />
          </FinanceField>
        ) : null}
        <FinanceField label="Reason">
          <Input
            required
            maxLength={400}
            value={reason}
            disabled={preparing}
            onChange={(event) => setReason(event.target.value)}
          />
        </FinanceField>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <FormActions>
          <Button appearance="form" type="submit" disabled={preparing}>
            {preparing ? "Checking records…" : "Review period change"}
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
