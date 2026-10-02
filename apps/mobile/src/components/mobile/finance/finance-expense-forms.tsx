import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  prepareExpenseCorrection,
  prepareExpensePayment,
} from "@/lib/finance-expense-input"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import type { MobileFinanceCommand } from "./finance-command-feedback"
import type { ExpenseDetail, ExpensePayment } from "./finance-expense-screen"
import type { FinanceWorkspace } from "./finance-workspace-gate"

type FormProps = {
  book: FinanceWorkspace["book"]
  bill: ExpenseDetail
  command: MobileFinanceCommand
  feedback: ReactNode
  canSubmit: boolean
  onDone: () => void
  onBack: () => void
}
function FormBody({ children }: { children: ReactNode }) {
  return (
    <KeyboardAwareScrollView
      className="flex-1"
      bottomOffset={120}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      disableScrollOnKeyboardHide
    >
      <View className="gap-4 px-4 pb-12">{children}</View>
    </KeyboardAwareScrollView>
  )
}
function latestDate(...dates: (Date | string)[]) {
  return new Date(Math.max(...dates.map((date) => new Date(date).getTime())))
}

export function FinanceExpensePaymentForm({
  book,
  bill,
  command,
  feedback,
  canSubmit,
  onDone,
  onBack,
}: FormProps) {
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  const mutation = useMutation(trpc.finance.payBill.mutationOptions())
  const [amount, setAmount] = useState("")
  const [accountId, setAccountId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<ReturnType<
    typeof prepareExpensePayment
  > | null>(null)
  const accounts =
    balances.data?.accounts.filter(
      (a) => ["CASH", "BANK", "CLEARING"].includes(a.purpose) && !a.archivedAt,
    ) ?? []
  const fundingAccountId = accountId || accounts[0]?.id || ""
  function prepare() {
    try {
      if (bill.voidedAt)
        throw new Error("This expense was cancelled. Return to its history.")
      setReview(
        prepareExpensePayment({
          bookId: book.id,
          billId: bill.id,
          outstandingMinor: bill.outstandingMinor,
          earliestDate: latestDate(book.startsAt, bill.incurredAt),
          fundingAccountId,
          activeAccountIds: accounts.map((a) => a.id),
          amount,
          date,
          reference,
        }),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check payment details.")
    }
  }
  async function confirm() {
    if (!review) return
    if (
      await command.run(
        "payBill",
        review,
        (id) => mutation.mutateAsync({ ...review, clientCommandId: id }),
        "Payment recorded.",
      )
    )
      onDone()
  }
  return (
    <FormBody>
      {feedback}
      <Text className="text-xl font-bold">
        {review ? "Review payment" : "Record payment"}
      </Text>
      <Text>
        {bill.payeeName} · Still owed{" "}
        {formatFinanceMoney(bill.outstandingMinor, book.currencyCode)}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Record a payment already made. This does not send money.
      </Text>
      {review ? (
        <>
          <Text className="text-2xl font-bold">
            {formatFinanceMoney(review.amountMinor, book.currencyCode)}
          </Text>
          <Text>
            From{" "}
            {review.funding === "OWNER_CAPITAL"
              ? "owner personal funds (capital contribution)"
              : (accounts.find((a) => a.id === review.accountId)?.name ??
                "selected business account")}
          </Text>
          <Text>{review.effectiveAt.toISOString().slice(0, 10)} UTC</Text>
          {review.reference ? <Text>Reference: {review.reference}</Text> : null}
          <ActionButton
            disabled={!canSubmit}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            Confirm recorded payment
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => setReview(null)}
          >
            Back to payment details
          </ActionButton>
        </>
      ) : (
        <>
          <MoneyField
            label="Amount paid"
            currencyCode={book.currencyCode}
            value={amount}
            onChangeValue={setAmount}
          />
          <Text className="font-bold">Paid from</Text>
          {balances.isPending ? (
            <Text>Loading money accounts…</Text>
          ) : balances.isError ? (
            <StatusBanner
              message={balances.error.message}
              actionLabel="Try again"
              onActionPress={() => void balances.refetch()}
              tone="destructive"
            />
          ) : null}
          {[
            ...accounts.map((a) => ({ id: a.id, name: a.name })),
            {
              id: "OWNER_CAPITAL",
              name: "Owner personal funds (capital contribution)",
            },
          ].map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityLabel={a.name}
              accessibilityState={{ selected: fundingAccountId === a.id }}
              className="min-h-12 justify-center border-b border-border py-3"
              onPress={() => setAccountId(a.id)}
            >
              <Text
                className={
                  fundingAccountId === a.id
                    ? "font-bold text-primary"
                    : "text-foreground"
                }
              >
                {fundingAccountId === a.id ? "✓ " : ""}
                {a.name}
              </Text>
            </Pressable>
          ))}
          <FormField
            label="Payment date (UTC)"
            helper="YYYY-MM-DD"
            maxLength={10}
            value={date}
            onChangeText={setDate}
          />
          <FormField
            label="Payment reference (optional)"
            maxLength={160}
            value={reference}
            onChangeText={setReference}
          />
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          <ActionButton
            disabled={
              !canSubmit ||
              !fundingAccountId ||
              (fundingAccountId !== "OWNER_CAPITAL" && balances.isError)
            }
            onPress={prepare}
          >
            Review payment
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={onBack}
          >
            Back to expense
          </ActionButton>
        </>
      )}
    </FormBody>
  )
}

export function FinanceExpenseCorrectionForm({
  book,
  bill,
  payment,
  command,
  feedback,
  canSubmit,
  onDone,
  onBack,
}: FormProps & { payment?: ExpensePayment }) {
  const trpc = useTRPC()
  const reverse = useMutation(trpc.finance.reverseBillPayment.mutationOptions())
  const cancel = useMutation(trpc.finance.voidExpense.mutationOptions())
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<ReturnType<
    typeof prepareExpenseCorrection
  > | null>(null)
  const action = payment ? "Reverse recorded payment" : "Cancel expense"
  const explanation = payment
    ? "This corrects the recorded payment and reopens the amount owed. It does not send money or issue a refund. The original payment remains in history."
    : "This cancels the recorded expense. Its original amount and correction history remain available."
  function prepare() {
    try {
      if (bill.voidedAt || payment?.reversedAt)
        throw new Error(
          "This record has already been corrected. Return to its history.",
        )
      if (
        !payment &&
        (bill.payments.some((p) => !p.reversedAt) ||
          BigInt(bill.paidMinor) !== 0n)
      )
        throw new Error(
          "Reverse active payments before cancelling this expense.",
        )
      const earliestDate = latestDate(
        book.startsAt,
        bill.incurredAt,
        ...(payment
          ? [payment.effectiveAt]
          : bill.payments.flatMap((p) =>
              p.reversalEffectiveAt ? [p.reversalEffectiveAt] : [],
            )),
      )
      setReview(
        prepareExpenseCorrection({
          bookId: book.id,
          billId: bill.id,
          paymentId: payment?.id,
          earliestDate,
          date,
          reason,
        }),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check correction details.")
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review
    const accepted =
      attempt.operation === "reverseBillPayment"
        ? await command.run(
            attempt.operation,
            attempt.payload,
            (id) =>
              reverse.mutateAsync({ ...attempt.payload, clientCommandId: id }),
            "Payment correction recorded.",
          )
        : await command.run(
            attempt.operation,
            attempt.payload,
            (id) =>
              cancel.mutateAsync({ ...attempt.payload, clientCommandId: id }),
            "Expense cancelled.",
          )
    if (accepted) onDone()
  }
  return (
    <FormBody>
      {feedback}
      <Text className="text-xl font-bold">
        {review ? "Review correction" : action}
      </Text>
      <Text>
        {bill.description} ·{" "}
        {formatFinanceMoney(
          payment?.amountMinor ?? bill.totalMinor,
          book.currencyCode,
        )}
      </Text>
      <Text className="text-sm text-muted-foreground">{explanation}</Text>
      {review ? (
        <>
          <Text>
            {review.payload.effectiveAt.toISOString().slice(0, 10)} UTC
          </Text>
          <Text>Reason: {review.payload.reason}</Text>
          <ActionButton
            disabled={!canSubmit}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            {action}
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => setReview(null)}
          >
            Back to correction details
          </ActionButton>
        </>
      ) : (
        <>
          <FormField
            label="Correction date (UTC)"
            helper="YYYY-MM-DD"
            maxLength={10}
            value={date}
            onChangeText={setDate}
          />
          <FormField
            label="Reason for correction"
            maxLength={400}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          <ActionButton disabled={!canSubmit} onPress={prepare}>
            Review correction
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={onBack}
          >
            Back to expense
          </ActionButton>
        </>
      )}
    </FormBody>
  )
}
