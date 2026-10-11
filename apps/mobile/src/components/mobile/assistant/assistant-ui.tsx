import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useRouter } from "expo-router"
import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  LayoutAnimation,
  Text as NativeText,
  TextInput,
} from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AssistantText } from "./assistant-text"

// The composer eases between one row and stacked instead of jumping.
const stackMotion = {
  duration: 200,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
}

function easeStack(reduceMotion: boolean) {
  if (!reduceMotion) LayoutAnimation.configureNext(stackMotion)
}

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

export type AssistantComposerVoice = {
  recording: boolean
  /** Uploading or writing out the recording. */
  working: boolean
  elapsedLabel: string
  status: string | null
  error: string | null
  start: () => void
  /** Stop and write the words into the box to check before sending. */
  stop: () => void
  /** Stop, write the words out and send them. */
  stopAndSend: () => void
  cancel: () => void
  dismiss: () => void
}

/**
 * One rounded box: + (attach) · text · mic · send. It stacks — text on top,
 * buttons underneath — once the message wraps, and stays stacked until the
 * box is cleared. The text field keeps its place so focus survives.
 */
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
  canSendEmpty = false,
  onAttach,
  attachOpen = false,
  voice,
}: {
  /** Files are ready, so an empty message may be sent. */
  canSendEmpty?: boolean
  inputRef?: { current: TextInput | null }
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  busy: boolean
  disabled: boolean
  reason?: string
  /** Shown inside the box, above the text (attachments, attach menu). */
  children?: ReactNode
  /** Shows the + button. */
  onAttach?: () => void
  attachOpen?: boolean
  /** Shows the mic. */
  voice?: AssistantComposerVoice
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const reduceMotion = useReducedMotion()
  const [wrapped, setWrapped] = useState(false)
  // The newest text. A paste reports its new height in the same batch as its
  // text, before `value` has caught up.
  const text = useRef(value)
  useEffect(() => {
    text.current = value
    if (value || !wrapped) return
    easeStack(reduceMotion)
    setWrapped(false)
  }, [value, wrapped, reduceMotion])
  const stacked = wrapped || value.includes("\n")
  const working = voice?.working === true
  const sendDisabled =
    !busy || !onStop
      ? disabled || working || (!value.trim() && !canSendEmpty)
      : false
  const plus = onAttach ? (
    <ComposerIcon
      icon={attachOpen ? "X" : "Plus"}
      label={attachOpen ? "Close attach menu" : "Attach a photo or file"}
      disabled={disabled || busy}
      onPress={onAttach}
    />
  ) : null
  const mic = voice ? (
    <ComposerIcon
      icon="Mic"
      label="Record a voice note"
      disabled={disabled || busy || working}
      onPress={voice.start}
    />
  ) : null
  const send = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? "Stop reply" : "Send message"}
      accessibilityState={{ disabled: !busy && sendDisabled }}
      disabled={!busy && sendDisabled}
      haptic
      onPress={busy ? onStop : onSend}
      style={{
        alignItems: "center",
        backgroundColor: !busy && sendDisabled ? colors.muted : colors.primary,
        borderRadius: 999,
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <Icon
        name={busy ? "Square" : "ArrowUp"}
        className="size-[19px]"
        color={
          !busy && sendDisabled
            ? colors.mutedForeground
            : colors.primaryForeground
        }
      />
    </Pressable>
  )
  return (
    <View className="gap-2 border-t border-border bg-background px-3 pt-2">
      {reason ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {reason}
        </Text>
      ) : null}
      {voice?.error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss voice note error"
          onPress={voice.dismiss}
        >
          <Text className="text-xs text-destructive">{voice.error}</Text>
        </Pressable>
      ) : voice?.status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {voice.status}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: 26,
          borderWidth: 1,
          gap: 6,
          paddingHorizontal: 6,
          paddingVertical: 6,
        }}
      >
        {children}
        {voice?.recording ? (
          <View className="min-h-[38px] flex-row items-center gap-2 px-1">
            <ComposerIcon
              icon="X"
              label="Cancel recording"
              disabled={false}
              onPress={voice.cancel}
            />
            <View className="size-2 rounded-full bg-destructive" />
            <Text className="flex-1 text-sm tabular-nums text-foreground">
              Recording {voice.elapsedLabel}
            </Text>
            <ComposerIcon
              icon="Square"
              label="Stop and put the words in the box"
              disabled={false}
              onPress={voice.stop}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop and send"
              haptic
              onPress={voice.stopAndSend}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 999,
                height: 38,
                justifyContent: "center",
                width: 38,
              }}
            >
              <Icon
                name="ArrowUp"
                className="size-[19px]"
                color={colors.primaryForeground}
              />
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              alignItems: stacked ? "stretch" : "center",
              flexDirection: stacked ? "column" : "row",
              gap: stacked ? 2 : 4,
            }}
          >
            {stacked ? null : plus}
            <View style={{ flex: stacked ? undefined : 1 }}>
              <TextInput
                ref={inputRef}
                accessibilityLabel="Message the assistant"
                editable={!disabled && !busy && !working}
                maxLength={8000}
                multiline
                accessibilityHint={value ? undefined : placeholder}
                value={value}
                onChangeText={(next) => {
                  text.current = next
                  if (!stacked && next.includes("\n")) easeStack(reduceMotion)
                  onChange(next)
                }}
                onContentSizeChange={(event) => {
                  // Taller than one line: stack (and stay stacked until cleared).
                  if (wrapped || !text.current) return
                  if (event.nativeEvent.contentSize.height <= 30) return
                  if (!stacked) easeStack(reduceMotion)
                  setWrapped(true)
                }}
                selectionColor={colors.primary}
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  maxHeight: 160,
                  minHeight: 38,
                  paddingHorizontal: stacked ? 10 : 6,
                  paddingVertical: 8,
                }}
              />
              {value ? null : (
                // The field's own placeholder wraps on a multiline input;
                // this one stays on one line and ends with "…".
                <NativeText
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  numberOfLines={1}
                  pointerEvents="none"
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 15,
                    left: stacked ? 10 : 6,
                    position: "absolute",
                    right: stacked ? 10 : 6,
                    top: 8,
                  }}
                >
                  {placeholder}
                </NativeText>
              )}
            </View>
            {stacked ? (
              <View className="flex-row items-center gap-1">
                {plus}
                <View className="flex-1" />
                {mic}
                {send}
              </View>
            ) : (
              <>
                {mic}
                {send}
              </>
            )}
          </View>
        )}
      </View>
      <View style={{ height: Math.max(insets.bottom, 10) }} />
    </View>
  )
}

function ComposerIcon({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconKeys
  label: string
  disabled: boolean
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic
      hitSlop={4}
      onPress={onPress}
      style={{
        alignItems: "center",
        borderRadius: 999,
        height: 38,
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
        width: 38,
      }}
    >
      <Icon className="size-[21px]" color={colors.foreground} name={icon} />
    </Pressable>
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

/** "as of 6:25 PM" today, else "as of 9 Oct, 6:25 PM". */
export function assistantAsOf(iso: string, now = new Date()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return date.toDateString() === now.toDateString()
    ? `as of ${time}`
    : `as of ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`
}
