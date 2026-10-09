import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
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
import { BigAmountField } from "../green-till/big-amount-field"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, SectionHeader } from "../green-till/kit"
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
  // Apply credit with one credit and one charge: pick both and fill the
  // amount that settles as much as possible. Everything stays editable.
  const onlyCredit =
    credits.data?.sources.length === 1 ? credits.data.sources[0] : undefined
  const onlyCharge =
    debits.data?.sources.length === 1 ? debits.data.sources[0] : undefined
  useEffect(() => {
    if (mode !== "apply" || !onlyCredit || !onlyCharge) return
    setFields((f) => {
      if (f.creditEntryId || f.chargeEntryId || f.amount) return f
      const settle =
        BigInt(onlyCredit.remainingAmountMinor) <
        BigInt(onlyCharge.remainingAmountMinor)
          ? BigInt(onlyCredit.remainingAmountMinor)
          : BigInt(onlyCharge.remainingAmountMinor)
      return {
        ...f,
        amount:
          settle % 100n === 0n
            ? (settle / 100n).toString()
            : `${settle / 100n}.${(settle % 100n).toString().padStart(2, "0")}`,
        chargeEntryId: onlyCharge.id,
        creditEntryId: onlyCredit.id,
      }
    })
  }, [mode, onlyCredit, onlyCharge])
  // One account fits the method: choose it, as the cashier would.
  const eligibleMoney = eligibleLedgerMoneyAccounts(
    money.data?.accounts ?? [],
    fields.method,
  )
  const onlyMoneyId =
    eligibleMoney.length === 1 ? eligibleMoney[0]?.id : undefined
  useEffect(() => {
    if (needsMoney && onlyMoneyId && !fields.moneyAccountId)
      setFields((f) => ({ ...f, moneyAccountId: onlyMoneyId }))
  }, [needsMoney, onlyMoneyId, fields.moneyAccountId])
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
  // Whole naira wherever kobo are zero; exact entries keep their kobo.
  const whole = (minor: string) =>
    formatFinanceMoney(minor, account.currencyCode).replace(/\.00$/, "")
  const receiptEntry = mode === "receipt" && !review && !saved
  const debtMinor = BigInt(account.totals.outstandingDebtMinor)
  const toMajorInput = (minor: bigint) =>
    minor % 100n === 0n
      ? (minor / 100n).toString()
      : `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`
  const amountMinorOf = (input: string) => {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.replace(/,/g, ""))
    if (!match?.[1]) return null
    return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
  }
  const enteredMinor = amountMinorOf(fields.amount)
  const reviewMinor =
    review && "amountMinor" in review.payload
      ? review.payload.amountMinor
      : (detail.data?.entry.amountMinor ?? "0")
  const methodLabel: Record<LedgerFields["method"], string> = {
    CASH: "Cash",
    BANK_TRANSFER: "Bank transfer",
    CARD: "Card",
    POS: "POS",
    OTHER: "Other",
  }
  const methodIcon: Record<LedgerFields["method"], IconKeys> = {
    CASH: "Wallet",
    BANK_TRANSFER: "Building2",
    CARD: "CreditCard",
    POS: "CreditCard",
    OTHER: "more",
  }
  return (
    <FinanceFormBody>
      {receiptEntry ? (
        <BigAmountField
          currencyCode={account.currencyCode}
          editable={canSubmit}
          label="Amount received"
          onChangeValue={(v) => change("amount", v)}
          suggestions={
            debtMinor > 0n
              ? [
                  {
                    label: `${whole(account.totals.outstandingDebtMinor)} · net owed`,
                    tint: "amber",
                    value: toMajorInput(debtMinor),
                  },
                ]
              : [
                  {
                    label: "Held as credit",
                    tint: "sky",
                    value: fields.amount,
                  },
                ]
          }
          value={fields.amount}
        />
      ) : review ? (
        <HeroCard
          label={
            mode === "receipt"
              ? `${account.customer.name} pays`
              : `${
                  {
                    apply: "Apply credit",
                    opening: "Opening balance",
                    refund: "Return credit",
                    release: "Release allocation",
                    reverse: "Correct entry",
                  }[mode]
                } · ${account.customer.name}`
          }
          amount={whole(reviewMinor)}
          sub={
            mode === "receipt"
              ? "Held as credit until you apply it to a charge"
              : undefined
          }
        />
      ) : (
        <HeroCard
          label={account.customer.name}
          amount={whole(account.totals.outstandingDebtMinor)}
          sub="Recorded amount owed"
          stats={[
            {
              label: "Credit",
              value: whole(account.totals.availableCreditMinor),
            },
            {
              label: "Net",
              value: whole(account.totals.netBalanceMinor),
            },
          ]}
        />
      )}
      {mode === "receipt" ? null : (
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
      )}
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
      {command.notice && !saved ? (
        <StatusBanner message={command.notice} />
      ) : null}
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
          <SectionHeader title="Before and after" />
          <ListCard>
            {[
              <ReviewRow
                key="amount"
                label="Amount"
                value={whole(reviewMinor)}
              />,
              moneyId ? (
                <ReviewRow
                  key="method"
                  label="Method"
                  value={`${methodLabel[fields.method]} · ${money.data?.accounts.find((a) => a.id === moneyId)?.name ?? "Money account"}`}
                />
              ) : null,
              creditId ? (
                <ReviewRow
                  key="credit-used"
                  label="Credit used"
                  value={
                    creditSource ? sourceLabel(creditSource) : "Reviewed source"
                  }
                />
              ) : null,
              chargeId ? (
                <ReviewRow
                  key="charge"
                  label="Charge"
                  value={
                    chargeSource ? sourceLabel(chargeSource) : "Reviewed debt"
                  }
                />
              ) : null,
              after ? (
                <ReviewRow
                  key="owed"
                  label="Owed"
                  before={whole(account.totals.outstandingDebtMinor)}
                  value={whole(after.outstandingDebtMinor)}
                />
              ) : null,
              after ? (
                <ReviewRow
                  key="credit"
                  label="Credit"
                  before={whole(account.totals.availableCreditMinor)}
                  value={whole(after.availableCreditMinor)}
                />
              ) : null,
              after ? (
                <ReviewRow
                  key="net"
                  label="Net balance"
                  value={whole(after.netBalanceMinor)}
                />
              ) : null,
              "reason" in review.payload && review.payload.reason ? (
                <ReviewRow
                  key="reason"
                  label="Reason"
                  value={review.payload.reason}
                />
              ) : "description" in review.payload &&
                review.payload.description ? (
                <ReviewRow
                  key="note"
                  label="Note"
                  value={review.payload.description}
                />
              ) : null,
            ]}
          </ListCard>
          <Text className="mx-0.5 text-xs text-muted-foreground">
            {mode === "reverse"
              ? "Bookkeeping reverses the original effects; no payout is made."
              : "Recording does not move money. The server checks current records."}
          </Text>
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
              {creditCursors.length > 1 || credits.data?.nextCursor ? (
                <>
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
              {debitCursors.length > 1 || debits.data?.nextCursor ? (
                <>
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
          {mode !== "reverse" && mode !== "receipt" ? (
            <MoneyField
              label="Amount"
              currencyCode={account.currencyCode}
              value={fields.amount}
              onChangeValue={(v) => change("amount", v)}
            />
          ) : null}
          {needsMoney ? (
            <>
              <FieldLabel>Payment method</FieldLabel>
              <View className="-mt-2 flex-row flex-wrap gap-2">
                {(
                  ["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"] as const
                ).map((m) => (
                  <ChoiceChip
                    key={m}
                    icon={methodIcon[m]}
                    label={methodLabel[m]}
                    selected={fields.method === m}
                    onPress={() => {
                      change("method", m)
                      change("moneyAccountId", "")
                    }}
                  />
                ))}
              </View>
              <FieldLabel>
                {mode === "receipt" ? "Received into" : "Returned from"}
              </FieldLabel>
              <View className="-mt-2 flex-row flex-wrap gap-2">
                {eligibleLedgerMoneyAccounts(
                  money.data?.accounts ?? [],
                  fields.method,
                ).map((a) => (
                  <ChoiceChip
                    key={a.id}
                    icon={fields.method === "CASH" ? "Wallet" : "Building2"}
                    label={a.name}
                    selected={fields.moneyAccountId === a.id}
                    onPress={() => change("moneyAccountId", a.id)}
                  />
                ))}
              </View>
              <FormField
                variant="green-gate"
                placeholder="Transfer ref or receipt no."
                label="Reference · optional"
                value={fields.reference}
                onChangeText={(v) => change("reference", v)}
                maxLength={160}
              />
            </>
          ) : null}
          {mode !== "apply" ? (
            <FormField
              variant={mode === "receipt" ? "green-gate" : undefined}
              label={mode === "receipt" ? "Note · required" : "Reason"}
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
            {mode === "receipt" && enteredMinor && enteredMinor > 0n
              ? `Review ${whole(enteredMinor.toString())}`
              : "Review"}
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
      className={
        selected
          ? "min-h-12 justify-center rounded-[14px] border-[1.5px] border-primary bg-accent px-4 py-3"
          : "min-h-12 justify-center rounded-[14px] border-[1.5px] border-transparent bg-card px-4 py-3 shadow-sm"
      }
      haptic
      onPress={onPress}
    >
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
    </Pressable>
  )
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mx-0.5 mt-1 text-xs font-extrabold text-muted-foreground">
      {children}
    </Text>
  )
}

function ChoiceChip({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: IconKeys
  label: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className={
        selected
          ? "min-h-10 flex-row items-center gap-1.5 rounded-xl border-[1.5px] border-primary bg-accent px-3.5"
          : "min-h-10 flex-row items-center gap-1.5 rounded-xl border-[1.5px] border-transparent bg-card px-3.5 shadow-sm"
      }
      haptic
      onPress={onPress}
    >
      <Icon
        className={
          selected
            ? "size-[15px] text-accent-foreground"
            : "size-[15px] text-foreground"
        }
        name={icon}
      />
      <Text
        className={
          selected
            ? "text-[13px] font-bold text-accent-foreground"
            : "text-[13px] font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

function ReviewRow({
  before,
  label,
  value,
}: {
  before?: string
  label: string
  value: string
}) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-2.5 py-2.5">
      <Text className="text-[13.5px] text-muted-foreground">{label}</Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
        {before !== undefined && before !== value ? (
          <>
            <Text className="text-[13.5px] text-muted-foreground line-through">
              {before}
            </Text>
            <Icon
              className="size-[13px] text-muted-foreground"
              name="ArrowRight"
            />
          </>
        ) : null}
        <Text
          numberOfLines={2}
          className="shrink text-right text-[13.5px] font-bold tabular-nums text-foreground"
        >
          {value}
        </Text>
      </View>
    </View>
  )
}
