"use client"

import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { FinanceCommandNotSentError } from "@/lib/finance-command-recovery"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
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
import {
  assertBankReviewUnchanged,
  bankMatchEvidence,
  bankMatchReason,
  bankMatchSelection,
} from "./bank-match-state"
import { useFinanceForm } from "./form-context"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBankStatementDetailData, FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

export type BankReviewAction =
  | { kind: "MATCH"; bankRowIds: string[]; journalLineIds: string[] }
  | { kind: "UNMATCH"; matchId: string; matchRevision: string }
type Review = {
  payload: {
    bookId: string
    accountId: string
    expectedRevision: string
    expectedSnapshotSequence: string
    reason: string
  }
  action: BankReviewAction
  amountMinor: string
  bankRecords: string[]
  postedRecords: string[]
  generation: number
  recoveryReentry: boolean
}

export function FinanceBankMatchForm({
  book,
  data,
  action,
  onBack,
}: {
  book: FinanceBook
  data: FinanceBankStatementDetailData
  action: BankReviewAction
  onBack: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { actorUserId, tenantId, setLocked } = useFinanceForm()
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    action.kind === "MATCH" ? "matchBankStatement" : "unmatchBankStatement",
  )
  const matching = useMutation(
    trpc.finance.bankStatements.match.mutationOptions(),
  )
  const releasing = useMutation(
    trpc.finance.bankStatements.unmatch.mutationOptions(),
  )
  const [reason, setReason] = useState("")
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(() => onlineManager.isOnline())
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const preparing = useRef(false)
  const mutationEntered = useRef(false)
  const initial = useRef({
    actorUserId,
    tenantId,
    bookId: book.id,
    statementId: data.statement.id,
  })
  const current = useRef(initial.current)
  current.current = {
    actorUserId,
    tenantId,
    bookId: book.id,
    statementId: data.statement.id,
  }
  useEffect(() => {
    mounted.current = true
    const unsubscribe = onlineManager.subscribe((value) => {
      generation.current++
      setOnline(value)
      setError("Connection changed. Refresh before confirming.")
    })
    return () => {
      mounted.current = false
      generation.current++
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    setLocked(busy || command.pending)
    return () => setLocked(false)
  }, [busy, command.pending, setLocked])
  function assertCurrent(token: number) {
    if (
      !mounted.current ||
      token !== generation.current ||
      !onlineManager.isOnline() ||
      JSON.stringify(initial.current) !== JSON.stringify(current.current)
    )
      throw new Error(
        "Your connection or access changed. Open this statement again.",
      )
  }
  async function authority(token: number) {
    assertCurrent(token)
    const actual = await readFinanceCloseScope()
    assertCurrent(token)
    if (
      !actual ||
      actual.actorUserId !== initial.current.actorUserId ||
      actual.tenantId !== initial.current.tenantId ||
      !["OWNER", "ADMIN"].includes(actual.role.toUpperCase())
    )
      throw new Error("Your access changed. Open this statement again.")
  }
  async function fresh<T>(
    key: readonly unknown[],
    token: number,
    fetch: () => Promise<T>,
  ) {
    assertCurrent(token)
    await client.cancelQueries({ queryKey: key, exact: true }, { silent: true })
    assertCurrent(token)
    const value = await fetch()
    assertCurrent(token)
    const state = client.getQueryState(key)
    if (state?.status !== "success" || state.fetchStatus !== "idle")
      throw new Error("Latest records aren't available. Check your connection.")
    return value
  }
  async function sources(token: number) {
    await authority(token)
    const bookOptions = trpc.finance.book.queryOptions(undefined, {
      staleTime: 0,
      retry: false,
    })
    const actualBook = await fresh(bookOptions.queryKey, token, () =>
      client.fetchQuery(bookOptions),
    )
    if (
      !actualBook ||
      actualBook.id !== book.id ||
      actualBook.tenantId !== initial.current.tenantId ||
      actualBook.currencyCode !== book.currencyCode ||
      !actualBook.accounts.some(
        (account) =>
          account.id === data.accountId &&
          account.bookId === book.id &&
          account.kind === "ASSET" &&
          ["BANK", "CLEARING"].includes(account.purpose) &&
          !account.archivedAt,
      )
    )
      throw new Error("The money account changed.")
    const options = trpc.finance.bankStatements.get.queryOptions(
      { bookId: book.id, statementId: initial.current.statementId },
      { staleTime: 0, retry: false },
    )
    const source = await fresh(options.queryKey, token, () =>
      client.fetchQuery(options),
    )
    if (
      source.bookId !== book.id ||
      source.accountId !== data.accountId ||
      source.statement.id !== initial.current.statementId
    )
      throw new Error("These records belong to another account.")
    return source
  }
  async function selectedEvidence(
    source: FinanceBankStatementDetailData,
    selected: BankReviewAction,
    token: number,
  ) {
    if (selected.kind === "MATCH") {
      const group = bankMatchSelection(
        source,
        selected.bankRowIds,
        selected.journalLineIds,
      )
      return {
        amountMinor: group.amountMinor,
        bankRecords: group.bank.map(
          (row) => `${row.externalId} · ${money(row.amountMinor)}`,
        ),
        postedRecords: group.journal.map(
          (line) =>
            `Record ${line.sequence} · ${line.description} · ${money(line.amountMinor)}`,
        ),
      }
    }
    const options = trpc.finance.bankStatements.history.queryOptions(
      {
        bookId: book.id,
        accountId: data.accountId,
        snapshotRevision: selected.matchRevision,
        limit: 1,
      },
      { staleTime: 0, retry: false },
    )
    const history = await fresh(options.queryKey, token, () =>
      client.fetchQuery(options),
    )
    const original = history.items[0]
    if (
      history.bookId !== book.id ||
      history.accountId !== data.accountId ||
      original?.id !== selected.matchId ||
      original.kind !== "MATCH" ||
      original.revision !== selected.matchRevision
    )
      throw new Error("We couldn't check the original match.")
    const evidence = bankMatchEvidence(original)
    if (
      evidence.bank.some(
        (row) =>
          row.statementId !== source.statement.id ||
          !source.rows.some(
            (current) =>
              current.id === row.id && current.activeMatchId === original.id,
          ),
      ) ||
      source.rows.filter((row) => row.activeMatchId === original.id).length !==
        evidence.bank.length
    )
      throw new Error("This match was already undone or has changed.")
    return {
      amountMinor: evidence.amountMinor,
      bankRecords: evidence.bank.map(
        (row) => `${row.externalId} · ${money(row.amountMinor)}`,
      ),
      postedRecords: evidence.journal.map(
        (line) =>
          `Record ${line.sequence} · ${money((BigInt(line.debitMinor) - BigInt(line.creditMinor)).toString())}`,
      ),
    }
  }
  async function prepare() {
    if (preparing.current || !command.ready || command.saved) return
    preparing.current = true
    setBusy(true)
    setError(null)
    const token = ++generation.current
    try {
      const source = await sources(token)
      const saved = command.recoveryMetadata
      let expectedRevision = source.bankRevision
      let expectedSnapshotSequence = source.snapshotSequence
      let selected =
        action.kind === "MATCH"
          ? {
              ...action,
              bankRowIds: [...action.bankRowIds].sort(),
              journalLineIds: [...action.journalLineIds].sort(),
            }
          : action
      if (command.uncertain) {
        const identity = saved?.bankReview
        if (
          !identity ||
          identity.statementId !== initial.current.statementId ||
          saved.accountId !== data.accountId ||
          !saved.expectedBankRevision ||
          !saved.expectedSnapshotSequence ||
          identity.action !== action.kind
        )
          throw new Error(
            "Only the same action can be retried. Check the saved result first.",
          )
        expectedRevision = saved.expectedBankRevision
        expectedSnapshotSequence = saved.expectedSnapshotSequence
        if (
          identity.action === "MATCH" &&
          identity.bankRowIds &&
          identity.journalLineIds
        )
          selected = {
            kind: "MATCH",
            bankRowIds: identity.bankRowIds,
            journalLineIds: identity.journalLineIds,
          }
        else if (
          identity.action === "UNMATCH" &&
          identity.matchId &&
          identity.matchRevision
        )
          selected = {
            kind: "UNMATCH",
            matchId: identity.matchId,
            matchRevision: identity.matchRevision,
          }
        else throw new Error("The saved match is incomplete.")
      }
      const evidence = await selectedEvidence(source, selected, token)
      await authority(token)
      assertCurrent(token)
      setReview({
        ...evidence,
        action: selected,
        generation: token,
        recoveryReentry: command.uncertain && !mutationEntered.current,
        payload: {
          bookId: book.id,
          accountId: data.accountId,
          expectedRevision: expectedRevision,
          expectedSnapshotSequence: expectedSnapshotSequence,
          reason: bankMatchReason(reason),
        },
      })
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn't check this match.",
        )
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function confirm(value: Review) {
    if (preparing.current || command.pending || command.saved) return
    preparing.current = true
    setBusy(true)
    setError(null)
    const token = generation.current
    try {
      // Revalidate the exact source under the command lock after hashing/status awaits.
      const payload =
        value.action.kind === "MATCH"
          ? {
              ...value.payload,
              bankRowIds: value.action.bankRowIds,
              journalLineIds: value.action.journalLineIds,
            }
          : { ...value.payload, matchId: value.action.matchId }
      if (value.generation !== token && !command.uncertain)
        throw new Error(
          "Connection changed. Go back and check these lines again.",
        )
      const before = await sources(token)
      if (!command.uncertain) {
        assertBankReviewUnchanged(before, {
          ...value.payload,
          statementId: initial.current.statementId,
        })
        await selectedEvidence(before, value.action, token)
      }
      await authority(token)
      await command.run({
        payload,
        recoveryMetadata: {
          accountId: data.accountId,
          expectedBankRevision: value.payload.expectedRevision,
          expectedSnapshotSequence: value.payload.expectedSnapshotSequence,
          bankReview:
            value.action.kind === "MATCH"
              ? {
                  statementId: data.statement.id,
                  action: "MATCH",
                  bankRowIds: value.action.bankRowIds,
                  journalLineIds: value.action.journalLineIds,
                }
              : {
                  statementId: data.statement.id,
                  action: "UNMATCH",
                  matchId: value.action.matchId,
                  matchRevision: value.action.matchRevision,
                },
        },
        write: async (clientCommandId) => {
          try {
            const source = await sources(token)
            assertBankReviewUnchanged(source, {
              ...value.payload,
              statementId: initial.current.statementId,
            })
            await selectedEvidence(source, value.action, token)
            await authority(token)
            assertCurrent(token)
          } catch (failure) {
            throw new FinanceCommandNotSentError(
              failure instanceof Error
                ? failure.message
                : "We couldn't check the original lines.",
            )
          }
          mutationEntered.current = true
          if (value.action.kind === "MATCH")
            return matching.mutateAsync({
              ...value.payload,
              bankRowIds: value.action.bankRowIds,
              journalLineIds: value.action.journalLineIds,
              clientCommandId,
            })
          return releasing.mutateAsync({
            ...value.payload,
            matchId: value.action.matchId,
            clientCommandId,
          })
        },
      })
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn't confirm this match.",
        )
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const money = (amount: string) =>
    formatFinanceMoney(amount, book.currencyCode)
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => {
          setReview(null)
          setError(null)
        }}
        backDisabled={busy || (command.uncertain && !review.recoveryReentry)}
        confirmDisabled={busy || !online}
        onConfirm={() => void confirm(review)}
      >
        <h3 className="font-medium">
          {review.action.kind === "MATCH"
            ? "Match these lines"
            : "Unmatch these lines"}
        </h3>
        <p className="text-sm">
          {data.statement.reference} · {money(review.amountMinor)}
        </p>
        <section className="grid gap-2 border border-border p-4 text-sm">
          <h4 className="font-medium">Bank lines</h4>
          {review.bankRecords.map((text, index) => (
            <p key={`${index}:${text}`}>{text}</p>
          ))}
          <h4 className="font-medium">Your records</h4>
          {review.postedRecords.map((text, index) => (
            <p key={`${index}:${text}`}>{text}</p>
          ))}
        </section>
        <p className="break-words text-sm">
          {review.action.kind === "MATCH" ? "Why they match" : "Why unmatch"}:{" "}
          {review.payload.reason}
        </p>
        <p className="text-xs text-muted-foreground">
          As of the latest records.
        </p>
        <Alert appearance="dashboard">
          <AlertDescription>
            {review.action.kind === "MATCH"
              ? "This links the bank lines to your records. It doesn't move any money."
              : "This unlinks them. The match stays in history. It doesn't undo any payment."}
          </AlertDescription>
        </Alert>
        {error ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
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
        <h3 className="font-medium">
          {action.kind === "MATCH"
            ? "Match these lines"
            : "Unmatch these lines"}
        </h3>
        {command.uncertain ? (
          <Alert appearance="dashboard">
            <AlertTitle>Finish what you started</AlertTitle>
            <AlertDescription>
              Enter the same reason again. The lines you picked are kept. If you
              change anything, start again.
            </AlertDescription>
          </Alert>
        ) : null}
        <FinanceField
          label={action.kind === "MATCH" ? "Why they match" : "Why unmatch"}
        >
          <Input
            required
            maxLength={400}
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              action.kind === "MATCH"
                ? "Say how these lines and records go together"
                : "Say why you are unmatching them"
            }
          />
        </FinanceField>
        {error || command.error ? (
          <Alert variant="destructive" appearance="dashboard">
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
            Back to statement
          </Button>
          <SubmitButton
            type="submit"
            isSubmitting={busy}
            disabled={busy || !command.ready || !online || command.saved}
          >
            {action.kind === "MATCH" ? "Match" : "Unmatch"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
