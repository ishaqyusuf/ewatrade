import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { eligibleLedgerMoneyAccounts } from "@/lib/customer-ledger/command-input"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  ListCard,
  SectionHeader,
  StatusPill,
  ToggleRow,
} from "../green-till/kit"
import {
  ChoiceChip,
  FieldLabel,
  ReviewRow,
} from "./customer-ledger-command-form"
import { CustomerRefundNotice } from "./customer-refund-notice"
import { LedgerEffectiveTimeField } from "./ledger-effective-time-field"
import { refundCustomerNotice, refundDetailsDraft } from "./refund-notice-model"
import {
  type RefundCompletionFields,
  type RefundDetail,
  type RefundLifecycleCommand,
  type RefundReviewSnapshot,
  prepareRefundCancel,
  prepareRefundCompletion,
  prepareRefundDetailsRequest,
  prepareRefundReserve,
  refundBankLabel,
  refundCommandIsCurrent,
  refundDestination,
  refundDestinationLabel,
  refundHistory,
  refundOperationLabel,
  refundReviewIsCurrent,
  refundReviewSnapshot,
  refundStateInfo,
  refundTime,
} from "./refund-request-model"
import { type LedgerAccount, ledgerLabels } from "./types"
import { useMobileCustomerLedgerCommand } from "./use-mobile-customer-ledger-command"

type Step =
  | "view"
  | "reserve"
  | "details"
  | "cancel"
  | "complete"
  | "complete-review"

export function CustomerRefundDetail({
  account,
  actorUserId,
  tenantId,
  requestId,
}: {
  account: LedgerAccount
  actorUserId: string
  tenantId: string
  requestId: string
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const query = useQuery(
    trpc.customerLedger.refundRequestDetail.queryOptions(
      { requestId },
      { retry: false, enabled: !offline },
    ),
  )
  if (query.isPending && offline)
    return (
      <StatusBanner
        message="Reconnect to load this refund request."
        tone="warning"
      />
    )
  if (query.isPending)
    return (
      <View className="gap-4 px-[18px]">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </View>
    )
  // An unopenable destination still loads (destinationStatus UNAVAILABLE);
  // the lifecycle below blocks approval and recording for it.
  if (query.isError)
    return (
      <StatusBanner
        title="Refund request unavailable"
        message={query.error.message}
        tone="destructive"
        actionLabel={offline ? undefined : "Try again"}
        onActionPress={() => void query.refetch()}
      />
    )
  if (
    query.data.accountId !== account.id ||
    query.data.currencyCode !== account.currencyCode
  )
    return (
      <StatusBanner
        message="This refund request belongs to a different customer account."
        tone="warning"
      />
    )
  return (
    <Lifecycle
      account={account}
      actorUserId={actorUserId}
      tenantId={tenantId}
      detail={query.data}
    />
  )
}

function Lifecycle({
  account,
  actorUserId,
  tenantId,
  detail,
}: {
  account: LedgerAccount
  actorUserId: string
  tenantId: string
  detail: RefundDetail
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileCustomerLedgerCommand({
    actorUserId,
    tenantId,
    bookId: account.book?.id ?? "",
    accountId: account.id,
  })
  const [step, setStep] = useState<Step>("view")
  const [identityChecked, setIdentityChecked] = useState(false)
  const [noMoneySent, setNoMoneySent] = useState(false)
  const [note, setNote] = useState("")
  // The saved request opened for approval; the attestation binds to it.
  const [reviewed, setReviewed] = useState<RefundReviewSnapshot | null>(null)
  const [fields, setFields] = useState<RefundCompletionFields>({
    moneyAccountId: "",
    reference: "",
    date: new Date().toISOString(),
    returnChecked: false,
  })
  // The exact reviewed command. Retries resend it unchanged; the runner keeps
  // its operation ID and refuses a different one while a result is unknown.
  const [held, setHeld] = useState<RefundLifecycleCommand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reserved = detail.status === "RESERVED"
  const source = useQuery(
    trpc.customerLedger.entryDetail.queryOptions(
      { accountId: account.id, entryId: detail.creditEntryId, limit: 1 },
      { retry: false, enabled: !offline },
    ),
  )
  const money = useQuery(
    trpc.finance.balances.queryOptions(
      { bookId: account.book?.id ?? "" },
      { retry: false, enabled: reserved && !offline && Boolean(account.book) },
    ),
  )
  const reserve = useMutation(
    trpc.customerLedger.reserveRefund.mutationOptions(),
  )
  const cancel = useMutation(trpc.customerLedger.cancelRefund.mutationOptions())
  const requestDetails = useMutation(
    trpc.customerLedger.requestRefundDetails.mutationOptions(),
  )
  const complete = useMutation(
    trpc.customerLedger.completeRefund.mutationOptions(),
  )
  const retained = command.retained?.command
  // After a restart only metadata survives: reuse its exact revision and date
  // so repeating the same action reproduces the original command digest.
  const revisionFor = (operation: RefundLifecycleCommand["operation"]) =>
    retained?.operation === operation
      ? (retained.recoveryMetadata?.expectedSnapshotSequence ??
        detail.accountRevision)
      : detail.accountRevision
  const recoveredAsOf =
    retained?.operation === "completeRefund"
      ? retained.recoveryMetadata?.asOf
      : undefined
  useEffect(() => {
    if (recoveredAsOf) setFields((f) => ({ ...f, date: recoveredAsOf }))
  }, [recoveredAsOf])
  const bankAccounts = eligibleLedgerMoneyAccounts(
    money.data?.accounts ?? [],
    "BANK_TRANSFER",
  )
  const onlyBankId = bankAccounts.length === 1 ? bankAccounts[0]?.id : undefined
  useEffect(() => {
    if (onlyBankId)
      setFields((f) =>
        f.moneyAccountId ? f : { ...f, moneyAccountId: onlyBankId },
      )
  }, [onlyBankId])
  const canSubmit = command.ready && !command.pending && !offline
  const stale =
    (held ? !refundCommandIsCurrent(held, detail) : false) ||
    (step === "reserve" && reviewed
      ? !refundReviewIsCurrent(reviewed, detail)
      : false)
  const info = refundStateInfo(detail)
  const notice = refundCustomerNotice(detail)
  const detailsDraft = refundDetailsDraft(detail)
  const needsDetails =
    detail.status === "REQUESTED" && detail.reviewState === "NEEDS_DETAILS"
  const savedDestination = refundDestination(detail)
  const whole = (minor: string) =>
    formatFinanceMoney(minor, account.currencyCode).replace(/\.00$/, "")
  const amount = whole(detail.amountMinor)
  const destination = savedDestination
    ? refundDestinationLabel(savedDestination)
    : null
  const savedBank = refundBankLabel(savedDestination)
  const entry = source.data?.entry
  const sourceLabel = entry
    ? `${ledgerLabels[entry.kind] ?? entry.kind} #${entry.sequence}`
    : source.isError
      ? "Source unavailable"
      : "Loading source…"
  const open = (mode: string, entryId: string) =>
    router.push({
      pathname: "/customer-ledger-action/[accountId]",
      params: { accountId: account.id, mode, entryId },
    } as Href)
  function go(next: Step) {
    setError(null)
    setHeld(null)
    setIdentityChecked(false)
    setReviewed(next === "reserve" ? refundReviewSnapshot(detail) : null)
    setStep(next)
  }
  async function submit(
    attempt: RefundLifecycleCommand,
    successMessage: string,
  ) {
    setHeld(attempt)
    const ok = await command.run(
      attempt.operation,
      attempt.payload,
      (clientCommandId) => {
        switch (attempt.operation) {
          case "reserveRefund":
            return reserve.mutateAsync({ ...attempt.payload, clientCommandId })
          case "cancelRefund":
            return cancel.mutateAsync({ ...attempt.payload, clientCommandId })
          case "requestRefundDetails":
            return requestDetails.mutateAsync({
              ...attempt.payload,
              clientCommandId,
            })
          case "completeRefund":
            return complete.mutateAsync({
              ...attempt.payload,
              clientCommandId,
            })
        }
      },
      successMessage,
    )
    if (ok) {
      setHeld(null)
      setIdentityChecked(false)
      setNoMoneySent(false)
      setNote("")
      setReviewed(null)
      setStep("view")
    }
  }
  function confirm(
    build: () => RefundLifecycleCommand,
    successMessage: string,
  ) {
    try {
      const attempt = held ?? build()
      setError(null)
      void submit(attempt, successMessage)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check this refund again.",
      )
    }
  }
  function reviewCompletion() {
    try {
      setHeld(
        prepareRefundCompletion({
          detail,
          account,
          revision: revisionFor("completeRefund"),
          fields,
          moneyAccounts: money.data?.accounts,
        }),
      )
      setError(null)
      setStep("complete-review")
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the return details.",
      )
    }
  }
  const reviewedCompletion =
    held?.operation === "completeRefund" ? held.payload : null
  return (
    <FinanceFormBody>
      <HeroCard
        label={`Refund · ${detail.customerName}`}
        amount={amount}
        sub={info.summary}
      />
      <View className="flex-row">
        <StatusPill tone={info.tone} label={info.label} />
      </View>
      {offline ? (
        <StatusBanner
          message="Reconnect before changing or checking a refund."
          tone="warning"
        />
      ) : null}
      {command.error || error ? (
        <StatusBanner
          message={command.error ?? error ?? ""}
          tone="destructive"
        />
      ) : null}
      {command.notice ? <StatusBanner message={command.notice} /> : null}
      {retained ? (
        <StatusBanner
          title="Earlier submission needs confirmation"
          message={`Earlier ${refundOperationLabel(retained.operation)} on this customer account is unconfirmed. Check its saved result, or repeat the exact same action on the same refund. A different action is refused.`}
          actionLabel="Check saved result"
          onActionPress={() => void command.acknowledge()}
          tone="warning"
        />
      ) : null}
      {!command.ready ? (
        <ActionButton
          variant="outline"
          onPress={() => void command.inspect(true)}
        >
          Check saved submission status
        </ActionButton>
      ) : null}
      {stale ? (
        <StatusBanner
          message="This refund changed since you reviewed it. Go back and review it again."
          tone="warning"
        />
      ) : null}
      <SectionHeader title="Send to" />
      {savedDestination ? (
        <ListCard>
          {savedBank ? (
            <ReviewRow
              label={savedDestination.bankName?.trim() ? "Bank" : "Bank code"}
              value={savedBank}
            />
          ) : null}
          <ReviewRow
            label="Account number"
            value={savedDestination.accountNumber}
          />
          <ReviewRow
            label="Account holder"
            value={savedDestination.accountName}
          />
        </ListCard>
      ) : (
        <StatusBanner
          title="Bank details unavailable"
          message={
            detail.status === "REQUESTED" || reserved
              ? "The saved bank account can't be opened right now, so this refund can't be approved or recorded. You can still cancel it."
              : "The saved bank account can't be opened right now."
          }
          tone="warning"
        />
      )}
      {step === "view" ? (
        <>
          <SectionHeader title="Request" />
          <ListCard>
            <ReviewRow label="Customer" value={detail.customerName} />
            <ReviewRow
              label="Amount"
              value={formatFinanceMoney(
                detail.amountMinor,
                account.currencyCode,
              )}
            />
            <ReviewRow label="Source" value={sourceLabel} />
            <ReviewRow label="Reason" value={detail.reason} />
          </ListCard>
          <ActionButton
            variant="outline"
            onPress={() => open("entry", detail.creditEntryId)}
          >
            Open source entry
          </ActionButton>
          {needsDetails ? (
            <>
              <SectionHeader title="More details needed" />
              <ListCard>
                <ReviewRow
                  label="Note"
                  value={detail.reviewNote?.trim() || "No note saved"}
                />
              </ListCard>
              <Text className="mx-0.5 text-xs text-muted-foreground">
                Saved on this request only. EwaTrade didn't message the
                customer. To change the bank account, cancel this request and
                create a new one.
              </Text>
              {detailsDraft ? (
                <CustomerRefundNotice text={detailsDraft} />
              ) : null}
            </>
          ) : null}
          <SectionHeader title="History" />
          <ListCard>
            {refundHistory(detail).map((row) => (
              <ReviewRow key={row.key} label={row.label} value={row.value} />
            ))}
          </ListCard>
          {detail.refundEntryId ? (
            <ActionButton
              variant="outline"
              onPress={() => open("entry", detail.refundEntryId ?? "")}
            >
              Open refund entry
            </ActionButton>
          ) : null}
          {notice ? <CustomerRefundNotice text={notice} /> : null}
          {detail.status === "REQUESTED" ? (
            <>
              {detail.canApprove && savedDestination ? (
                <ActionButton
                  icon="ShieldCheck"
                  disabled={!canSubmit}
                  onPress={() => go("reserve")}
                >
                  Review and reserve
                </ActionButton>
              ) : null}
              <ActionButton
                variant="outline"
                disabled={!canSubmit}
                onPress={() => go("details")}
              >
                {needsDetails
                  ? "Update details request"
                  : "Request more details"}
              </ActionButton>
              {detail.canCancel ? (
                <ActionButton
                  variant="outline"
                  disabled={!canSubmit}
                  onPress={() => go("cancel")}
                >
                  Cancel request
                </ActionButton>
              ) : null}
            </>
          ) : reserved ? (
            <>
              {savedDestination ? (
                <ActionButton
                  icon="Building2"
                  disabled={!canSubmit}
                  onPress={() => go("complete")}
                >
                  Record money returned
                </ActionButton>
              ) : null}
              {detail.canCancel ? (
                <ActionButton
                  variant="outline"
                  disabled={!canSubmit}
                  onPress={() => go("cancel")}
                >
                  Cancel and release hold
                </ActionButton>
              ) : null}
            </>
          ) : null}
          <Text className="mx-0.5 text-xs text-muted-foreground">
            EwaTrade doesn't send bank transfers. Make the transfer in your
            bank, then record it here.
          </Text>
        </>
      ) : step === "reserve" && reviewed ? (
        <>
          <SectionHeader title="Approve and reserve" />
          <StatusBanner
            message={`Reserving holds ${amount} from ${sourceLabel} so it can't be used on an Order. No money is sent.`}
          />
          <ListCard>
            <ToggleRow
              title="Customer and destination verified"
              sub="I checked this customer and bank account against the original payer and payment. An account-name match alone doesn't prove ownership."
              value={identityChecked}
              onValueChange={setIdentityChecked}
              disabled={command.pending}
            />
          </ListCard>
          <ActionButton
            disabled={
              !canSubmit ||
              !identityChecked ||
              stale ||
              !savedDestination ||
              !detail.canApprove
            }
            isLoading={command.pending}
            onPress={() =>
              confirm(
                () =>
                  prepareRefundReserve({
                    detail,
                    account,
                    revision: revisionFor("reserveRefund"),
                    reviewed,
                    identityChecked,
                  }),
                "Refund approved and reserved. No money was sent.",
              )
            }
          >
            Approve and reserve
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => go("view")}
          >
            Back
          </ActionButton>
        </>
      ) : step === "details" ? (
        <>
          <SectionHeader title="Request more details" />
          <StatusBanner message="Saves this note on the request and keeps it unapproved. Nothing is held, and EwaTrade doesn't message the customer." />
          <FormField
            label="What's needed"
            placeholder="For example: confirm the account holder's name"
            value={note}
            onChangeText={(value) => {
              setHeld(null)
              setNote(value)
            }}
            maxLength={400}
            multiline
            editable={!command.pending}
          />
          <Text className="mx-0.5 text-xs text-muted-foreground">
            The bank account can't be edited. If it's wrong, cancel this request
            and create a new one.
          </Text>
          <ActionButton
            disabled={!canSubmit || !note.trim() || stale}
            isLoading={command.pending}
            onPress={() =>
              confirm(
                () =>
                  prepareRefundDetailsRequest({
                    detail,
                    account,
                    revision: revisionFor("requestRefundDetails"),
                    note,
                  }),
                "Details request saved. EwaTrade didn't message the customer.",
              )
            }
          >
            Save details request
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => go("view")}
          >
            Back
          </ActionButton>
        </>
      ) : step === "cancel" ? (
        <>
          <SectionHeader
            title={reserved ? "Cancel and release hold" : "Cancel request"}
          />
          <StatusBanner
            message={
              reserved
                ? `Releases the ${amount} hold back to available credit. Only cancel if no money left your bank for this refund.`
                : "Closes this request. Nothing was held and nothing is sent."
            }
            tone={reserved ? "warning" : "default"}
          />
          {reserved ? (
            <ListCard>
              <ToggleRow
                title="No money was sent for this refund"
                sub="I checked my bank. If it was sent, record the return instead."
                value={noMoneySent}
                onValueChange={setNoMoneySent}
                disabled={command.pending}
              />
            </ListCard>
          ) : null}
          <ActionButton
            variant="destructive"
            disabled={!canSubmit || (reserved && !noMoneySent) || stale}
            isLoading={command.pending}
            onPress={() =>
              confirm(
                () =>
                  prepareRefundCancel({
                    detail,
                    account,
                    revision: revisionFor("cancelRefund"),
                    noMoneySent,
                  }),
                reserved
                  ? "Refund cancelled. The hold is released."
                  : "Refund request cancelled.",
              )
            }
          >
            {reserved ? "Cancel and release hold" : "Cancel request"}
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => go("view")}
          >
            Back
          </ActionButton>
        </>
      ) : step === "complete" && destination ? (
        <>
          <SectionHeader title="Record money returned" />
          <StatusBanner message="Send the transfer from your bank app first. This records a return already made; it doesn't send money." />
          <FieldLabel>Returned from</FieldLabel>
          {money.isPending ? (
            <Text className="text-sm text-muted-foreground">
              Loading bank accounts…
            </Text>
          ) : money.isError ? (
            <StatusBanner
              message={money.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void money.refetch()}
            />
          ) : bankAccounts.length ? (
            <View className="-mt-2 flex-row flex-wrap gap-2">
              {bankAccounts.map((a) => (
                <ChoiceChip
                  key={a.id}
                  icon="Building2"
                  label={a.name}
                  selected={fields.moneyAccountId === a.id}
                  onPress={() =>
                    setFields((f) => ({ ...f, moneyAccountId: a.id }))
                  }
                />
              ))}
            </View>
          ) : (
            <Text className="text-sm text-muted-foreground">
              No active bank account in this book. Add one on the dashboard
              first.
            </Text>
          )}
          <FormField
            label="Outgoing bank reference"
            placeholder="Reference from your bank"
            value={fields.reference}
            onChangeText={(reference) =>
              setFields((f) => ({ ...f, reference }))
            }
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={160}
          />
          <LedgerEffectiveTimeField
            value={fields.date}
            onChange={(date) => setFields((f) => ({ ...f, date }))}
            disabled={!canSubmit}
            exactRecovery={Boolean(recoveredAsOf)}
          />
          <ListCard>
            <ToggleRow
              title="I confirmed the outgoing transfer"
              sub={`My bank shows ${amount} sent to ${destination}.`}
              value={fields.returnChecked}
              onValueChange={(returnChecked) =>
                setFields((f) => ({ ...f, returnChecked }))
              }
            />
          </ListCard>
          <ActionButton
            disabled={!canSubmit || !fields.returnChecked}
            onPress={reviewCompletion}
          >
            Review
          </ActionButton>
          <ActionButton variant="outline" onPress={() => go("view")}>
            Back
          </ActionButton>
        </>
      ) : reviewedCompletion && savedDestination && destination ? (
        <>
          <SectionHeader title="Review return" />
          <ListCard>
            <ReviewRow
              label="Amount"
              value={formatFinanceMoney(
                detail.amountMinor,
                account.currencyCode,
              )}
            />
            <ReviewRow label="To" value={destination} />
            <ReviewRow
              label="Account holder"
              value={savedDestination.accountName}
            />
            <ReviewRow
              label="From"
              value={
                bankAccounts.find(
                  (a) => a.id === reviewedCompletion.moneyAccountId,
                )?.name ?? "Bank account"
              }
            />
            <ReviewRow
              label="Outgoing reference"
              value={reviewedCompletion.outgoingReference}
            />
            <ReviewRow
              label="Left your bank"
              value={refundTime(reviewedCompletion.effectiveAt)}
            />
          </ListCard>
          <Text className="mx-0.5 text-xs text-muted-foreground">
            Records this return once and closes the hold. EwaTrade sends
            nothing.
          </Text>
          <ActionButton
            disabled={!canSubmit || stale}
            isLoading={command.pending}
            onPress={() => {
              if (held)
                void submit(
                  held,
                  "Return recorded. EwaTrade did not send this transfer.",
                )
            }}
          >
            Record completed refund
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => go("complete")}
          >
            Back to details
          </ActionButton>
        </>
      ) : (
        // The saved request changed under this step (for example the bank
        // details became unavailable); only going back is offered.
        <ActionButton
          variant="outline"
          disabled={command.pending}
          onPress={() => go("view")}
        >
          Back
        </ActionButton>
      )}
    </FinanceFormBody>
  )
}
