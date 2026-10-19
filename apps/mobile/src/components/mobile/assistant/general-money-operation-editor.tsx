import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  similarSaleNames,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { minorToMajorInput } from "@ewatrade/utils/currency"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import { MoneyField } from "../money-field"
import { ChatPhotoThumb } from "./chat-photo"
import {
  type NativeMoneyAction,
  nativeMoneyCandidate,
} from "./native-money-values"

type Props = {
  initial: NativeMoneyAction
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}
type Named = { id: string; name: string }
const readOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

export function GeneralMoneyOperationEditor(props: Props) {
  const { profile } = useAuthContext()
  if (!profile?.businessId || !["OWNER", "ADMIN"].includes(profile.role ?? ""))
    return (
      <Text accessibilityRole="alert">
        An owner or administrator can edit financial records.
      </Text>
    )
  return (
    <MoneyEditor
      key={JSON.stringify([
        profile.id,
        profile.businessId,
        profile.storeId,
        profile.role,
        profile.staffAccessMode,
      ])}
      {...props}
    />
  )
}

function MoneyEditor({ initial, currencyCode, disabled, onSave }: Props) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const income = useQuery(
    mountOwnedRead(
      trpc.assistant.saleOptions.queryOptions(
        {},
        { ...readOptions, enabled: initial.action === "money_in_record" },
      ),
      mount,
    ),
  )
  const expense = useQuery(
    mountOwnedRead(
      trpc.assistant.simpleExpenseOptions.queryOptions(
        {},
        { ...readOptions, enabled: initial.action === "expense_record_simple" },
      ),
      mount,
    ),
  )
  const transfer = useQuery(
    mountOwnedRead(
      trpc.assistant.simpleTransferOptions.queryOptions(
        {},
        { ...readOptions, enabled: initial.action === "money_transfer_simple" },
      ),
      mount,
    ),
  )
  const incomeRead = freshShownRead(income)
  const expenseRead = freshShownRead(expense)
  const transferRead = freshShownRead(transfer)
  const incomeData = incomeRead.state === "ready" ? incomeRead.data : null
  const expenseData = expenseRead.state === "ready" ? expenseRead.data : null
  const transferData = transferRead.state === "ready" ? transferRead.data : null
  const state =
    initial.action === "money_in_record"
      ? incomeRead.state
      : initial.action === "expense_record_simple"
        ? expenseRead.state
        : transferRead.state
  const accounts: Named[] =
    initial.action === "money_in_record"
      ? (incomeData?.accounts ?? [])
      : initial.action === "expense_record_simple"
        ? (expenseData?.accounts ?? [])
        : (transferData?.accounts ?? [])
  const categories = expenseData?.categories ?? []
  const book =
    initial.action === "expense_record_simple"
      ? expenseData?.book
      : transferData?.book
  const bookUnavailable =
    initial.action !== "money_in_record" &&
    state === "ready" &&
    (!book || (initial.bookId && book.id !== initial.bookId))
  const busy = disabled || state !== "ready" || Boolean(bookUnavailable)
  const [draft, setDraft] = useState(initial)
  const [amount, setAmount] = useState(minorToMajorInput(initial.amountMinor))
  const [details, setDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function save() {
    if (busy) return
    const result = nativeMoneyCandidate(initial, draft, amount)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }
  const retry =
    initial.action === "money_in_record"
      ? income.refetch
      : initial.action === "expense_record_simple"
        ? expense.refetch
        : transfer.refetch
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
      >
        <Text className="text-sm text-muted-foreground">
          Save changes, then review the refreshed proposal before confirming.
          This records existing financial facts; no money is sent.
        </Text>
        {state !== "ready" ? (
          <View className="gap-3">
            <Text accessibilityRole={state === "refused" ? "alert" : undefined}>
              {state === "refused"
                ? "Financial choices unavailable. Refresh your current access."
                : "Checking current financial choices…"}
            </Text>
            {state === "refused" ? (
              <ActionButton
                disabled={disabled}
                variant="outline"
                onPress={() => void retry()}
              >
                Retry choices
              </ActionButton>
            ) : null}
          </View>
        ) : bookUnavailable ? (
          <Text accessibilityRole="alert">
            The original Finance Book is unavailable. Review this draft in chat
            before editing.
          </Text>
        ) : (
          <>
            <MoneyField
              label="Amount"
              currencyCode={currencyCode}
              value={amount}
              onChangeValue={setAmount}
              editable={!busy}
              inputClassName="text-2xl font-bold"
            />
            {draft.action === "money_in_record" ? (
              <>
                <AccountField
                  label="Into account"
                  value={draft.accountName ?? ""}
                  selectedId={draft.moneyAccountId}
                  accounts={accounts}
                  disabled={busy}
                  onType={(name) =>
                    setDraft({
                      ...draft,
                      accountName: name || undefined,
                      moneyAccountId: undefined,
                      createAccount: false,
                    })
                  }
                  onPick={(account) =>
                    setDraft({
                      ...draft,
                      accountName: account.name,
                      moneyAccountId: account.id,
                      createAccount: false,
                    })
                  }
                />
                {draft.accountName && !draft.moneyAccountId ? (
                  <ActionButton
                    variant="outline"
                    disabled={busy}
                    onPress={() => setDraft({ ...draft, createAccount: true })}
                  >
                    {draft.createAccount
                      ? "New bookkeeping account staged"
                      : "Review this name as a new bookkeeping account"}
                  </ActionButton>
                ) : null}
                <Text className="text-xs text-muted-foreground">
                  Recorded as Owner funds. Ask in chat if this is a loan,
                  customer deposit or another kind of money.
                </Text>
              </>
            ) : draft.action === "money_transfer_simple" ? (
              <>
                <AccountField
                  label="From account"
                  value={draft.fromAccountName ?? ""}
                  selectedId={draft.fromMoneyAccountId}
                  accounts={accounts}
                  disabled={busy}
                  onType={(name) =>
                    setDraft({
                      ...draft,
                      fromAccountName: name || undefined,
                      fromMoneyAccountId: undefined,
                    })
                  }
                  onPick={(account) =>
                    setDraft({
                      ...draft,
                      fromAccountName: account.name,
                      fromMoneyAccountId: account.id,
                    })
                  }
                />
                <AccountField
                  label="To account"
                  value={draft.toAccountName ?? ""}
                  selectedId={draft.toMoneyAccountId}
                  accounts={accounts.filter(
                    (row) => row.id !== draft.fromMoneyAccountId,
                  )}
                  disabled={busy}
                  onType={(name) =>
                    setDraft({
                      ...draft,
                      toAccountName: name || undefined,
                      toMoneyAccountId: undefined,
                      newToAccount: undefined,
                    })
                  }
                  onPick={(account) =>
                    setDraft({
                      ...draft,
                      toAccountName: account.name,
                      toMoneyAccountId: account.id,
                      newToAccount: undefined,
                    })
                  }
                />
                {draft.toAccountName && !draft.toMoneyAccountId ? (
                  <View className="gap-2">
                    <Text className="text-xs text-muted-foreground">
                      A new bookkeeping account is added only after review and
                      confirmation. It does not open a bank account.
                    </Text>
                    {(["BANK", "CASH"] as const).map((kind) => (
                      <ActionButton
                        key={kind}
                        variant="outline"
                        disabled={busy}
                        accessibilityState={{
                          selected: draft.newToAccount?.kind === kind,
                        }}
                        onPress={() =>
                          setDraft({
                            ...draft,
                            newToAccount: {
                              name: draft.toAccountName ?? "",
                              kind,
                            },
                          })
                        }
                      >{`${draft.newToAccount?.kind === kind ? "Selected: " : "Stage new "}${kind === "BANK" ? "Bank" : "Cash"} bookkeeping account`}</ActionButton>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <FormField
                  label="What was this for?"
                  value={draft.description ?? ""}
                  editable={!busy}
                  maxLength={200}
                  onChangeText={(description) =>
                    setDraft({
                      ...draft,
                      description: description || undefined,
                    })
                  }
                />
                <View className="gap-2">
                  {([true, false] as const).map((paid) => (
                    <ActionButton
                      key={String(paid)}
                      variant="outline"
                      disabled={busy}
                      accessibilityState={{ selected: draft.paid === paid }}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          paid,
                          ...(paid
                            ? {}
                            : {
                                accountName: undefined,
                                moneyAccountId: undefined,
                              }),
                        })
                      }
                    >{`${draft.paid === paid ? "Selected: " : ""}${paid ? "Already paid" : "Not paid yet"}`}</ActionButton>
                  ))}
                </View>
                {draft.paid ? (
                  <AccountField
                    label="Paid from"
                    value={draft.accountName ?? ""}
                    selectedId={draft.moneyAccountId}
                    accounts={accounts}
                    disabled={busy}
                    onType={(name) =>
                      setDraft({
                        ...draft,
                        accountName: name || undefined,
                        moneyAccountId: undefined,
                      })
                    }
                    onPick={(account) =>
                      setDraft({
                        ...draft,
                        accountName: account.name,
                        moneyAccountId: account.id,
                      })
                    }
                  />
                ) : null}
                <AccountField
                  label="Expense category"
                  value={draft.categoryName ?? ""}
                  selectedId={draft.expenseCategoryId}
                  accounts={categories}
                  disabled={busy}
                  onType={(name) =>
                    setDraft({
                      ...draft,
                      categoryName: name || undefined,
                      expenseCategoryId: undefined,
                    })
                  }
                  onPick={(category) =>
                    setDraft({
                      ...draft,
                      categoryName: category.name,
                      expenseCategoryId: category.id,
                    })
                  }
                />
              </>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: details }}
              className="min-h-11 justify-center"
              onPress={() => setDetails(!details)}
            >
              <Text className="font-medium text-primary">
                {details ? "Hide details" : "Details"}
              </Text>
            </Pressable>
            {details ? (
              <View className="gap-4">
                {draft.action === "expense_record_simple" ? (
                  <FormField
                    label="Payee (optional)"
                    value={draft.payeeName ?? ""}
                    editable={!busy}
                    maxLength={160}
                    onChangeText={(payeeName) =>
                      setDraft({ ...draft, payeeName: payeeName || undefined })
                    }
                  />
                ) : (
                  <FormField
                    label="Note (optional)"
                    value={
                      draft.action === "money_in_record"
                        ? draft.description
                        : draft.note
                    }
                    editable={!busy}
                    maxLength={400}
                    multiline
                    onChangeText={(note) =>
                      setDraft(
                        draft.action === "money_in_record"
                          ? { ...draft, description: note }
                          : { ...draft, note },
                      )
                    }
                  />
                )}
                <Text className="text-sm text-muted-foreground">
                  The reviewed posting date stays unchanged. Ask in chat to
                  change it. Photos are retained without analysis and do not
                  become permanent Finance receipt storage.
                </Text>
                {draft.attachmentIds.map((id, index) => (
                  <View key={id} className="gap-2">
                    <ChatPhotoThumb attachmentId={id} />
                    <ActionButton
                      variant="outline"
                      disabled={busy}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          attachmentIds: draft.attachmentIds.filter(
                            (value) => value !== id,
                          ),
                        })
                      }
                    >{`Remove photo ${index + 1}`}</ActionButton>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={busy} onPress={save}>
          Save and review
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

function AccountField({
  label,
  value,
  selectedId,
  accounts,
  disabled,
  onType,
  onPick,
}: {
  label: string
  value: string
  selectedId?: string
  accounts: readonly Named[]
  disabled: boolean
  onType: (name: string) => void
  onPick: (account: Named) => void
}) {
  const close =
    !selectedId && value ? similarSaleNames(value, [...accounts]) : []
  const suggestions = (
    close.length ? close : accounts.filter((row) => row.id !== selectedId)
  ).slice(0, 6)
  return (
    <View className="gap-2">
      <FormField
        label={label}
        value={value}
        editable={!disabled}
        maxLength={160}
        onChangeText={onType}
      />
      <View className="flex-row flex-wrap gap-2">
        {suggestions.map((account) => (
          <ActionButton
            key={account.id}
            className="w-auto px-3"
            variant="outline"
            disabled={disabled}
            onPress={() => onPick(account)}
          >
            {account.name}
          </ActionButton>
        ))}
      </View>
    </View>
  )
}
