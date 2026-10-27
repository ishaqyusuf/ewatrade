import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { ListCard, ToggleRow } from "../green-till/kit"
import { SearchFooterSpacer } from "../search-footer-scope"
import {
  type PaymentLinksAction,
  paymentLinkLifetimeChoices,
  paymentLinkLifetimeLabel,
  paymentLinksReviewParts,
} from "./native-payment-links-values"

function OrderRows({
  review,
  count,
}: {
  review?: string[]
  count: number
}) {
  const { orders } = paymentLinksReviewParts(review)
  if (!orders.length)
    return (
      <Text className="text-base [-rn-line-height:22] text-foreground">
        {count} unpaid order{count === 1 ? "" : "s"}
      </Text>
    )
  return (
    <ListCard>
      {orders.map((order) => (
        <View
          key={order.orderNumber}
          className="min-h-[48px] flex-row items-center justify-between gap-3 py-3"
        >
          <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
            {order.orderNumber}
          </Text>
          <Text className="text-sm tabular-nums text-muted-foreground">
            {order.due} due
          </Text>
        </View>
      ))}
    </ListCard>
  )
}

/**
 * Edits the receiving account, amount rule and lifetime of a payment links
 * draft. The orders stay fixed; saving makes a new revision to confirm again.
 */
export function GeneralPaymentLinksEditor({
  initial,
  review,
  disabled,
  onSave,
}: {
  initial: PaymentLinksAction
  review?: string[]
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}) {
  const trpc = useTRPC()
  // Masked receiving accounts any order operator may choose from.
  const candidates = useQuery(
    trpc.businessBanking.linkCandidates.queryOptions(
      { period: "today" },
      { retry: false },
    ),
  )
  const accounts = candidates.data?.accounts ?? []
  const [bankAccountId, setBankAccountId] = useState(initial.bankAccountId)
  const [allowPartial, setAllowPartial] = useState(initial.allowPartial)
  const [lifetimeMinutes, setLifetimeMinutes] = useState(
    initial.lifetimeMinutes,
  )
  const [error, setError] = useState<string | null>(null)
  const known = accounts.some((account) => account.id === bankAccountId)
  function save() {
    if (disabled) return
    if (candidates.isSuccess && !known) {
      setError("Choose an account with bank details.")
      return
    }
    const parsed = generalActionSchema.safeParse({
      ...initial,
      bankAccountId,
      allowPartial,
      lifetimeMinutes,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.")
      return
    }
    setError(null)
    onSave(parsed.data)
  }
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
          Save changes, then review the updated card before confirming.
        </Text>
        <View className="gap-2">
          <Text className="text-sm font-bold text-foreground">
            Order{initial.orderIds.length === 1 ? "" : "s"}
          </Text>
          <OrderRows review={review} count={initial.orderIds.length} />
          <Text className="text-sm text-muted-foreground">
            Ask in chat to choose other orders.
          </Text>
        </View>
        <View
          className="gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel="Pays into"
        >
          <Text className="text-sm font-bold text-foreground">Pays into</Text>
          {candidates.isPending ? (
            <Text className="text-sm text-muted-foreground">
              Loading accounts…
            </Text>
          ) : candidates.isError ? (
            <Text className="text-sm text-muted-foreground">
              Accounts couldn't load. The chosen account stays as it is.
            </Text>
          ) : !accounts.length ? (
            <Text className="text-sm text-muted-foreground">
              No account has bank details yet. An Owner or Admin can add them in
              Money accounts.
            </Text>
          ) : (
            accounts.map((account) => {
              const label = `${account.name} · ${account.bankName ?? "Bank"} ••${account.accountSuffix}`
              const selected = bankAccountId === account.id
              return (
                <Pressable
                  key={account.id}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    setBankAccountId(account.id)
                    setError(null)
                  }}
                  // Border width stays the same when chosen (Android label bug).
                  className={`rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
                >
                  <Text className="text-sm text-foreground">{label}</Text>
                </Pressable>
              )
            })
          )}
        </View>
        <ToggleRow
          title="Customer can change the amount"
          sub={
            allowPartial
              ? "They can report part of the amount due."
              : "They pay the amount due."
          }
          value={allowPartial}
          disabled={disabled}
          onValueChange={setAllowPartial}
        />
        <View
          className="gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel="Link works for"
        >
          <Text className="text-sm font-bold text-foreground">
            Link works for
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {paymentLinkLifetimeChoices(initial.lifetimeMinutes).map(
              (minutes) => {
                const selected = lifetimeMinutes === minutes
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => setLifetimeMinutes(minutes)}
                    className={`min-h-[44px] justify-center rounded-full border px-4 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
                  >
                    <Text className="text-sm text-foreground">
                      {paymentLinkLifetimeLabel(minutes)}
                    </Text>
                  </Pressable>
                )
              },
            )}
          </View>
        </View>
        <Text className="text-sm text-muted-foreground">
          This only creates links to copy or share. Nothing is sent and no
          payment is recorded.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={disabled} onPress={save}>
          Save draft
        </ActionButton>
        <SearchFooterSpacer />
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
