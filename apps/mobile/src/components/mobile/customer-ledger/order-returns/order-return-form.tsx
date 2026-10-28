import { ActionButton } from "@/components/mobile/action-button"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FormField } from "@/components/mobile/form-field"
import { ListCard, ToggleRow } from "@/components/mobile/green-till/kit"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_LABELS,
} from "@ewatrade/utils/finance-payment-methods"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Choice, ReviewRow } from "../customer-ledger-command-form"
import { useMobileCustomerLedgerCommand } from "../use-mobile-customer-ledger-command"
import {
  type AvailableOrderReturn,
  type CashReturnMethod,
  minorToMajorText,
  orderReturnCommandRevision,
  orderReturnConfirmationKey,
  orderReturnDraft,
} from "./order-return-model"

export function OrderReturnForm({
  review,
  actorUserId,
  tenantId,
  active,
  onPin,
  onRefresh,
}: {
  review: AvailableOrderReturn
  actorUserId: string
  tenantId: string
  active: boolean
  onPin: () => void
  onRefresh: () => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const command = useMobileCustomerLedgerCommand({
    actorUserId,
    tenantId,
    bookId: review.bookId,
    accountId: review.accountId,
  })
  const mutation = useMutation(
    trpc.customerLedger.returnOrderFunds.mutationOptions(),
  )
  const [credit, setCredit] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      review.creditSources.map((source) => [
        source.allocationId,
        minorToMajorText(source.remainingMinor),
      ]),
    ),
  )
  const cashHeld = BigInt(review.ordinaryCashMaxMinor) > BigInt(0)
  const [cashOn, setCashOn] = useState(cashHeld)
  const [cash, setCash] = useState(
    cashHeld ? minorToMajorText(review.ordinaryCashMaxMinor) : "",
  )
  const [method, setMethod] = useState<CashReturnMethod>("bank_transfer")
  const [moneyAccountId, setMoneyAccountId] = useState("")
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const submitting = useRef(false)
  const current = useRef(false)
  current.current = active && !offline
  useEffect(() => {
    current.current = active && !offline
    return () => {
      current.current = false
    }
  }, [active, offline])
  const accounts = useQuery(
    trpc.orders.paymentAccounts.queryOptions(undefined, {
      enabled: cashOn && active && !offline && !saved,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    }),
  )
  const accountsReady =
    accounts.isSuccess &&
    accounts.isFetchedAfterMount &&
    accounts.data.book?.id === review.bookId
  const eligible = accountsReady
    ? (accounts.data?.accounts ?? []).filter((account) =>
        account.paymentMethods.includes(method),
      )
    : []
  const selected = eligible.some((account) => account.id === moneyAccountId)
    ? moneyAccountId
    : eligible.length === 1
      ? eligible[0]?.id
      : undefined
  const accountProblem = cashOn
    ? !accountsReady
      ? "Check the money accounts for this Order’s currency before recording a cash return."
      : !selected
        ? "Choose the account the money was paid back from."
        : null
    : null
  const draft = orderReturnDraft(
    {
      bookId: review.bookId,
      accountId: review.accountId,
      expectedRevision: orderReturnCommandRevision(
        review.accountRevision,
        command.retained?.command ?? null,
      ),
      orderId: review.orderId,
      storeId: review.storeId,
      currencyCode: review.currencyCode,
    },
    {
      reason,
      credit: review.creditSources.map((source) => ({
        allocationId: source.allocationId,
        entered: credit[source.allocationId] ?? "",
        capMinor: source.remainingMinor,
      })),
      cash: cashOn
        ? {
            entered: cash,
            capMinor: review.ordinaryCashMaxMinor,
            method,
            reference: method === "cash" ? "" : reference,
            moneyAccountId: selected,
          }
        : null,
    },
  )
  const problems = draft.kind === "invalid" ? draft.problems : {}
  const key =
    draft.kind === "ready" && !accountProblem
      ? orderReturnConfirmationKey(draft.payload)
      : null
  const confirmed = key !== null && key === confirmedKey
  const locked = command.pending || saved || offline || !active
  const money = (minor: string) =>
    formatFinanceMoney(minor, review.currencyCode)
  const creditMinor = draft.kind === "ready" ? draft.creditMinor : "0"
  const cashMinor = draft.kind === "ready" ? draft.cashMinor : "0"

  async function submit() {
    if (
      submitting.current ||
      locked ||
      !command.ready ||
      !confirmed ||
      draft.kind !== "ready"
    )
      return
    submitting.current = true
    onPin()
    try {
      const payload = draft.payload
      const recorded = await command.run(
        "returnOrderFunds",
        payload,
        (id) => {
          if (!current.current)
            throw new Error(
              "Return to this screen online before retrying the original submission.",
            )
          return mutation.mutateAsync({ ...payload, clientCommandId: id })
        },
        payload.creditReturns?.length
          ? payload.cashReturn
            ? "Credit restoration and the cash return shown were recorded."
            : "Credit restoration recorded. No cash return was recorded."
          : "Cash return recorded. No customer credit was restored.",
      )
      if (recorded) {
        setSaved(true)
        await client
          .invalidateQueries({
            queryKey: trpc.businessBanking.orderCustomerFunds.pathKey(),
          })
          .catch(() => undefined)
      }
    } finally {
      submitting.current = false
    }
  }

  return (
    <FinanceFormBody>
      {offline ? (
        <StatusBanner
          message="Reconnect before returning customer funds. The original review has been retained."
          tone="warning"
        />
      ) : null}
      <Text className="text-lg font-extrabold text-foreground">
        Review original payment sources
      </Text>
      <Text className="text-sm text-muted-foreground">
        {review.orderNumber} · {review.customerName}
      </Text>
      <ListCard>
        <ReviewRow
          label="Order paid with held credit"
          value={money(review.creditMaxMinor)}
        />
        <ReviewRow
          label="Order paid with money received"
          value={money(review.ordinaryCashRemainingMinor)}
        />
        <ReviewRow
          label="Proposed credit restoration"
          value={draft.kind === "ready" ? money(creditMinor) : "Review below"}
        />
        <ReviewRow
          label="Proposed cash refund"
          value={draft.kind === "ready" ? money(cashMinor) : "Review below"}
        />
      </ListCard>
      <StatusBanner
        icon="Wallet"
        tone="primary"
        message="Restore credit through the original allocation source. Return bank money separately. Never restore and pay out the same value."
      />
      <View pointerEvents={locked ? "none" : "auto"} className="gap-4">
        {review.creditSources.map((source) => (
          <MoneyField
            key={source.allocationId}
            label={`Back to credit · ${new Date(source.effectiveAt).toLocaleDateString("en-NG")}`}
            currencyCode={review.currencyCode}
            value={credit[source.allocationId] ?? ""}
            editable={!locked}
            error={problems[source.allocationId]}
            helper={`Up to ${money(source.remainingMinor)} returns to this original source. Leave blank to keep it on the Order.`}
            onChangeValue={(value) =>
              setCredit((current) => ({
                ...current,
                [source.allocationId]: value,
              }))
            }
          />
        ))}
        {cashHeld ? (
          <>
            <ToggleRow
              title="Also return money received"
              value={cashOn}
              disabled={locked}
              onValueChange={setCashOn}
            />
            {cashOn ? (
              <>
                <MoneyField
                  label="Amount paid back"
                  currencyCode={review.currencyCode}
                  value={cash}
                  editable={!locked}
                  onChangeValue={setCash}
                  error={problems.cash}
                  helper={`Up to ${money(review.ordinaryCashMaxMinor)}. Customer credit is never paid out as cash.`}
                />
                <Text className="text-sm font-bold text-foreground">
                  Paid back by
                </Text>
                {ORDER_PAYMENT_METHODS.map((value) => (
                  <Choice
                    key={value}
                    label={ORDER_PAYMENT_METHOD_LABELS[value]}
                    selected={value === method}
                    onPress={() => {
                      setMethod(value)
                      setMoneyAccountId("")
                    }}
                  />
                ))}
                <Text className="text-sm font-bold text-foreground">
                  Paid back from
                </Text>
                {eligible.map((account) => (
                  <Choice
                    key={account.id}
                    label={account.name}
                    selected={selected === account.id}
                    onPress={() => setMoneyAccountId(account.id)}
                  />
                ))}
                {accountProblem ? (
                  <StatusBanner
                    message={accountProblem}
                    actionLabel="Check accounts"
                    actionDisabled={accounts.isFetching}
                    onActionPress={() => void accounts.refetch()}
                    tone="warning"
                  />
                ) : null}
                {method !== "cash" ? (
                  <FormField
                    label="Reference · optional"
                    value={reference}
                    editable={!locked}
                    maxLength={160}
                    onChangeText={setReference}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        <FormField
          label="Reason"
          value={reason}
          maxLength={400}
          editable={!locked}
          onChangeText={setReason}
          error={reason ? problems.reason : undefined}
        />
      </View>
      <Text className="text-xs text-muted-foreground">
        The Order total stays the same. Use the Order’s item-return or
        price-adjustment action separately when needed.
      </Text>
      <ToggleRow
        title={
          key
            ? `Restore ${money(creditMinor)} to credit${cashMinor === "0" ? "" : ` and record ${money(cashMinor)} paid back`}`
            : "Check the amounts above"
        }
        sub={
          cashMinor !== "0"
            ? "I have already paid back the cash amount shown. Credit returns to its original source."
            : "No cash is paid out for restored credit."
        }
        value={confirmed}
        disabled={locked || key === null}
        onValueChange={(value) => setConfirmedKey(value ? key : null)}
      />
      {command.retained ? (
        <StatusBanner
          title="Check the earlier submission"
          message="Its result is unconfirmed. Retry only the exact original details or check whether it was recorded."
          actionLabel="Check saved result"
          actionDisabled={locked}
          onActionPress={() => {
            if (!current.current) return
            onPin()
            void command.acknowledge().then((result) => {
              if (result === "RECORDED") setSaved(true)
            })
          }}
        />
      ) : null}
      {command.error ? (
        <StatusBanner
          message={command.error}
          tone="destructive"
          actionLabel={command.retained ? undefined : "Refresh and review"}
          actionDisabled={locked}
          onActionPress={command.retained ? undefined : onRefresh}
        />
      ) : null}
      {command.notice ? (
        <StatusBanner
          message={command.notice}
          tone={saved ? "success" : "default"}
        />
      ) : null}
      {saved ? null : (
        <ActionButton
          disabled={locked || !confirmed || !command.ready}
          isLoading={command.pending}
          loadingLabel="Saving…"
          onPress={() => void submit()}
          variant="destructive"
        >
          Return to original sources
        </ActionButton>
      )}
      <ActionButton
        disabled={command.pending}
        onPress={() => router.back()}
        variant="outline"
      >
        {saved ? "Done" : "Back"}
      </ActionButton>
    </FinanceFormBody>
  )
}
