import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useRouter } from "expo-router"
import { Children, type ReactNode, useState } from "react"
import {
  ActivityIndicator,
  LayoutAnimation,
  Text as NativeText,
  TextInput,
  useWindowDimensions,
} from "react-native"
import { useKeyboardState } from "react-native-keyboard-controller"
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
            className="text-lg font-bold [-rn-line-height:26] text-foreground"
          >
            {title}
          </Text>
          {/* One line: a wrapped line here was measured one line tall and
              clipped at large text. */}
          <Text
            className="text-base [-rn-line-height:22] text-muted-foreground"
            numberOfLines={1}
          >
            {business}
          </Text>
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
            <Text className="text-base [-rn-line-height:22] font-bold text-primary">
              {action}
            </Text>
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

/**
 * One chat turn (Workshop A2d v2.2, Open reply): the owner's words in a muted
 * bubble on the right; the assistant's reply as open text across the thread,
 * with any cards under it.
 */
export function AssistantBubble({
  text,
  user = false,
  streaming = false,
  children,
}: {
  text: string
  user?: boolean
  /** The reply is still arriving: loose Markdown at its end stays hidden. */
  streaming?: boolean
  children?: ReactNode
}) {
  if (user)
    return (
      <View className="items-end gap-2">
        <View className="max-w-[82%] rounded-[18px] rounded-br-[6px] border border-border bg-muted px-3.5 py-2.5">
          <AssistantText text={text} user />
        </View>
        {children}
      </View>
    )
  return (
    <View className="min-w-0 gap-3">
      {text ? (
        <AssistantText text={text} user={false} streaming={streaming} />
      ) : null}
      {children}
    </View>
  )
}

export type AssistantComposerVoice = {
  recording: boolean
  /** Uploading or writing out the recording. */
  working: boolean
  elapsedLabel: string
  /** Microphone levels since the start (0–1, newest last) for the waveform. */
  levels?: number[]
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
 * One rounded pill: + (attach) · text · mic · send. Focused or holding text
 * or files it opens into a card — files, then text, then the buttons — and
 * while recording it holds × · waveform · stop · send. The text field keeps
 * its place so focus survives.
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
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  const colors = useColors()
  const reduceMotion = useReducedMotion()
  // One line of scaled text plus padding, so 200% text isn't clipped.
  const { fontScale } = useWindowDimensions()
  const lineHeight = Math.ceil(22 * fontScale)
  const [focused, setFocused] = useState(false)
  // Idle, the box is one pill row. Focused, or holding text, files or the
  // attach menu, it opens into a card: the text on top, its buttons below.
  const stacked =
    !voice?.recording &&
    // Android's Back hides the keyboard without blurring the field.
    ((focused && keyboardVisible) ||
      !!value ||
      Children.toArray(children).length > 0)
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
        backgroundColor: busy ? colors.foreground : colors.primary,
        borderRadius: 999,
        height: 40,
        justifyContent: "center",
        opacity: !busy && sendDisabled ? 0.4 : 1,
        width: 40,
      }}
    >
      <Icon
        name={busy ? "Square" : "ArrowUp"}
        className="size-[19px]"
        color={busy ? colors.background : colors.primaryForeground}
      />
    </Pressable>
  )
  return (
    <View className="gap-2 bg-background px-3 pt-1.5">
      {reason ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-base [-rn-line-height:22] text-muted-foreground"
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
          <Text className="text-base [-rn-line-height:22] text-destructive">
            {voice.error}
          </Text>
        </Pressable>
      ) : voice?.status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-base [-rn-line-height:22] text-muted-foreground"
        >
          {voice.status}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: stacked ? 24 : 28,
          borderWidth: 1,
          gap: 6,
          padding: stacked ? 6 : 5,
        }}
      >
        {children}
        {voice?.recording ? (
          <View className="min-h-[40px] flex-row items-center gap-2">
            <ComposerIcon
              icon="X"
              label="Cancel recording"
              disabled={false}
              onPress={voice.cancel}
            />
            <VoiceWave
              levels={voice.levels ?? []}
              label={`Recording ${voice.elapsedLabel}`}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Stop at ${voice.elapsedLabel} and put the words in the box`}
              haptic
              hitSlop={2}
              onPress={voice.stop}
              style={{
                alignItems: "center",
                backgroundColor: colors.muted,
                borderRadius: 999,
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.foreground,
                  borderRadius: 3,
                  height: 13,
                  width: 13,
                }}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop and send"
              haptic
              onPress={voice.stopAndSend}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 999,
                height: 40,
                justifyContent: "center",
                width: 40,
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
                  if (!!next !== !!value) easeStack(reduceMotion)
                  onChange(next)
                }}
                onFocus={() => {
                  easeStack(reduceMotion)
                  setFocused(true)
                }}
                onBlur={() => {
                  easeStack(reduceMotion)
                  setFocused(false)
                }}
                selectionColor={colors.primary}
                style={{
                  color: colors.foreground,
                  fontSize: 16,
                  lineHeight: 22,
                  maxHeight: 160,
                  minHeight: Math.max(stacked ? 44 : 40, lineHeight + 18),
                  paddingHorizontal: stacked ? 10 : 6,
                  paddingBottom: stacked ? 6 : 9,
                  paddingTop: stacked ? 10 : 9,
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
                    fontSize: 16,
                    lineHeight: 22,
                    left: stacked ? 10 : 6,
                    position: "absolute",
                    right: stacked ? 10 : 6,
                    top: stacked ? 10 : 9,
                  }}
                >
                  {placeholder}
                </NativeText>
              )}
            </View>
            {stacked ? (
              <View className="flex-row items-center gap-1.5">
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
      {/* The keyboard already covers the system bar, so the safe-area gap
          only applies while it is closed. */}
      <View
        style={{ height: keyboardVisible ? 8 : Math.max(insets.bottom, 8) }}
      />
    </View>
  )
}

/**
 * The recording's live level: rounded bars filling from the left after a
 * small start mark, driven by the microphone meter.
 */
function VoiceWave({ levels, label }: { levels: number[]; label: string }) {
  const colors = useColors()
  return (
    <View
      accessible
      accessibilityLabel={label}
      className="h-8 min-w-0 flex-1 flex-row items-center gap-[3px] overflow-hidden px-1"
    >
      <View
        style={{
          backgroundColor: colors.mutedForeground,
          borderRadius: 1,
          height: 2,
          marginRight: 2,
          width: 6,
        }}
      />
      <View
        style={{
          backgroundColor: colors.mutedForeground,
          borderRadius: 2,
          height: 4,
          marginRight: 2,
          width: 4,
        }}
      />
      {levels.map((level, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: bars keep their order
          key={index}
          style={{
            backgroundColor: colors.foreground,
            borderRadius: 2,
            height: 4 + Math.round(level * 24),
            width: 3,
          }}
        />
      ))}
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
      hitSlop={2}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.muted,
        borderRadius: 999,
        height: 40,
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
        width: 40,
      }}
    >
      <Icon className="size-[21px]" color={colors.foreground} name={icon} />
    </Pressable>
  )
}

export function AssistantThinking() {
  return (
    // Replies sit open at the thread's edge, so this lines up with them.
    <View className="flex-row items-center gap-2">
      <ActivityIndicator />
      <Text className="text-base [-rn-line-height:22] text-muted-foreground">
        Thinking…
      </Text>
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
        <Text className="text-base [-rn-line-height:22] font-extrabold text-muted-foreground">
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
