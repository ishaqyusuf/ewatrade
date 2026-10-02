import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  type FinanceMoneyKind,
  financeMoneyKinds,
  prepareMoneyMovement,
} from "@/lib/finance-money-input"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { View } from "react-native"
import type { FinanceMoneyAccount } from "./finance-accounts-screen"
import type { MobileFinanceCommand } from "./finance-command-feedback"
import { FinanceFormBody } from "./finance-form-body"
import type { FinanceWorkspace } from "./finance-workspace-gate"

const meanings: Record<FinanceMoneyKind, string> = {
  TRANSFER:
    "Record money already moved between business accounts. Total business money stays the same.",
  OWNER_CONTRIBUTION:
    "Record personal funds the owner already added to the business. This increases owner capital; it is not sales income.",
  OWNER_WITHDRAWAL:
    "Record business money the owner already took for personal use. This reduces owner capital; it is not a business expense.",
  OPENING_BALANCE:
    "Record the balance held when bookkeeping started. This is permitted once per account and is not sales income.",
}
export function FinanceMoneyForm({
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
  const mutation = useMutation(trpc.finance.recordMoney.mutationOptions())
  const [kind, setKind] = useState<FinanceMoneyKind>("TRANSFER")
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [destinationAccountId, setDestinationAccountId] = useState(
    accounts[1]?.id ?? "",
  )
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [review, setReview] = useState<ReturnType<
    typeof prepareMoneyMovement
  > | null>(null)
  const [error, setError] = useState<string | null>(null)
  function prepare() {
    try {
      setReview(
        prepareMoneyMovement({
          bookId: book.id,
          startsAt: book.startsAt,
          kind,
          accountId,
          destinationAccountId,
          activeAccountIds: accounts.map((a) => a.id),
          amount,
          description,
          date,
        }),
      )
      setError(null)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check movement details.",
      )
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review
    if (
      await command.run(
        "recordMoney",
        attempt,
        (id) => mutation.mutateAsync({ ...attempt, clientCommandId: id }),
        "Money movement recorded.",
      )
    )
      onDone()
  }
  return (
    <FinanceFormBody>
      {feedback}
      <Text className="text-xl font-bold">
        {review ? "Review money movement" : "Record money movement"}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {meanings[review?.kind ?? kind]} Recording does not send money.
      </Text>
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      {review ? (
        <>
          <Text className="text-lg font-bold">
            {financeMoneyKinds[review.kind]}
          </Text>
          <Text className="text-2xl font-bold">
            {formatFinanceMoney(review.amountMinor, book.currencyCode)}
          </Text>
          <View className="gap-3 border-y border-border py-4">
            <Text>
              {review.kind === "TRANSFER" ? "From" : "Account"}:{" "}
              {accounts.find((a) => a.id === review.accountId)?.name}
            </Text>
            {review.kind === "TRANSFER" ? (
              <Text>
                To:{" "}
                {
                  accounts.find((a) => a.id === review.destinationAccountId)
                    ?.name
                }
              </Text>
            ) : null}
            <Text>{review.description}</Text>
            <Text>
              {review.effectiveAt.toISOString().slice(0, 10)} UTC
              {review.kind === "OPENING_BALANCE" ? " · Bookkeeping start" : ""}
            </Text>
          </View>
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
          <Text className="text-sm font-semibold">What happened?</Text>
          {(Object.keys(financeMoneyKinds) as FinanceMoneyKind[]).map(
            (value) => (
              <Choice
                key={value}
                selected={value === kind}
                label={financeMoneyKinds[value]}
                onPress={() => setKind(value)}
              />
            ),
          )}
          <Text className="text-sm font-semibold">
            {kind === "TRANSFER" ? "From account" : "Account"}
          </Text>
          {accounts.map((account) => (
            <Choice
              key={account.id}
              selected={account.id === accountId}
              label={account.name}
              onPress={() => setAccountId(account.id)}
            />
          ))}
          {kind === "TRANSFER" ? (
            <>
              <Text className="text-sm font-semibold">To account</Text>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((account) => (
                  <Choice
                    key={account.id}
                    selected={account.id === destinationAccountId}
                    label={account.name}
                    onPress={() => setDestinationAccountId(account.id)}
                  />
                ))}
            </>
          ) : null}
          <MoneyField
            currencyCode={book.currencyCode}
            label="Amount"
            value={amount}
            onChangeValue={setAmount}
          />
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
          />
          {kind === "OPENING_BALANCE" ? (
            <Text>
              Bookkeeping start:{" "}
              {new Date(book.startsAt).toISOString().slice(0, 10)} UTC
            </Text>
          ) : (
            <FormField
              label="Date (YYYY-MM-DD, UTC)"
              value={date}
              onChangeText={setDate}
              maxLength={10}
            />
          )}
          <ActionButton
            disabled={!canSubmit || accounts.length === 0}
            onPress={prepare}
          >
            Review movement
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={onBack}
          >
            Back to accounts
          </ActionButton>
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
      haptic
      className={`rounded-xl border px-4 py-3 ${selected ? "border-primary bg-accent" : "border-border"}`}
      onPress={onPress}
    >
      <Text className="text-base">{label}</Text>
    </Pressable>
  )
}
