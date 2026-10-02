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
import { ledgerLabels } from "../types"
import { useCustomerLedgerForm } from "./form-context"
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
        throw new Error("Refresh the current sources before reviewing.")
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
        failure instanceof Error ? failure.message : "Check customer details.",
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
    `${ledgerLabels[s.kind] ?? s.kind} #${s.sequence}${s.order ? ` · ${s.order.orderNumber}` : ""} · ${formatFinanceMoney(s.remainingAmountMinor, account.currencyCode)} remaining`
  const text = (
    name: "reason" | "reference" | "date" | "revision",
    label: string,
    multiline = false,
  ) => (
    <ControlField label={label} error={form.formState.errors[name]?.message}>
      {multiline ? (
        <Textarea {...form.register(name)} maxLength={400} />
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
            ? "Record actual money already received. It becomes available credit; apply it separately to a charge. This does not send money."
            : mode === "apply" || mode === "release"
              ? "This changes settlement only. Cash and net customer balance stay unchanged."
              : mode === "refund"
                ? "Record money already returned to the customer from unused credit. This does not execute a payout."
                : mode === "reverse"
                  ? "Append a bookkeeping correction. Original entries remain. This does not execute a cash refund."
                  : "Record debt or credit held at the bookkeeping start date. No cash is collected."}
        </AlertDescription>
      </Alert>
      {command.retained ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            Earlier {command.retained.command.operation} needs confirmation.
            Re-enter only its exact original details, including revision and
            date. No amount or reason is saved on this device.
          </AlertDescription>
          <Button
            appearance="form"
            variant="outline"
            disabled={command.pending}
            onClick={() => void command.acknowledge()}
          >
            Check saved result
          </Button>
        </Alert>
      ) : null}
      {command.error || error || dataError ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            {command.error ?? error ?? dataError}
          </AlertDescription>
          <Button
            appearance="form"
            variant="outline"
            disabled={command.pending}
            onClick={() => {
              void credits.refetch()
              void debits.refetch()
              void money.refetch()
              if (entryId) void detail.refetch()
            }}
          >
            Refresh sources
          </Button>
        </Alert>
      ) : null}
      {command.notice ? (
        <output aria-live="polite">{command.notice}</output>
      ) : null}
      {command.saved ? (
        <Button appearance="form" onClick={() => void close()}>
          Done
        </Button>
      ) : review ? (
        <>
          <h3 className="text-lg font-medium">Review before recording</h3>
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
                  ? "Customer owes the business"
                  : "Business holds customer credit"}{" "}
                · Bookkeeping start date
              </p>
            ) : null}
            {"creditEntryId" in review.payload ? (
              <p>
                Credit:{" "}
                {credits.data?.sources.find((s) => s.id === creditId)?.sequence
                  ? `#${credits.data.sources.find((s) => s.id === creditId)?.sequence}`
                  : "Reviewed source"}
              </p>
            ) : null}
            {"chargeEntryId" in review.payload ? (
              <p>
                Charge:{" "}
                {debits.data?.sources.find((s) => s.id === chargeId)?.order
                  ?.orderNumber ??
                  `#${debits.data?.sources.find((s) => s.id === chargeId)?.sequence ?? "Reviewed outstanding debt"}`}
              </p>
            ) : null}
            {"moneyAccountId" in review.payload ? (
              <p>
                Money account:{" "}
                {money.data?.accounts.find((a) => a.id === moneyId)?.name} ·{" "}
                {review.payload.method}
              </p>
            ) : (
              <p>
                {mode === "reverse"
                  ? "Bookkeeping reverses original effects; no payout is executed."
                  : `Cash effect: ${formatFinanceMoney("0", account.currencyCode)}`}
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
                <dt className="text-muted-foreground">
                  Amount owed after this record
                </dt>
                <dd>
                  {formatFinanceMoney(
                    after.outstandingDebtMinor,
                    account.currencyCode,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Credit available after this record
                </dt>
                <dd>
                  {formatFinanceMoney(
                    after.availableCreditMinor,
                    account.currencyCode,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Net balance after this record
                </dt>
                <dd>
                  {formatFinanceMoney(
                    after.netBalanceMinor,
                    account.currencyCode,
                  )}
                </dd>
              </div>
              <p className="text-xs text-muted-foreground">
                Based on the reviewed account. The server checks current records
                when confirming.
              </p>
            </dl>
          ) : null}
          <FormActions>
            <Button
              appearance="form"
              variant="outline"
              disabled={command.pending}
              onClick={() => setReview(null)}
            >
              Back to details
            </Button>
            <SubmitButton
              type="button"
              isSubmitting={command.pending}
              disabled={!command.ready || command.pending}
              onClick={() => void confirm()}
            >
              Confirm and record
            </SubmitButton>
          </FormActions>
        </>
      ) : (
        <form onSubmit={form.handleSubmit(prepare)}>
          <FieldGroup>
            {mode === "opening"
              ? select("direction", "Opening balance", [
                  { value: "DEBT", label: "Customer owes the business" },
                  { value: "CREDIT", label: "Business holds customer credit" },
                ])
              : null}
            {needsCredit
              ? select("creditEntryId", "Available credit", [
                  { value: "", label: "Choose credit" },
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
                  Previous credits
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
                  More credits
                </Button>
              </div>
            ) : null}
            {mode === "apply"
              ? select("chargeEntryId", "Outstanding charge", [
                  { value: "", label: "Choose charge" },
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
                  Previous charges
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
                  More charges
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
                {select("method", "Payment method", [
                  { value: "CASH", label: "Cash" },
                  { value: "BANK_TRANSFER", label: "Bank transfer" },
                  { value: "CARD", label: "Card" },
                  { value: "POS", label: "POS" },
                  { value: "OTHER", label: "Other" },
                ])}
                {select(
                  "moneyAccountId",
                  mode === "receipt"
                    ? "Money received into"
                    : "Money returned from",
                  [
                    { value: "", label: "Choose money account" },
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
              ? text(
                  "reason",
                  mode === "receipt" ? "Description" : "Reason",
                  true,
                )
              : null}
            {mode === "refund" || mode === "reverse"
              ? text("date", "Effective time (ISO UTC)")
              : null}
            {command.retained &&
            ["apply", "refund", "reverse", "release"].includes(mode)
              ? text("revision", "Original reviewed revision (exact retry)")
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
