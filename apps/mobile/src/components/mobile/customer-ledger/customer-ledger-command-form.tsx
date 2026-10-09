import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  type LedgerFields,
  customerLedgerReviewTotals,
  eligibleLedgerMoneyAccounts,
  prepareCustomerLedgerCommand,
} from "@/lib/customer-ledger/command-input"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { LedgerEffectiveTimeField } from "./ledger-effective-time-field"
import {
  type CustomerLedgerMode,
  type LedgerAccount,
  type LedgerRequest,
  ledgerLabels,
} from "./types"
import { useMobileCustomerLedgerCommand } from "./use-mobile-customer-ledger-command"
export function CustomerLedgerCommandForm({
  account,
  actorUserId,
  tenantId,
  mode,
  entryId,
  allocationId,
  allocationAfter,
}: {
  account: LedgerAccount
  actorUserId: string
  tenantId: string
  mode: Exclude<CustomerLedgerMode, "entry">
  entryId?: string
  allocationId?: string
  allocationAfter?: string
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
  const [fields, setFields] = useState<LedgerFields>({
    amount: "",
    reason: "",
    reference: "",
    direction: "DEBT",
    method: "CASH",
    moneyAccountId: "",
    creditEntryId: "",
    chargeEntryId: "",
    revision: account.revision,
    date: new Date().toISOString(),
  })
  const [fillSnapshot, setFillSnapshot] = useState<LedgerFields | null>(null)
  const [review, setReview] = useState<LedgerRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [creditCursors, setCreditCursors] = useState<(string | undefined)[]>([
    undefined,
  ])
  const [debitCursors, setDebitCursors] = useState<(string | undefined)[]>([
    undefined,
  ])
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
        expectedRevision: account.revision,
        afterAllocationId: allocationAfter,
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
  const canSubmit = command.ready && !command.pending && !offline && !saved
  const change = <K extends keyof LedgerFields>(
    key: K,
    value: LedgerFields[K],
  ) => setFields((f) => ({ ...f, [key]: value }))
  function prepare() {
    try {
      if (dataError || loading)
        throw new Error("Refresh current sources before reviewing.")
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
    if (
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
    )
      setSaved(true)
  }
  useEffect(() => {
    const metadata = command.retained?.command.recoveryMetadata
    if (metadata)
      setFields((f) => ({
        ...f,
        date: metadata.asOf ?? f.date,
        revision: metadata.expectedSnapshotSequence ?? f.revision,
      }))
  }, [command.retained])
  const sourceLabel = (
    s: NonNullable<typeof credits.data>["sources"][number],
  ) =>
    `${ledgerLabels[s.kind] ?? s.kind} #${s.sequence}${s.order ? ` · ${s.order.orderNumber}` : ""} · ${formatFinanceMoney(s.remainingAmountMinor, account.currencyCode)} remaining`
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
  const creditSource = credits.data?.sources.find((s) => s.id === creditId)
  const chargeSource = debits.data?.sources.find((s) => s.id === chargeId)
  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">
        {review
          ? "Review customer record"
          : {
              opening: "Opening balance",
              receipt: "Receive payment",
              apply: "Apply existing credit",
              release: "Release allocation",
              refund: "Return unused credit",
              reverse: "Correct entry",
            }[mode]}
      </Text>
      <HeroCard
        label={account.customer.name}
        amount={formatFinanceMoney(
          account.totals.outstandingDebtMinor,
          account.currencyCode,
        )}
        sub="Recorded amount owed"
        stats={[
          {
            label: "Credit",
            value: formatFinanceMoney(
              account.totals.availableCreditMinor,
              account.currencyCode,
            ),
          },
          {
            label: "Net",
            value: formatFinanceMoney(
              account.totals.netBalanceMinor,
              account.currencyCode,
            ),
          },
        ]}
      />
      <Text className="text-sm text-muted-foreground">
        {mode === "receipt"
          ? "Record actual money already received. Apply it separately to outstanding debt. Recording does not send money."
          : mode === "apply" || mode === "release"
            ? "Settlement only. Cash and net customer balance stay unchanged."
            : mode === "refund"
              ? "Record a completed real-world return of unused credit. This does not execute a payout."
              : mode === "reverse"
                ? "Append a bookkeeping correction; the original entry remains. This does not execute a refund."
                : "Debt or credit held at the book start date. No cash is collected."}
      </Text>
      {offline ? (
        <StatusBanner
          message="Reconnect before recording or checking a financial submission."
          tone="warning"
        />
      ) : null}
      {command.error || error || dataError ? (
        <StatusBanner
          message={command.error ?? error ?? dataError ?? ""}
          tone="destructive"
        />
      ) : null}
      {command.notice ? <StatusBanner message={command.notice} /> : null}
      {command.retained ? (
        <StatusBanner
          title="Earlier submission needs confirmation"
          message={`Earlier ${command.retained.command.operation}. Re-enter only the exact original details, revision and date. Amount/reason are not stored on this device.`}
          actionLabel="Check saved result"
          onActionPress={() =>
            void command.acknowledge().then((result) => {
              if (result === "RECORDED") setSaved(true)
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
            title={mode === "receipt" ? "Payment recorded" : "Record saved"}
            message={
              mode === "receipt"
                ? "This payment is available as credit. Apply it to a charge to settle the recorded debt."
                : "The reviewed record is saved."
            }
          />
          {mode === "receipt" ? (
            <ActionButton
              onPress={() =>
                router.replace({
                  pathname: "/customer-ledger-action/[accountId]",
                  params: { accountId: account.id, mode: "apply" },
                })
              }
            >
              Apply payment to a charge
            </ActionButton>
          ) : null}
          <ActionButton variant="outline" onPress={() => router.back()}>
            Done
          </ActionButton>
        </View>
      ) : review ? (
        <>
          <Text className="text-2xl font-bold">
            {formatFinanceMoney(
              "amountMinor" in review.payload
                ? review.payload.amountMinor
                : (detail.data?.entry.amountMinor ?? "0"),
              account.currencyCode,
            )}
          </Text>
          <View className="gap-3 border-y border-border py-4">
            {creditId ? (
              <Text>
                Credit:{" "}
                {creditSource ? sourceLabel(creditSource) : "Reviewed source"}
              </Text>
            ) : null}
            {chargeId ? (
              <Text>
                Charge:{" "}
                {chargeSource ? sourceLabel(chargeSource) : "Reviewed debt"}
              </Text>
            ) : null}
            {moneyId ? (
              <Text>
                Money account:{" "}
                {money.data?.accounts.find((a) => a.id === moneyId)?.name}
              </Text>
            ) : (
              <Text>
                {mode === "reverse"
                  ? "Bookkeeping reverses original effects; no payout is executed."
                  : `Cash effect: ${formatFinanceMoney("0", account.currencyCode)}`}
              </Text>
            )}
            {"reason" in review.payload ? (
              <Text>{review.payload.reason}</Text>
            ) : "description" in review.payload ? (
              <Text>{review.payload.description}</Text>
            ) : null}
            {"effectiveAt" in review.payload &&
            review.payload.effectiveAt instanceof Date ? (
              <Text>{review.payload.effectiveAt.toLocaleString()}</Text>
            ) : null}
          </View>
          {after ? (
            <View className="gap-2 rounded-[20px] bg-tint-mint p-4">
              <Text className="font-bold text-tint-mint-foreground">
                Before → After
              </Text>
              <Text className="text-tint-mint-foreground">
                Owed:{" "}
                {formatFinanceMoney(
                  account.totals.outstandingDebtMinor,
                  account.currencyCode,
                )}{" "}
                →{" "}
                {formatFinanceMoney(
                  after.outstandingDebtMinor,
                  account.currencyCode,
                )}
              </Text>
              <Text className="text-tint-mint-foreground">
                Credit:{" "}
                {formatFinanceMoney(
                  account.totals.availableCreditMinor,
                  account.currencyCode,
                )}{" "}
                →{" "}
                {formatFinanceMoney(
                  after.availableCreditMinor,
                  account.currencyCode,
                )}
              </Text>
              <Text>
                Amount owed after:{" "}
                {formatFinanceMoney(
                  after.outstandingDebtMinor,
                  account.currencyCode,
                )}
              </Text>
              <Text>
                Credit available after:{" "}
                {formatFinanceMoney(
                  after.availableCreditMinor,
                  account.currencyCode,
                )}
              </Text>
              <Text>
                Net balance after:{" "}
                {formatFinanceMoney(
                  after.netBalanceMinor,
                  account.currencyCode,
                )}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Based on the reviewed account; the server checks current
                records.
              </Text>
            </View>
          ) : null}
          <ActionButton
            disabled={!canSubmit}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            Confirm and record
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
          {canSubmit && !command.retained ? (
            <QaQuickFillButton
              formId={`mobile.customer-ledger.${mode}`}
              isDirty={Boolean(
                fields.amount || fields.reason || fields.reference,
              )}
              canUndo={Boolean(fillSnapshot)}
              onFill={(context, sequence) => {
                if (!canSubmit || command.retained) return
                setFillSnapshot(fields)
                setFields({
                  ...fields,
                  amount: fields.amount || "1",
                  reason: `QA customer record ${sequence}`,
                  reference: `QA-${context.invocationId.slice(0, 8)}`,
                  date: context.now.toISOString(),
                })
              }}
              onUndo={() => {
                if (fillSnapshot && canSubmit && !command.retained) {
                  setFields(fillSnapshot)
                  setFillSnapshot(null)
                }
              }}
            />
          ) : null}
          {mode === "opening" ? (
            <>
              <Choice
                label="Customer owes the business"
                selected={fields.direction === "DEBT"}
                onPress={() => change("direction", "DEBT")}
              />
              <Choice
                label="Business holds customer credit"
                selected={fields.direction === "CREDIT"}
                onPress={() => change("direction", "CREDIT")}
              />
            </>
          ) : null}
          {needsCredit ? (
            <>
              <Text className="font-semibold">Available credit</Text>
              {credits.data?.sources.map((s) => (
                <Choice
                  key={s.id}
                  label={sourceLabel(s)}
                  selected={s.id === fields.creditEntryId}
                  onPress={() => change("creditEntryId", s.id)}
                />
              ))}
              {credits.data && !credits.data.sources.length ? (
                <Text>No available credit on this source page.</Text>
              ) : null}
              <ActionButton
                variant="outline"
                disabled={creditCursors.length === 1 || credits.isFetching}
                onPress={() => {
                  setCreditCursors((v) => v.slice(0, -1))
                  change("creditEntryId", "")
                }}
              >
                Previous credits
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={!credits.data?.nextCursor || credits.isFetching}
                onPress={() => {
                  setCreditCursors((v) => [
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
          {mode === "apply" ? (
            <>
              <Text className="font-semibold">Outstanding charge</Text>
              {debits.data?.sources.map((s) => (
                <Choice
                  key={s.id}
                  label={sourceLabel(s)}
                  selected={s.id === fields.chargeEntryId}
                  onPress={() => change("chargeEntryId", s.id)}
                />
              ))}
              {debits.data && !debits.data.sources.length ? (
                <Text>No outstanding charge on this source page.</Text>
              ) : null}
              <ActionButton
                variant="outline"
                disabled={debitCursors.length === 1 || debits.isFetching}
                onPress={() => {
                  setDebitCursors((v) => v.slice(0, -1))
                  change("chargeEntryId", "")
                }}
              >
                Previous charges
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={!debits.data?.nextCursor || debits.isFetching}
                onPress={() => {
                  setDebitCursors((v) => [
                    ...v,
                    debits.data?.nextCursor ?? undefined,
                  ])
                  change("chargeEntryId", "")
                }}
              >
                More charges
              </ActionButton>
            </>
          ) : null}
          {mode === "release" ? (
            <Text>
              Remaining allocation:{" "}
              {formatFinanceMoney(
                detail.data?.allocations.find((a) => a.id === allocationId)
                  ?.remainingAmountMinor ?? "0",
                account.currencyCode,
              )}
            </Text>
          ) : null}
          {mode !== "reverse" ? (
            <MoneyField
              label="Amount"
              currencyCode={account.currencyCode}
              value={fields.amount}
              onChangeValue={(v) => change("amount", v)}
            />
          ) : null}
          {needsMoney ? (
            <>
              <Text className="font-semibold">Payment method</Text>
              {(["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"] as const).map(
                (m) => (
                  <Choice
                    key={m}
                    selected={fields.method === m}
                    label={
                      {
                        CASH: "Cash",
                        BANK_TRANSFER: "Bank transfer",
                        CARD: "Card",
                        POS: "POS",
                        OTHER: "Other",
                      }[m]
                    }
                    onPress={() => {
                      change("method", m)
                      change("moneyAccountId", "")
                    }}
                  />
                ),
              )}
              <Text className="font-semibold">
                {mode === "receipt"
                  ? "Money received into"
                  : "Money returned from"}
              </Text>
              {eligibleLedgerMoneyAccounts(
                money.data?.accounts ?? [],
                fields.method,
              ).map((a) => (
                <Choice
                  key={a.id}
                  label={a.name}
                  selected={fields.moneyAccountId === a.id}
                  onPress={() => change("moneyAccountId", a.id)}
                />
              ))}
              <FormField
                label="Reference (optional)"
                value={fields.reference}
                onChangeText={(v) => change("reference", v)}
                maxLength={160}
              />
            </>
          ) : null}
          {mode !== "apply" ? (
            <FormField
              label={mode === "receipt" ? "Description" : "Reason"}
              value={fields.reason}
              onChangeText={(v) => change("reason", v)}
              maxLength={400}
              multiline
            />
          ) : null}
          {mode === "refund" || mode === "reverse" ? (
            <LedgerEffectiveTimeField
              value={fields.date}
              onChange={(v) => change("date", v)}
              disabled={!canSubmit}
              exactRecovery={Boolean(command.retained)}
            />
          ) : null}
          {command.retained &&
          ["apply", "refund", "reverse", "release"].includes(mode) ? (
            <FormField
              label="Original reviewed revision (exact retry)"
              value={fields.revision}
              onChangeText={(v) => change("revision", v)}
              maxLength={19}
              keyboardType="number-pad"
            />
          ) : null}
          <ActionButton disabled={!canSubmit || loading} onPress={prepare}>
            Review
          </ActionButton>
          {dataError ? (
            <ActionButton
              variant="outline"
              onPress={() => {
                if (needsCredit) void credits.refetch()
                if (mode === "apply") void debits.refetch()
                if (needsMoney) void money.refetch()
                if (needsDetail) void detail.refetch()
              }}
            >
              Refresh current sources
            </ActionButton>
          ) : null}
        </>
      )}
    </FinanceFormBody>
  )
}
function Choice({
  label,
  selected,
  onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className={`rounded-xl border px-4 py-3 ${selected ? "border-primary bg-accent" : "border-border"}`}
      onPress={onPress}
    >
      <Text>{label}</Text>
    </Pressable>
  )
}
