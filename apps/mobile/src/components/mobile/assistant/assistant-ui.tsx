import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useRouter } from "expo-router"
import type { ReactNode } from "react"
import { ActivityIndicator, TextInput } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AssistantText } from "./assistant-text"

export function AssistantHeader({
  title,
  business,
  action,
  onAction,
  disabled,
  icons,
}: {
  title: string
  business?: string
  action?: string
  onAction?: () => void
  disabled?: boolean
  /** Icon buttons on the right, in place of a text action. */
  icons?: { icon: IconKeys; label: string; onPress: () => void }[]
}) {
  const router = useRouter()
  const large = useLargeTextLayout()
  return (
    <View className="border-b border-border bg-background px-[18px] pb-3 pt-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close assistant"
          className="size-[44px] items-center justify-center rounded-full"
          onPress={() => router.back()}
        >
          <Icon name="X" className="size-[20px] text-foreground" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text
            accessibilityRole="header"
            className="text-base font-bold text-foreground"
          >
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground">{business}</Text>
        </View>
        {icons?.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled }}
            className="size-[44px] items-center justify-center rounded-full"
            disabled={disabled}
            onPress={item.onPress}
          >
            <Icon
              name={item.icon}
              className={
                disabled
                  ? "size-[20px] text-muted-foreground"
                  : "size-[20px] text-foreground"
              }
            />
          </Pressable>
        ))}
        {!large && action ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onAction}
            className="min-h-[44px] justify-center"
          >
            <Text className="text-xs font-bold text-primary">{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {large && action ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onAction}
          className="min-h-[44px] self-end justify-center"
        >
          <Text className="text-sm font-bold text-primary">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function AssistantBubble({
  text,
  user = false,
  children,
}: { text: string; user?: boolean; children?: ReactNode }) {
  return (
    <View className={user ? "items-end" : "flex-row items-start gap-2"}>
      {!user ? (
        <View className="mt-1 size-[28px] items-center justify-center rounded-full bg-gold">
          <Icon name="Sparkles" className="size-[16px] text-gold-foreground" />
        </View>
      ) : null}
      <View
        className={user ? "max-w-[82%] gap-2" : "min-w-0 max-w-[88%] gap-2"}
      >
        <View
          className={
            user
              ? "rounded-[18px] rounded-br-[6px] bg-primary px-3 py-2.5"
              : "rounded-[18px] rounded-tl-[6px] bg-card px-3 py-2.5 shadow-sm"
          }
        >
          <AssistantText text={text} user={user} />
        </View>
        {children}
      </View>
    </View>
  )
}

export function AssistantComposer({
  value,
  placeholder = "Tell me about your business…",
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  reason,
  children,
  inputRef,
}: {
  inputRef?: { current: TextInput | null }
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  busy: boolean
  disabled: boolean
  reason?: string
  children?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  return (
    <View className="gap-2 border-t border-border bg-background px-3 pt-2">
      {children}
      {reason ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {reason}
        </Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        <TextInput
          ref={inputRef}
          accessibilityLabel="Message the assistant"
          className="min-h-[46px] max-h-[160px] flex-1 rounded-[23px] bg-card px-4 py-3 text-sm text-foreground"
          editable={!disabled && !busy}
          maxLength={8000}
          multiline
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onChange}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? "Stop reply" : "Send message"}
          accessibilityState={{
            disabled: !busy && (disabled || !value.trim()),
          }}
          disabled={!busy && (disabled || !value.trim())}
          className="size-[46px] items-center justify-center rounded-full bg-primary disabled:bg-muted"
          onPress={busy ? onStop : onSend}
        >
          <Icon
            name={busy ? "Square" : "ArrowUp"}
            className={
              !busy && (disabled || !value.trim())
                ? "size-[21px] text-muted-foreground"
                : "size-[21px] text-primary-foreground"
            }
          />
        </Pressable>
      </View>
      <View style={{ height: Math.max(insets.bottom, 10) }} />
    </View>
  )
}

export function AssistantThinking() {
  return (
    <View className="flex-row items-center gap-2 pl-9">
      <ActivityIndicator />
      <Text className="text-xs text-muted-foreground">Thinking…</Text>
    </View>
  )
}

/** "Today", "Yesterday" or "Mon 6 Oct", for the thread's day markers. */
export function assistantDay(date: Date | undefined, now = new Date()) {
  const day = date ?? now
  const days = Math.round(
    (new Date(now.toDateString()).getTime() -
      new Date(day.toDateString()).getTime()) /
      86_400_000,
  )
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return day.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

/** Day marker above the first message of each day; new replies count as today. */
export function AssistantDayMarker({
  times,
  ids,
  index,
}: {
  times: Map<string, Date | undefined>
  ids: string[]
  index: number
}) {
  const day = assistantDay(times.get(ids[index] ?? ""))
  if (index > 0 && assistantDay(times.get(ids[index - 1] ?? "")) === day)
    return null
  return (
    <View className="mb-1 items-center">
      <View className="rounded-full bg-muted px-2.5 py-0.5">
        <Text className="text-[11px] font-extrabold text-muted-foreground">
          {day}
        </Text>
      </View>
    </View>
  )
}
