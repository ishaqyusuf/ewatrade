import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, SectionHeader } from "../green-till/kit"
import { Choice, ReviewRow } from "./customer-ledger-command-form"
import {
  type RefundCommand,
  type RefundRequestFields,
  minorToInput,
  prepareRefundRequest,
  refundBankLabel,
  refundOperationLabel,
  refundableSources,
} from "./refund-request-model"
import { type LedgerAccount, type LedgerSource, ledgerLabels } from "./types"
import { useMobileCustomerLedgerCommand } from "./use-mobile-customer-ledger-command"

type RequestCommand = Extract<RefundCommand, { operation: "requestRefund" }>

export function CustomerRefundRequestForm({
  account,
  actorUserId,
  tenantId,
}: {
  account: LedgerAccount
  actorUserId: string
  tenantId: string
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
  const [fields, setFields] = useState<RefundRequestFields>({
    creditEntryId: "",
    amount: "",
    reason: "",
    bankName: "",
    legacyBankCode: "",
    accountNumber: "",
    accountName: "",
    revision: account.revision,
  })
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [review, setReview] = useState<RequestCommand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id?: string } | null>(null)
  const credits = useQuery(
    trpc.customerLedger.sources.queryOptions(
      {
        accountId: account.id,
        side: "CREDIT",
        expectedRevision: account.revision,
        afterSequence: cursors.at(-1),
        limit: 50,
      },
      { retry: false, enabled: !offline },
    ),
  )
  const request = useMutation(
    trpc.customerLedger.requestRefund.mutationOptions(),
  )
  const sources = refundableSources(credits.data?.sources)
  const canSubmit = command.ready && !command.pending && !offline && !saved
  const change = <K extends keyof RefundRequestFields>(
    key: K,
    value: RefundRequestFields[K],
  ) => setFields((f) => ({ ...f, [key]: value }))
  const whole = (minor: string) =>
    formatFinanceMoney(minor, account.currencyCode).replace(/\.00$/, "")
  const sourceLabel = (s: LedgerSource) =>
    `${ledgerLabels[s.kind] ?? s.kind} #${s.sequence}${s.order ? ` · ${s.order.orderNumber}` : ""} · ${whole(s.remainingAmountMinor)} available`
  // One refundable source: choose it with its full amount, still editable.
  const only = sources.length === 1 ? sources[0] : undefined
  useEffect(() => {
    if (only)
      setFields((f) =>
        f.creditEntryId || f.amount
          ? f
          : {
              ...f,
              creditEntryId: only.id,
              amount: minorToInput(only.remainingAmountMinor),
            },
      )
  }, [only])
  const retained = command.retained?.command
  const recoveredRevision =
    retained?.operation === "requestRefund"
      ? retained.recoveryMetadata?.expectedSnapshotSequence
      : undefined
  useEffect(() => {
    if (recoveredRevision)
      setFields((f) => ({ ...f, revision: recoveredRevision }))
  }, [recoveredRevision])
  // An unconfirmed older request may have saved only a short bank code; its
  // exact retry must resend that code, never a name standing in for it.
  const [earlierCode, setEarlierCode] = useState(false)
  const legacyCode = earlierCode && retained?.operation === "requestRefund"
  function prepare() {
    try {
      if (credits.isPending || credits.isError)
        throw new Error("Refresh current credit before reviewing.")
      setReview(
        prepareRefundRequest({
          account,
          fields: legacyCode
            ? { ...fields, bankName: "" }
            : { ...fields, legacyBankCode: undefined },
          sources,
        }),
      )
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the refund details.",
      )
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review
    let created: string | undefined
    if (
      await command.run(
        attempt.operation,
        attempt.payload,
        async (clientCommandId) => {
          const result = await request.mutateAsync({
            ...attempt.payload,
            clientCommandId,
          })
          created = result.id
          return result
        },
        "Refund request saved. Nothing is held or sent yet.",
      )
    )
      setSaved({ id: created })
  }
  const source = review
    ? sources.find((s) => s.id === review.payload.creditEntryId)
    : undefined
  const reviewedBank = review
    ? refundBankLabel(review.payload.destination)
    : null
  return (
    <FinanceFormBody>
      {review ? (
        <HeroCard
          label={`Refund request · ${account.customer.name}`}
          amount={whole(review.payload.amountMinor)}
          sub="Not held or sent until approved and recorded"
        />
      ) : (
        <HeroCard
          label={account.customer.name}
          amount={whole(account.totals.availableCreditMinor)}
          sub="Available credit"
        />
      )}
      <Text className="text-sm text-muted-foreground">
        A request records what to return and where. It doesn't hold credit or
        send money; approve and reserve it next.
      </Text>
      {offline ? (
        <StatusBanner
          message="Reconnect before requesting a refund."
          tone="warning"
        />
      ) : null}
      {command.error || error || credits.error ? (
        <StatusBanner
          message={command.error ?? error ?? credits.error?.message ?? ""}
          tone="destructive"
        />
      ) : null}
      {command.notice && !saved ? (
        <StatusBanner message={command.notice} />
      ) : null}
      {retained ? (
        <StatusBanner
          title="Earlier submission needs confirmation"
          message={`Earlier ${refundOperationLabel(retained.operation)} on this customer account is unconfirmed. Check its saved result, or re-enter only its exact original details. Account details are not stored on this device.`}
          actionLabel="Check saved result"
          onActionPress={() =>
            void command.acknowledge().then((result) => {
              if (
                result === "RECORDED" &&
                retained.operation === "requestRefund"
              )
                setSaved({})
            })
          }
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
      {saved ? (
        <View className="gap-3">
          <StatusBanner
            tone="success"
            title="Refund request saved"
            message="Nothing is held or sent yet. Open it to verify the customer and destination, then approve and reserve."
          />
          <ActionButton
            onPress={() =>
              router.replace({
                pathname: "/customer-ledger-action/[accountId]",
                params: saved.id
                  ? {
                      accountId: account.id,
                      mode: "refund-request",
                      entryId: saved.id,
                    }
                  : { accountId: account.id, mode: "refund-requests" },
              } as Href)
            }
          >
            {saved.id ? "Open refund request" : "Open refund requests"}
          </ActionButton>
          <ActionButton variant="outline" onPress={() => router.back()}>
            Done
          </ActionButton>
        </View>
      ) : review ? (
        <>
          <SectionHeader title="Review request" />
          <ListCard>
            <ReviewRow label="Customer" value={account.customer.name} />
            <ReviewRow
              label="Amount"
              value={formatFinanceMoney(
                review.payload.amountMinor,
                account.currencyCode,
              )}
            />
            <ReviewRow
              label="Source"
              value={source ? sourceLabel(source) : "Reviewed source"}
            />
            {reviewedBank ? (
              <ReviewRow
                label={
                  review.payload.destination.bankName ? "Bank" : "Bank code"
                }
                value={reviewedBank}
              />
            ) : null}
            <ReviewRow
              label="Account number"
              value={review.payload.destination.accountNumber}
            />
            <ReviewRow
              label="Account holder"
              value={review.payload.destination.accountName}
            />
            <ReviewRow label="Reason" value={review.payload.reason} />
          </ListCard>
          <Text className="mx-0.5 text-xs text-muted-foreground">
            Bank details are saved encrypted for owners and admins. The server
            rechecks the source and current credit.
          </Text>
          <ActionButton
            disabled={!canSubmit}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            Submit refund request
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => setReview(null)}
          >
            Back to details
          </ActionButton>
        </>
      ) : (
        <>
          <SectionHeader title="Credit to return" />
          {sources.map((s) => (
            <Choice
              key={s.id}
              label={sourceLabel(s)}
              selected={s.id === fields.creditEntryId}
              onPress={() => change("creditEntryId", s.id)}
            />
          ))}
          {credits.isPending && !offline ? (
            <Text className="text-sm text-muted-foreground">
              Loading available credit…
            </Text>
          ) : credits.data && !sources.length ? (
            <Text className="text-sm text-muted-foreground">
              No refundable payment or opening credit on this page.
            </Text>
          ) : null}
          {cursors.length > 1 || credits.data?.nextCursor ? (
            <>
              <ActionButton
                variant="outline"
                disabled={cursors.length === 1 || credits.isFetching}
                onPress={() => {
                  setCursors((v) => v.slice(0, -1))
                  change("creditEntryId", "")
                }}
              >
                Previous credits
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={!credits.data?.nextCursor || credits.isFetching}
                onPress={() => {
                  setCursors((v) => [
                    ...v,
                    credits.data?.nextCursor ?? undefined,
                  ])
                  change("creditEntryId", "")
                }}
              >
                More credits
              </ActionButton>
            </>
          ) : null}
          <MoneyField
            label="Amount to return"
            currencyCode={account.currencyCode}
            value={fields.amount}
            onChangeValue={(v) => change("amount", v)}
          />
          <FormField
            label="Reason"
            value={fields.reason}
            onChangeText={(v) => change("reason", v)}
            maxLength={400}
            multiline
          />
          <SectionHeader title="Customer's bank account" />
          {retained?.operation === "requestRefund" ? (
            <>
              <Choice
                label="Bank name"
                selected={!legacyCode}
                onPress={() => setEarlierCode(false)}
              />
              <Choice
                label="Earlier request used a bank code"
                selected={legacyCode}
                onPress={() => setEarlierCode(true)}
              />
            </>
          ) : null}
          {legacyCode ? (
            <FormField
              label="Bank code from the earlier request (exact retry)"
              placeholder="As entered before, for example GTB"
              value={fields.legacyBankCode ?? ""}
              onChangeText={(v) => change("legacyBankCode", v)}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
            />
          ) : (
            <FormField
              label="Bank name"
              placeholder="For example Guaranty Trust Bank"
              value={fields.bankName}
              onChangeText={(v) => change("bankName", v)}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={120}
            />
          )}
          <FormField
            label="Account number"
            value={fields.accountNumber}
            onChangeText={(v) => change("accountNumber", v)}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={34}
          />
          <FormField
            label="Account holder name"
            placeholder="As the bank shows it"
            value={fields.accountName}
            onChangeText={(v) => change("accountName", v)}
            autoCapitalize="words"
            maxLength={160}
          />
          {retained ? (
            <FormField
              label="Original reviewed revision (exact retry)"
              value={fields.revision}
              onChangeText={(v) => change("revision", v)}
              maxLength={19}
              keyboardType="number-pad"
            />
          ) : null}
          <ActionButton
            disabled={!canSubmit || credits.isPending}
            onPress={prepare}
          >
            Review
          </ActionButton>
          {credits.isError ? (
            <ActionButton
              variant="outline"
              onPress={() => void credits.refetch()}
            >
              Refresh current credit
            </ActionButton>
          ) : null}
        </>
      )}
    </FinanceFormBody>
  )
}
