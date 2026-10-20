"use client"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import {
  type CustomerLedgerMode,
  useCustomerLedgerParams,
} from "@/hooks/use-customer-ledger-params"
import {
  type LedgerFields,
  customerLedgerReviewTotals,
  eligibleLedgerMoneyAccounts,
  ledgerFieldsSchema,
  prepareCustomerLedgerCommand,
} from "@/lib/customer-ledger/command-input"
import { useTRPC } from "@/trpc/client"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import type { LedgerAccount, LedgerRequest } from "../types"
import { ledgerLabels, paymentMethodLabels } from "../types"
import { useCustomerLedgerForm } from "./form-context"
const OPERATION_WORDS: Record<string, string> = {
  recordOpening: "starting balance",
  recordReceipt: "payment",
  applyCredit: "use on an Order",
  releaseAllocation: "undo",
  refundUnusedCredit: "refund",
  reverseEntry: "undo",
}

/** ISO time to the value a datetime-local field shows, in local time. */
function toLocalDateTime(iso: string | undefined) {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function CustomerLedgerCommandForm({
  account,
  actorUserId,
  tenantId,
  mode,
  entryId,
  allocationId,
}: {
  account: LedgerAccount
  actorUserId: string
  tenantId: string
  mode: Exclude<CustomerLedgerMode, "entry">
  entryId?: string
  allocationId?: string
}) {
  const trpc = useTRPC()
  const { close, ledgerAllocationAfter } = useCustomerLedgerParams()
  const { setLocked } = useCustomerLedgerForm()
  const command = useCustomerLedgerCommand({
    actorUserId,
    tenantId,
    bookId: account.book?.id ?? "",
    accountId: account.id,
  })
  const [review, setReview] = useState<LedgerRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creditCursors, setCreditCursors] = useState<(string | undefined)[]>([
    undefined,
  ])
  const [debitCursors, setDebitCursors] = useState<(string | undefined)[]>([
    undefined,
  ])
  const form = useForm<LedgerFields>({
    resolver: zodResolver(ledgerFieldsSchema),
    defaultValues: {
      amount: "",
      reason: "",
      reference: "",
      method: "CASH",
      direction: "DEBT",
      moneyAccountId: "",
      creditEntryId: "",
      chargeEntryId: "",
      revision: account.revision,
      date: new Date().toISOString(),
    },
  })
  const needsCredit = mode === "apply" || mode === "refund"
  const needsMoney = mode === "receipt" || mode === "refund"
  const needsDetail = mode === "reverse" || mode === "release"
  const credits = useQuery(
    trpc.customerLedger.sources.queryOptions(
      {
        accountId: account.id,
        side: "CREDIT",
        expectedRevision: account.revision,
        afterSequence: creditCursors.at(-1),
        limit: 50,
      },
      { enabled: needsCredit, retry: false },
    ),
  )
  const debits = useQuery(
    trpc.customerLedger.sources.queryOptions(
      {
        accountId: account.id,
        side: "DEBIT",
        expectedRevision: account.revision,
        afterSequence: debitCursors.at(-1),
        limit: 50,
      },
      { enabled: mode === "apply", retry: false },
    ),
  )
  const money = useQuery(
    trpc.finance.balances.queryOptions(
      { bookId: account.book?.id ?? "" },
      { enabled: needsMoney, retry: false },
    ),
  )
  const detail = useQuery(
    trpc.customerLedger.entryDetail.queryOptions(
      {
        accountId: account.id,
        entryId: entryId ?? "",
        afterAllocationId: ledgerAllocationAfter ?? undefined,
        expectedRevision: account.revision,
        limit: 50,
      },
      { enabled: needsDetail && Boolean(entryId), retry: false },
    ),
  )
  const opening = useMutation(
    trpc.customerLedger.recordOpening.mutationOptions(),
  )
  const receipt = useMutation(
    trpc.customerLedger.recordReceipt.mutationOptions(),
  )
  const apply = useMutation(trpc.customerLedger.applyCredit.mutationOptions())
  const release = useMutation(
    trpc.customerLedger.releaseAllocation.mutationOptions(),
  )
  const refund = useMutation(
    trpc.customerLedger.refundUnusedCredit.mutationOptions(),
  )
  const reverse = useMutation(
    trpc.customerLedger.reverseEntry.mutationOptions(),
  )
  useEffect(() => {
    setLocked(command.pending)
    return () => setLocked(false)
  }, [command.pending, setLocked])
  const dataError =
    credits.error?.message ??
    debits.error?.message ??
    money.error?.message ??
    detail.error?.message
  const loading =
    (needsCredit && credits.isPending) ||
    (mode === "apply" && debits.isPending) ||
    (needsMoney && money.isPending) ||
    (needsDetail && detail.isPending)
  function prepare(fields: LedgerFields) {
    try {
      if (dataError || loading)
        throw new Error("Refresh the list above, then continue.")
      setReview(
        prepareCustomerLedgerCommand({
          mode,
          account,
          fields,
          credits: credits.data?.sources,
          charges: debits.data?.sources,
          moneyAccounts: money.data?.accounts,
          detail: detail.data,
          allocationId,
        }),
      )
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the details and try again.",
      )
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review
    await command.run(attempt.operation, attempt.payload, (id) => {
      const clientCommandId = id
      switch (attempt.operation) {
        case "recordOpening":
          return opening.mutateAsync({ ...attempt.payload, clientCommandId })
        case "recordReceipt":
          return receipt.mutateAsync({ ...attempt.payload, clientCommandId })
        case "applyCredit":
          return apply.mutateAsync({ ...attempt.payload, clientCommandId })
        case "releaseAllocation":
          return release.mutateAsync({ ...attempt.payload, clientCommandId })
        case "refundUnusedCredit":
          return refund.mutateAsync({ ...attempt.payload, clientCommandId })
        case "reverseEntry":
          return reverse.mutateAsync({ ...attempt.payload, clientCommandId })
      }
    })
  }
  useEffect(() => {
    const metadata = command.retained?.command.recoveryMetadata
    if (metadata?.asOf) form.setValue("date", metadata.asOf)
    if (metadata?.expectedSnapshotSequence)
      form.setValue("revision", metadata.expectedSnapshotSequence)
  }, [command.retained, form])
  const label = (s: NonNullable<typeof credits.data>["sources"][number]) =>
    `${s.order ? `Order ${s.order.orderNumber}` : (ledgerLabels[s.kind] ?? "Entry")} · ${formatFinanceMoney(s.remainingAmountMinor, account.currencyCode)} left`
  const text = (
    name: "reason" | "reference" | "date" | "revision",
    label: string,
    multiline = false,
  ) => (
    <ControlField label={label} error={form.formState.errors[name]?.message}>
      {multiline ? (
        <Textarea {...form.register(name)} maxLength={400} />
      ) : name === "date" ? (
        <Input
          type="datetime-local"
          value={toLocalDateTime(form.watch("date"))}
          onChange={(event) => {
            const parsed = new Date(event.target.value)
            if (!Number.isNaN(parsed.getTime()))
              form.setValue("date", parsed.toISOString(), {
                shouldValidate: true,
              })
          }}
        />
      ) : (
        <Input {...form.register(name)} />
      )}
    </ControlField>
  )
  const select = (
    name:
      | "direction"
      | "method"
      | "moneyAccountId"
      | "creditEntryId"
      | "chargeEntryId",
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <ControlField label={label}>
          <SelectControl
            value={field.value}
            onValueChange={field.onChange}
            options={options}
          />
        </ControlField>
      )}
    />
  )
  const after = review ? customerLedgerReviewTotals(account, review) : null
  const creditId =
    review && "creditEntryId" in review.payload
      ? review.payload.creditEntryId
      : undefined
  const chargeId =
    review && "chargeEntryId" in review.payload
      ? review.payload.chargeEntryId
      : undefined
  const moneyId =
    review && "moneyAccountId" in review.payload
      ? review.payload.moneyAccountId
      : undefined
  return (
    <FieldGroup className="gap-5">
      <p className="font-medium">
        {account.customer.name} · {account.currencyCode}
      </p>
      <Alert appearance="dashboard">
        <AlertDescription>
          {mode === "receipt"
            ? "Record money you’ve already received. It’s kept as paid ahead until it’s used on an Order."
            : mode === "apply" || mode === "release"
              ? "This only changes which Order the money counts toward. No money moves and the balance stays the same."
              : mode === "refund"
                ? "Record money you’ve already given back from what they paid ahead. This doesn’t send money."
                : mode === "reverse"
                  ? "Adds an undo line. The original stays on the statement. This doesn’t send money."
                  : "Add what they owed, or had paid ahead, on the day you started using ewatrade. No money moves."}
        </AlertDescription>
      </Alert>
      {command.retained ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            We couldn’t confirm whether the last{" "}
            {OPERATION_WORDS[command.retained.command.operation] ?? "record"}{" "}
            was saved. Check first. If you try again, enter exactly the same
            details, including the date; amounts and notes aren’t kept on this
            device.
          </AlertDescription>
          <Button
            variant="outline"
            disabled={command.pending}
            onClick={() => void command.acknowledge()}
          >
            Check if it was saved
          </Button>
        </Alert>
      ) : null}
      {command.error || error || dataError ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            {command.error ?? error ?? dataError}
          </AlertDescription>
          <Button
            variant="outline"
            disabled={command.pending}
            onClick={() => {
              void credits.refetch()
              void debits.refetch()
              void money.refetch()
              if (entryId) void detail.refetch()
            }}
          >
            Refresh
          </Button>
        </Alert>
      ) : null}
      {command.notice ? (
        <output aria-live="polite">{command.notice}</output>
      ) : null}
      {command.saved ? (
        <Button onClick={() => void close()}>Done</Button>
      ) : review ? (
        <>
          <h3 className="text-lg font-medium">Check and save</h3>
          <p className="text-2xl tabular-nums">
            {formatFinanceMoney(
              "amountMinor" in review.payload
                ? review.payload.amountMinor
                : (detail.data?.entry.amountMinor ?? "0"),
              account.currencyCode,
            )}
          </p>
          <div className="grid gap-2 text-sm">
            {review.operation === "recordOpening" ? (
              <p>
                {review.payload.direction === "DEBT"
                  ? "They owe you"
                  : "They paid ahead"}{" "}
                · Starting balance
              </p>
            ) : null}
            {"creditEntryId" in review.payload ? (
              <p>
                From {(() => {
                  const source = credits.data?.sources.find(
                    (s) => s.id === creditId,
                  )
                  return source ? label(source) : "the selected payment"
                })()}
              </p>
            ) : null}
            {"chargeEntryId" in review.payload ? (
              <p>
                On {(() => {
                  const source = debits.data?.sources.find(
                    (s) => s.id === chargeId,
                  )
                  return source?.order
                    ? `Order ${source.order.orderNumber}`
                    : source
                      ? (ledgerLabels[source.kind] ?? "the selected balance")
                      : "the selected balance"
                })()}
              </p>
            ) : null}
            {"moneyAccountId" in review.payload ? (
              <p>
                Paid into{" "}
                {money.data?.accounts.find((a) => a.id === moneyId)?.name} ·{" "}
                {paymentMethodLabels[review.payload.method] ?? "Other"}
              </p>
            ) : (
              <p>
                {mode === "reverse"
                  ? "Adds an undo line; no money is sent."
                  : "No money moves."}
              </p>
            )}
            {"reason" in review.payload ? (
              <p>{review.payload.reason}</p>
            ) : "description" in review.payload ? (
              <p>{review.payload.description}</p>
            ) : null}
            {"effectiveAt" in review.payload &&
            review.payload.effectiveAt instanceof Date ? (
              <p>{review.payload.effectiveAt.toISOString()} UTC</p>
            ) : null}
          </div>
          {after ? (
            <dl className="grid gap-3 border-y border-border py-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Owes you after this</dt>
                <dd>
                  {formatFinanceMoney(
                    after.outstandingDebtMinor,
                    account.currencyCode,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid ahead after this</dt>
                <dd>
                  {formatFinanceMoney(
                    after.availableCreditMinor,
                    account.currencyCode,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Balance after this</dt>
                <dd>
                  {formatFinanceMoney(
                    after.netBalanceMinor,
                    account.currencyCode,
                  )}
                </dd>
              </div>
              <p className="text-xs text-muted-foreground">
                These figures are checked again when you save, in case someone
                recorded something in the meantime.
              </p>
            </dl>
          ) : null}
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
              disabled={!command.ready || command.pending}
              onClick={() => void confirm()}
            >
              Save
            </SubmitButton>
          </FormActions>
        </>
      ) : (
        <form onSubmit={form.handleSubmit(prepare)}>
          <FieldGroup>
            {mode === "opening"
              ? select("direction", "Starting balance", [
                  { value: "DEBT", label: "They owe you" },
                  { value: "CREDIT", label: "They paid ahead" },
                ])
              : null}
            {needsCredit
              ? select("creditEntryId", "Money paid ahead", [
                  { value: "", label: "Choose a payment" },
                  ...(credits.data?.sources ?? []).map((s) => ({
                    value: s.id,
                    label: label(s),
                  })),
                ])
              : null}
            {needsCredit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={creditCursors.length === 1 || credits.isFetching}
                  onClick={() => {
                    setCreditCursors((v) => v.slice(0, -1))
                    form.setValue("creditEntryId", "")
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!credits.data?.nextCursor || credits.isFetching}
                  onClick={() => {
                    setCreditCursors((v) => [
                      ...v,
                      credits.data?.nextCursor ?? undefined,
                    ])
                    form.setValue("creditEntryId", "")
                  }}
                >
                  Show more
                </Button>
              </div>
            ) : null}
            {mode === "apply"
              ? select("chargeEntryId", "Unpaid Order", [
                  { value: "", label: "Choose an Order" },
                  ...(debits.data?.sources ?? []).map((s) => ({
                    value: s.id,
                    label: label(s),
                  })),
                ])
              : null}
            {mode === "apply" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={debitCursors.length === 1 || debits.isFetching}
                  onClick={() => {
                    setDebitCursors((v) => v.slice(0, -1))
                    form.setValue("chargeEntryId", "")
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!debits.data?.nextCursor || debits.isFetching}
                  onClick={() => {
                    setDebitCursors((v) => [
                      ...v,
                      debits.data?.nextCursor ?? undefined,
                    ])
                    form.setValue("chargeEntryId", "")
                  }}
                >
                  Show more
                </Button>
              </div>
            ) : null}
            {mode === "release" ? (
              <p className="break-words text-sm">
                Allocation {allocationId} ·{" "}
                {detail.data?.allocations.find((a) => a.id === allocationId)
                  ?.remainingAmountMinor ?? "0"}{" "}
                minor units unreleased
              </p>
            ) : null}
            {mode !== "reverse" ? (
              <Controller
                name="amount"
                control={form.control}
                render={({ field }) => (
                  <ControlField label="Amount">
                    <MoneyInput
                      value={field.value}
                      currencyCode={account.currencyCode}
                      onChange={field.onChange}
                    />
                  </ControlField>
                )}
              />
            ) : null}
            {needsMoney ? (
              <>
                {select("method", "Paid by", [
                  { value: "CASH", label: "Cash" },
                  { value: "BANK_TRANSFER", label: "Bank transfer" },
                  { value: "CARD", label: "Card" },
                  { value: "POS", label: "POS" },
                  { value: "OTHER", label: "Other" },
                ])}
                {select(
                  "moneyAccountId",
                  mode === "receipt" ? "Paid into" : "Paid from",
                  [
                    { value: "", label: "Choose an account" },
                    ...eligibleLedgerMoneyAccounts(
                      money.data?.accounts ?? [],
                      form.watch("method"),
                    ).map((a) => ({ value: a.id, label: a.name })),
                  ],
                )}
                {text("reference", "Reference (optional)")}
              </>
            ) : null}
            {mode !== "apply"
              ? text("reason", mode === "receipt" ? "Note" : "Reason", true)
              : null}
            {mode === "refund" || mode === "reverse"
              ? text("date", "Date and time")
              : null}
            {command.retained &&
            ["apply", "refund", "reverse", "release"].includes(mode)
              ? text("revision", "Check number from the earlier attempt")
              : null}
            <SubmitButton
              isSubmitting={false}
              type="submit"
              disabled={!command.ready || command.pending || loading}
            >
              Review
            </SubmitButton>
          </FieldGroup>
        </form>
      )}
    </FieldGroup>
  )
}
