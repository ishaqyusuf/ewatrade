import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { prepareCashCount } from "@/lib/finance-cash-input"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import type { FinanceMoneyAccount } from "./finance-accounts-screen"
import type { MobileFinanceCommand } from "./finance-command-feedback"
import { FinanceFormBody } from "./finance-form-body"
import type { FinanceWorkspace } from "./finance-workspace-gate"

export function FinanceCashCountForm({
  book,
  accounts,
  command,
  feedback,
  canSubmit,
  onDone,
  onBack,
}: {
  book: FinanceWorkspace["book"]
  accounts: FinanceMoneyAccount[]
  command: MobileFinanceCommand
  feedback: ReactNode
  canSubmit: boolean
  onDone: () => void
  onBack: () => void
}) {
  const trpc = useTRPC()
  const mutation = useMutation(trpc.finance.recordCashCount.mutationOptions())
  const retained = command.retained?.command
  const retry =
    retained?.operation === "recordCashCount"
      ? retained.recoveryMetadata
      : undefined
  const [accountId, setAccountId] = useState(
    retry?.accountId ?? accounts[0]?.id ?? "",
  )
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [review, setReview] = useState<ReturnType<
    typeof prepareCashCount
  > | null>(null)
  const [error, setError] = useState<string | null>(null)
  function prepare() {
    try {
      if (retry?.accountId && retry.accountId !== accountId)
        throw new Error("Choose the original cash account for the saved count.")
      const payload = prepareCashCount({
        bookId: book.id,
        accountId,
        activeCashAccountIds: accounts
          .filter((a) => a.purpose === "CASH" && !a.archivedAt)
          .map((a) => a.id),
        startsAt: book.startsAt,
        asOf: retry?.asOf ? new Date(retry.asOf) : new Date(),
        amount,
        reference,
      })
      setReview(payload)
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the cash count details.",
      )
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review
    if (
      await command.run(
        "recordCashCount",
        attempt,
        (id) => mutation.mutateAsync({ ...attempt, clientCommandId: id }),
        "Physical cash count recorded. No adjustment was posted.",
        { accountId: attempt.accountId, asOf: attempt.asOf.toISOString() },
      )
    )
      onDone()
  }
  return (
    <FinanceFormBody>
      {feedback}
      <Text className="text-xl font-bold">
        {review ? "Review physical cash count" : "Record cash count"}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Count the cash physically held. Recording an observation does not change
        recorded cash. Investigate any difference separately.
      </Text>
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      {review ? (
        <>
          <Text className="text-2xl font-bold">
            {formatFinanceMoney(review.observedBalanceMinor, book.currencyCode)}
          </Text>
          <Text>
            Cash account:{" "}
            {accounts.find((a) => a.id === review.accountId)?.name}
          </Text>
          <Text>{review.reference}</Text>
          <Text>Count time: {review.asOf.toISOString()} UTC</Text>
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
          <Text className="font-semibold">Cash account</Text>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: account.id === accountId }}
              haptic
              className={`rounded-xl border px-4 py-3 ${account.id === accountId ? "border-primary bg-accent" : "border-border"}`}
              onPress={() => setAccountId(account.id)}
            >
              <Text>{account.name}</Text>
            </Pressable>
          ))}
          <MoneyField
            label="Cash counted"
            currencyCode={book.currencyCode}
            value={amount}
            onChangeValue={setAmount}
          />
          <FormField
            label="Count reference"
            value={reference}
            onChangeText={setReference}
            maxLength={200}
          />
          <Text className="text-sm text-muted-foreground">
            Zero is a valid count.{" "}
            {retry?.asOf
              ? `Retry count time: ${retry.asOf} UTC. Re-enter the original amount and reference.`
              : "The exact count time is captured when you review."}
          </Text>
          <ActionButton
            disabled={!canSubmit || accounts.length === 0}
            onPress={prepare}
          >
            Review count
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={onBack}
          >
            Back to counts
          </ActionButton>
        </>
      )}
    </FinanceFormBody>
  )
}
