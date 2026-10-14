import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { ActivityIndicator } from "react-native"
import { type WhatsAppActionState, whatsAppActionHint } from "./message-model"
import {
  type OrderMessageTarget,
  useOrderMessageAction,
} from "./use-order-message"

/**
 * The 44pt round WhatsApp action beside Call and Message. Mint means saved
 * wording is ready; grey still opens to explain. Hidden without a phone.
 */
export function WhatsAppRoundButton({
  name,
  state,
  onOpen,
  onRetry,
}: {
  name: string
  state: WhatsAppActionState
  onOpen: () => void
  onRetry: () => void
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  if (state.kind === "hidden") return null
  const ready = state.kind === "ready"
  const loading = state.kind === "loading"
  return (
    <Pressable
      accessibilityLabel={`WhatsApp ${name}: ${whatsAppActionHint(state)}`}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      haptic
      onPress={state.kind === "error" ? onRetry : onOpen}
      style={{
        alignItems: "center",
        // Solid green only when wording is ready; never means sent.
        backgroundColor: ready ? palette.mintForeground : colors.muted,
        borderRadius: 999,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      {loading ? (
        <ActivityIndicator color={colors.mutedForeground} size="small" />
      ) : (
        <Icon
          className="size-[20px]"
          color={ready ? palette.mint : colors.mutedForeground}
          name="WhatsApp"
        />
      )}
    </Pressable>
  )
}

/** A self-reading round action for one Order surface. */
export function OrderWhatsAppButton({
  name,
  target,
  hasPhone,
}: {
  name: string
  target: OrderMessageTarget
  hasPhone: boolean
}) {
  const action = useOrderMessageAction({ target, hasPhone })
  return (
    <WhatsAppRoundButton
      name={name}
      state={action.state}
      onOpen={action.open}
      onRetry={action.retry}
    />
  )
}

/**
 * After a committed change: offer to tell the customer. It never opens
 * WhatsApp by itself, and offline or phone-less Orders show nothing.
 */
export function WhatsAppFollowUp({
  done,
  target,
  hasPhone,
  onDismiss,
}: {
  done: string
  target: OrderMessageTarget
  hasPhone: boolean
  onDismiss?: () => void
}) {
  const action = useOrderMessageAction({ target, hasPhone })
  if (action.state.kind === "hidden") return null
  const ready = action.state.kind === "ready"
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-card px-3.5 py-3 shadow-sm">
      <Text className="min-w-0 flex-1 text-[14px] text-foreground">
        {done} Let the customer know?
      </Text>
      <Pressable
        accessibilityLabel={`WhatsApp: ${whatsAppActionHint(action.state)}`}
        accessibilityRole="button"
        className={cn(
          "min-h-11 flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-80",
          ready ? "bg-tint-mint" : "bg-muted",
        )}
        disabled={action.state.kind === "loading"}
        haptic
        onPress={action.state.kind === "error" ? action.retry : action.open}
      >
        <Icon
          className={cn(
            "size-[17px]",
            ready ? "text-tint-mint-foreground" : "text-muted-foreground",
          )}
          name="WhatsApp"
        />
        <Text
          className={cn(
            "text-[14px] font-bold",
            ready ? "text-tint-mint-foreground" : "text-muted-foreground",
          )}
        >
          WhatsApp
        </Text>
      </Pressable>
      {onDismiss ? (
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full active:opacity-80"
          haptic
          onPress={onDismiss}
        >
          <Icon className="size-[16px] text-muted-foreground" name="X" />
        </Pressable>
      ) : null}
    </View>
  )
}
