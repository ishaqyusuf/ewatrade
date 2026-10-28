"use client"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { formatLedgerDate, ledgerLabels } from "../types"
import { RefundCommandStatus } from "./refund-command-status"
import { refundStatus, refundStatusWords } from "./refund-model"
import {
  type RefundRequestFields,
  type RefundRequestPayload,
  prepareRefundRequest,
  refundRequestRecovery,
  refundRequestReviewIsCurrent,
} from "./refund-request-model"

type Account = RouterOutputs["customerLedger"]["accountDetail"]
type Source = RouterOutputs["customerLedger"]["sources"]["sources"][number]

const EMPTY: RefundRequestFields = {
  sourceId: "",
  amount: "",
  reason: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
}

/**
 * Record a customer's request to get paid-ahead money back, from their
 * statement. Saving only records the request: the money stays usable until
 * someone approves and holds it, and nothing is sent from here.
 */
export function RefundRequestForm({
  accountId,
  actorUserId,
  tenantId,
  onDone,
  onBusyChange,
}: {
  accountId: string
  actorUserId: string
  tenantId: string
  onDone: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const trpc = useTRPC()
  const account = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false, staleTime: 0 },
    ),
  )
  if (account.isPending)
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        Loading paid-ahead money…
      </output>
    )
  if (account.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          Couldn’t load this customer’s money. {account.error.message}
        </AlertDescription>
        <Button variant="outline" onClick={() => void account.refetch()}>
          Try again
        </Button>
      </Alert>
    )
  const book = account.data.book
  if (!book)
    return (
      <p className="text-sm">
        Set up Finance in {account.data.currencyCode} before recording refund
        requests.
      </p>
    )
  return (
    <RequestFlow
      account={account.data}
      bookId={book.id}
      actorUserId={actorUserId}
      tenantId={tenantId}
      onRefreshAccount={() => void account.refetch()}
      onDone={onDone}
      onBusyChange={onBusyChange}
    />
  )
}

function sourceLabel(source: Source, currencyCode: string) {
  const what = source.order
    ? `Order ${source.order.orderNumber}`
    : (ledgerLabels[source.kind] ?? "Payment")
  return `${what} · ${formatLedgerDate(source.effectiveAt)} · ${formatFinanceMoney(source.remainingAmountMinor, currencyCode)} left`
}

function RequestFlow({
  account,
  bookId,
  actorUserId,
  tenantId,
  onRefreshAccount,
  onDone,
  onBusyChange,
}: {
  account: Account
  bookId: string
  actorUserId: string
  tenantId: string
  onRefreshAccount: () => void
  onDone: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const trpc = useTRPC()
  const command = useCustomerLedgerCommand({
    actorUserId,
    tenantId,
    bookId,
    accountId: account.id,
  })
  const save = useMutation(trpc.customerLedger.requestRefund.mutationOptions())
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const sources = useQuery(
    trpc.customerLedger.sources.queryOptions(
      {
        accountId: account.id,
        side: "CREDIT",
        expectedRevision: account.revision,
        afterSequence: cursors.at(-1),
        limit: 50,
      },
      { retry: false, staleTime: 0 },
    ),
  )
  const [fields, setFields] = useState<RefundRequestFields>(EMPTY)
  // Bank details live only in this form's memory: never the URL or storage.
  const [review, setReview] = useState<{
    payload: RefundRequestPayload
    sourceLabel: string
    /** Rebuilt for the exact retry of an unconfirmed earlier request. */
    retry: boolean
  } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    onBusyChange(command.pending)
    return () => onBusyChange(false)
  }, [command.pending, onBusyChange])

  // Only a successful current read can start a new request; a failed or
  // pending read never falls back to older cached payments.
  const sourcesReady =
    sources.status === "success" &&
    sources.data.currentRevision === account.revision
  const list = sourcesReady ? sources.data.sources : []
  const recovery = refundRequestRecovery(command.retained?.command ?? null)
  const money = (minor: string) =>
    formatFinanceMoney(minor, account.currencyCode)
  const set = (name: keyof RefundRequestFields, value: string) => {
    setFields((current) => ({ ...current, [name]: value }))
    setProblem(null)
  }
  const refresh = () => {
    onRefreshAccount()
    void sources.refetch()
  }

  const reviewedSource = review
    ? list.find((row) => row.id === review.payload.creditEntryId)
    : undefined
  const current =
    review && sourcesReady
      ? refundRequestReviewIsCurrent(review.payload, {
          revision: sources.data?.currentRevision,
          source: reviewedSource,
        })
      : false
  // A new request needs a fresh review; an unconfirmed earlier request is
  // retried only from its own rebuilt details (the runner checks they match).
  const canSave = review
    ? review.retry
      ? recovery.kind === "own"
      : recovery.kind === "none" && current
    : false

  function prepare() {
    if (!sourcesReady) {
      setProblem("Paid-ahead payments haven’t loaded. Refresh and try again.")
      return
    }
    if (recovery.kind === "other" || recovery.kind === "own-unrebuildable") {
      setProblem(
        "Check whether the earlier change was saved before starting a request.",
      )
      return
    }
    const source = list.find((row) => row.id === fields.sourceId)
    const prepared = prepareRefundRequest(fields, {
      account: {
        id: account.id,
        bookId,
        // An exact retry keeps the revision the earlier send was made with.
        revision:
          recovery.kind === "own"
            ? recovery.expectedRevision
            : account.revision,
      },
      source,
    })
    if ("problem" in prepared) {
      setProblem(prepared.problem)
      return
    }
    setReview({
      payload: prepared.payload,
      sourceLabel: source ? sourceLabel(source, account.currencyCode) : "",
      retry: recovery.kind === "own",
    })
  }

  async function confirm() {
    // Re-read at press time; the runner also refuses anything but an exact retry.
    if (!review || !canSave) return
    const attempt = review.payload
    await command.run("requestRefund", attempt, (clientCommandId) =>
      save.mutateAsync({ ...attempt, clientCommandId }),
    )
  }

  if (command.saved) {
    // Only this form's own server answer proves a refund request was made.
    // "Check if it was saved" can confirm an earlier change of any kind.
    const own = save.data
    const status = own ? refundStatus(own.status) : null
    return (
      <section className="grid gap-4">
        {own ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
            <b className="font-medium">Refund request created</b> ·{" "}
            {money(own.amountMinor)} ·{" "}
            {status ? refundStatusWords[status].label : own.status}. Creating a
            request doesn’t hold or send money. Its current state is in this
            customer’s refund requests.
          </p>
        ) : (
          <p className="rounded-lg border border-border px-3 py-2 text-sm">
            <b className="font-medium">An earlier change was saved.</b> It may
            not be a refund request. Close this and look at the customer’s
            latest money and requests before making another one.
          </p>
        )}
        {command.notice ? (
          <output aria-live="polite" className="text-sm">
            {command.notice}
          </output>
        ) : null}
        <FormActions>
          <Button onClick={onDone}>Done</Button>
        </FormActions>
      </section>
    )
  }

  if (review) {
    const destination = review.payload.destination
    return (
      <section className="grid gap-4">
        <h3 className="text-base font-medium">Check the refund request</h3>
        <p className="text-2xl font-semibold tabular-nums">
          {money(review.payload.amountMinor)}
        </p>
        <dl className="grid border border-border text-sm">
          {(
            [
              ["Customer", account.customer.name],
              ["From", review.sourceLabel],
              [
                "Send to",
                `${destination.bankName} · ${destination.accountNumber}`,
              ],
              ["Account holder", destination.accountName],
              ["Reason", review.payload.reason],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[minmax(7rem,35%)_minmax(0,1fr)] gap-3 border-t border-border px-3 py-2 first:border-t-0"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          This saves a request only. The money stays usable until someone
          approves and holds it, and nothing is sent from here. Typing these
          details doesn’t check the account is {account.customer.name}’s;
          approving asks for that check.
        </p>
        {review.retry ? (
          <p className="text-xs text-muted-foreground">
            Retrying the earlier unconfirmed request with exactly these details.
            If anything differs, it won’t be sent; check whether it was saved
            instead.
          </p>
        ) : !canSave ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>
              {recovery.kind === "none"
                ? "This customer’s money changed since you reviewed this, or it couldn’t be checked. Go back and review it again."
                : "Check whether the earlier change was saved first."}
            </AlertDescription>
          </Alert>
        ) : null}
        <RefundCommandStatus command={command} onRefresh={refresh} />
        <FormActions>
          <Button
            variant="outline"
            disabled={command.pending}
            onClick={() => setReview(null)}
          >
            Back
          </Button>
          <SubmitButton
            type="button"
            isSubmitting={command.pending}
            disabled={!command.ready || command.pending || !canSave}
            onClick={() => void confirm()}
          >
            Save request
          </SubmitButton>
        </FormActions>
      </section>
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        prepare()
      }}
    >
      <p className="font-medium">
        {account.customer.name} · {account.currencyCode}
      </p>
      <Alert appearance="dashboard">
        <AlertDescription>
          For a customer asking for paid-ahead money back. This records the
          request for review; it doesn’t hold or send money. If you’ve already
          given the money back, use Return paid-ahead money on the statement
          instead.
        </AlertDescription>
      </Alert>
      <RefundCommandStatus command={command} onRefresh={refresh} />
      {recovery.kind === "own" ? (
        <p className="text-xs text-muted-foreground">
          The earlier refund request wasn’t confirmed. To retry it, enter
          exactly the same payment, amount, reason and bank details. If that
          payment is no longer available here, check whether the earlier request
          was saved before starting another one.
        </p>
      ) : null}
      <FieldGroup>
        {sources.isError ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>
              Couldn’t load paid-ahead payments. {sources.error.message}
            </AlertDescription>
            <Button variant="outline" onClick={refresh}>
              Refresh
            </Button>
          </Alert>
        ) : (
          <ControlField
            label="Return from"
            description={
              sources.isPending
                ? "Loading paid-ahead payments…"
                : !sourcesReady
                  ? "This customer’s money just changed. Refresh to see current payments."
                  : list.length
                    ? "Payments with money left that isn’t held for another refund."
                    : "No paid-ahead payment has money left to return."
            }
          >
            <SelectControl
              aria-label="Return from"
              value={fields.sourceId}
              disabled={!sourcesReady || !list.length}
              placeholder="Choose a payment"
              onValueChange={(value) => set("sourceId", value)}
              options={list.map((row) => ({
                value: row.id,
                label: sourceLabel(row, account.currencyCode),
              }))}
            />
          </ControlField>
        )}
        {cursors.length > 1 || sources.data?.nextCursor ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cursors.length === 1 || sources.isFetching}
              onClick={() => {
                setCursors((value) => value.slice(0, -1))
                set("sourceId", "")
              }}
            >
              Earlier
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!sources.data?.nextCursor || sources.isFetching}
              onClick={() => {
                setCursors((value) => [
                  ...value,
                  sources.data?.nextCursor ?? undefined,
                ])
                set("sourceId", "")
              }}
            >
              Later
            </Button>
          </div>
        ) : null}
        <ControlField label="Amount">
          <MoneyInput
            currencyCode={account.currencyCode}
            value={fields.amount}
            onChange={(event) => set("amount", event.target.value)}
          />
        </ControlField>
        <ControlField label="Reason" description="Seen by your team.">
          <Textarea
            rows={2}
            maxLength={400}
            value={fields.reason}
            onChange={(event) => set("reason", event.target.value)}
          />
        </ControlField>
        <ControlField label="Bank name">
          <Input
            maxLength={120}
            autoComplete="off"
            value={fields.bankName}
            placeholder="As the customer gave it"
            onChange={(event) => set("bankName", event.target.value)}
          />
        </ControlField>
        <ControlField label="Account number">
          <Input
            maxLength={34}
            autoComplete="off"
            value={fields.accountNumber}
            onChange={(event) => set("accountNumber", event.target.value)}
          />
        </ControlField>
        <ControlField label="Account holder">
          <Input
            maxLength={160}
            autoComplete="off"
            value={fields.accountName}
            onChange={(event) => set("accountName", event.target.value)}
          />
        </ControlField>
      </FieldGroup>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <FormActions>
        <SubmitButton
          type="submit"
          isSubmitting={false}
          disabled={!command.ready || command.pending || !sourcesReady}
        >
          Review
        </SubmitButton>
      </FormActions>
    </form>
  )
}
