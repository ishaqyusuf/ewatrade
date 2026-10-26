import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { normalizeMobileRole } from "@/lib/mobile-roles"
import { cn } from "@/lib/utils"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import {
  type CheckoutAccountState,
  type CheckoutMoneyAccount,
  checkoutAccountUnavailableReason,
} from "./checkout-money-account-model"

const METHOD_ICON: Record<string, IconKeys> = {
  bank_transfer: "Building",
  cash: "Wallet",
  pos: "CreditCard",
}

/**
 * Into row (Workshop mobile/checkout-money-account 01): where money received
 * now is recorded, kept separate from how it was paid. Change opens a sheet of
 * accounts that accept this method; the rest are shown greyed with a reason.
 */
export function CheckoutMoneyAccountField({
  state,
  accounts,
  method,
  methodLabel,
  receivedLabel,
  disabled,
  onChoose,
  onRetry,
  onRecordPending,
}: {
  state: CheckoutAccountState
  /** Every account from the fresh read, for the greyed "not for this" list. */
  accounts: CheckoutMoneyAccount[]
  method: string
  methodLabel: string
  receivedLabel: string
  disabled: boolean
  onChoose: (account: CheckoutMoneyAccount) => void
  onRetry: () => void
  /** Checkout only: offer recording the sale as Payment pending instead. */
  onRecordPending?: () => void
}) {
  const chooser = useModal()
  const router = useRouter()
  const role = normalizeMobileRole(useAuthContext().profile?.role)
  const canSetUp = role === "OWNER" || role === "ADMIN"
  const lower = methodLabel.toLowerCase()
  if (state.kind === "not_needed") return null
  const label = (
    <Text className="mx-0.5 mb-2 mt-4 text-xs font-extrabold uppercase tracking-[1px] text-muted-foreground">
      Into
    </Text>
  )
  const pendingAction = onRecordPending
    ? { actionLabel: "Record as pending", onActionPress: onRecordPending }
    : {}
  const orPending = onRecordPending
    ? ", or record this sale as Payment pending"
    : ""
  if (state.kind === "loading")
    return (
      <View>
        {label}
        <SkeletonGroup accessibilityLabel="Loading accounts">
          <Skeleton height={64} />
        </SkeletonGroup>
      </View>
    )
  if (state.kind === "offline_unavailable")
    return (
      <View>
        {label}
        <StatusBanner
          icon="WifiOff"
          tone="warning"
          title="No saved account on this phone"
          message="Reconnect to choose where the money goes, or record this sale as Payment pending and collect later."
          {...pendingAction}
        />
      </View>
    )
  if (state.kind === "denied")
    return (
      <View>
        {label}
        <StatusBanner
          icon="Lock"
          tone="warning"
          title="You can't record payments into accounts"
          message={`Ask your owner for access${orPending}.`}
          {...pendingAction}
        />
      </View>
    )
  if (state.kind === "error")
    return (
      <View>
        {label}
        <StatusBanner
          icon="AlertCircle"
          tone="destructive"
          title="Accounts didn't load"
          message="Try again before recording money received now."
          actionLabel="Try again"
          onActionPress={onRetry}
        />
      </View>
    )
  if (state.kind === "none")
    return (
      <View>
        {label}
        <StatusBanner
          icon="TriangleAlert"
          tone="warning"
          title={`No account takes ${lower} payments yet`}
          message={
            canSetUp
              ? `Set one up in Money Accounts${orPending}.`
              : `Ask your owner to add one${orPending}.`
          }
          {...pendingAction}
          linkLabel={canSetUp ? "Set up account" : undefined}
          onLinkPress={
            canSetUp
              ? () => router.push("/finance-accounts-modal" as never)
              : undefined
          }
        />
      </View>
    )
  const selected = state.kind === "selected" ? state.account : null
  const canChange = !(state.kind === "selected" && state.eligible.length < 2)
  const others = accounts.filter(
    (account) => !state.eligible.some((entry) => entry.id === account.id),
  )
  return (
    <View>
      {label}
      {state.kind === "choose_again" ? (
        <View className="mb-2">
          <StatusBanner
            icon="AlertCircle"
            tone="destructive"
            title={`${state.previousName} can't take this payment now`}
            message="Choose another account. Nothing was recorded."
          />
        </View>
      ) : null}
      <Pressable
        accessibilityHint={canChange ? "Opens the account list" : undefined}
        accessibilityLabel={
          selected
            ? `Money goes into ${selected.name}`
            : `Choose an account, required for ${receivedLabel} received now`
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || !canChange }}
        className={cn(
          "min-h-16 flex-row items-center gap-3 rounded-[18px] bg-card px-3.5 py-3",
          !selected && "border-2 border-destructive",
        )}
        disabled={disabled || !canChange}
        haptic
        onPress={() => chooser.present()}
      >
        <View className="size-9 items-center justify-center rounded-xl bg-tint-mint">
          <Icon
            className="size-[18px] text-tint-mint-foreground"
            name={METHOD_ICON[method] ?? "Wallet"}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold text-muted-foreground">
            Money goes into
          </Text>
          <Text className="text-sm font-extrabold text-foreground">
            {selected ? selected.name : "Choose an account"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {selected
              ? state.kind === "selected" && state.sole
                ? `Only account that takes ${lower}`
                : `Takes ${lower}`
              : `Required for ${receivedLabel} received now`}
            {"cached" in state && state.cached ? " · Checked when synced" : ""}
          </Text>
        </View>
        {canChange ? (
          <Text className="text-xs font-extrabold text-primary">
            {selected ? "Change" : "Choose"}
          </Text>
        ) : null}
      </Pressable>
      <Modal ref={chooser.ref} title={`Where does this ${lower} go?`}>
        <BottomSheetScrollView
          contentContainerStyle={{
            gap: 4,
            paddingBottom: 24,
            paddingHorizontal: 18,
          }}
        >
          <Text className="mb-1 text-xs text-muted-foreground">
            Only accounts that take {lower} payments.
          </Text>
          {state.eligible.map((account) => {
            const on = selected?.id === account.id
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                className="min-h-14 flex-row items-center gap-3 border-t border-border py-3 first:border-t-0"
                haptic="selection"
                key={account.id}
                onPress={() => {
                  onChoose(account)
                  chooser.dismiss()
                }}
              >
                <View
                  className={cn(
                    "size-5 rounded-full border-2 border-border",
                    on && "border-[6px] border-primary",
                  )}
                />
                <Text className="flex-1 text-sm font-bold text-foreground">
                  {account.name}
                </Text>
              </Pressable>
            )
          })}
          {others.length ? (
            <>
              <Text className="mt-3 text-xs font-extrabold uppercase tracking-[1px] text-muted-foreground">
                Not for {lower}
              </Text>
              {others.map((account) => (
                <View
                  accessible
                  accessibilityLabel={`${account.name}, unavailable: ${checkoutAccountUnavailableReason(account, methodLabel)}`}
                  className="min-h-12 flex-row items-center gap-3 py-2.5 opacity-50"
                  key={account.id}
                >
                  <View className="size-5 rounded-full border-2 border-border" />
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-foreground">
                      {account.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {checkoutAccountUnavailableReason(account, methodLabel)}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </BottomSheetScrollView>
      </Modal>
    </View>
  )
}
