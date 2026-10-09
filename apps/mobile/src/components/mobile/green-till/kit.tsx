// Green Till shared building blocks (DESIGN-SYSTEM.md component map).
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  GREEN_TILL_THEME,
  type GreenTillTint,
  tintChip,
} from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { Children, Fragment, type ReactNode } from "react"
import { Text as NativeText, ScrollView } from "react-native"

function useTint(tint: GreenTillTint) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return { bg: palette[tint], fg: palette[`${tint}Foreground`] }
}

/* ---------- SectionHeader ---------- */

export function SectionHeader({
  actionLabel,
  onAction,
  title,
  trailing,
}: {
  actionLabel?: string
  onAction?: () => void
  title: string
  trailing?: ReactNode
}) {
  return (
    <View className="mb-2.5 mt-[22px] flex-row items-end justify-between gap-3">
      <Text
        accessibilityRole="header"
        className="min-w-0 flex-1 text-base font-extrabold tracking-tight text-foreground"
      >
        {title}
      </Text>
      {trailing}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-9 justify-end"
          haptic
          hitSlop={8}
          onPress={onAction}
        >
          <Text className="text-[13px] font-bold text-primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/* ---------- QuickActionRow ---------- */

export type QuickActionItem = {
  disabled?: boolean
  gold?: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  testID?: string
}

/** Four 54pt tiles; the first can be gold (create/sell). */
export function QuickActionRow({ actions }: { actions: QuickActionItem[] }) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      className={cn(
        "mb-1 mt-[18px]",
        largeText ? "flex-row flex-wrap gap-y-3" : "flex-row gap-1.5",
      )}
    >
      {actions.map((action) => (
        <Pressable
          accessibilityLabel={action.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled }}
          className={cn(
            "items-center gap-[7px] active:opacity-80",
            largeText ? "w-1/2" : "flex-1",
            action.disabled && "opacity-50",
          )}
          disabled={action.disabled}
          haptic
          key={action.label}
          onPress={action.onPress}
          testID={action.testID}
        >
          <View
            className={cn(
              "size-[54px] items-center justify-center rounded-[18px]",
              action.gold ? "bg-gold" : "bg-card shadow-sm",
            )}
          >
            <Icon
              className={cn("size-[22px]", !action.gold && "text-primary")}
              color={action.gold ? palette.goldForeground : undefined}
              name={action.icon}
            />
          </View>
          <Text className="text-center text-[11.5px] font-bold [-rn-line-height:15] text-foreground">
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/* ---------- AttentionRail ---------- */

export type AttentionItem = {
  icon: IconKeys
  key: string
  onPress?: () => void
  sub: string
  tint: GreenTillTint
  title: string
}

/** Horizontal tinted cards for what needs attention. Renders nothing when empty. */
export function AttentionRail({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null
  return (
    <ScrollView
      contentContainerStyle={{
        gap: 10,
        paddingBottom: 6,
        paddingHorizontal: 18,
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -18 }}
    >
      {items.map((item) => (
        <AttentionCard item={item} key={item.key} />
      ))}
    </ScrollView>
  )
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const tint = useTint(item.tint)
  return (
    <Pressable
      accessibilityLabel={`${item.title}. ${item.sub}`}
      accessibilityRole={item.onPress ? "button" : undefined}
      disabled={!item.onPress}
      haptic
      onPress={item.onPress}
      style={{
        backgroundColor: tint.bg,
        borderRadius: 18,
        gap: 12,
        padding: 12,
        width: 152,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: tintChip(tint.fg),
          borderRadius: 10,
          height: 32,
          justifyContent: "center",
          width: 32,
        }}
      >
        <Icon className="size-[18px]" color={tint.fg} name={item.icon} />
      </View>
      <View>
        <NativeText
          style={{
            color: tint.fg,
            fontSize: 14,
            fontWeight: "700",
            lineHeight: 18,
          }}
        >
          {item.title}
        </NativeText>
        <NativeText
          style={{
            color: tint.fg,
            fontSize: 12,
            lineHeight: 17,
            opacity: 0.85,
          }}
        >
          {item.sub}
        </NativeText>
      </View>
    </Pressable>
  )
}

/* ---------- ListCard + RecordRow ---------- */

/** A white card of rows with hairline dividers between them. */
export function ListCard({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <View className="rounded-[20px] bg-card px-3.5 py-0.5 shadow-sm">
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows keep their order
        <Fragment key={index}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

export function RecordRow({
  accessibilityLabel,
  amount,
  avatar,
  meta,
  onPress,
  status,
  testID,
  title,
}: {
  accessibilityLabel?: string
  amount?: string
  avatar: { icon?: IconKeys; initials?: string; tint: GreenTillTint }
  meta?: string
  onPress?: () => void
  status?: ReactNode
  testID?: string
  title: string
}) {
  const tint = useTint(avatar.tint)
  const largeText = useLargeTextLayout()
  const lines = largeText ? undefined : 1
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? "button" : undefined}
      className="min-h-[62px] flex-row items-center gap-3 py-3 active:opacity-70"
      disabled={!onPress}
      haptic
      onPress={onPress}
      testID={testID}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: tint.bg,
          borderRadius: 19,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        {avatar.icon ? (
          <Icon className="size-[18px]" color={tint.fg} name={avatar.icon} />
        ) : (
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{ color: tint.fg, fontSize: 13, fontWeight: "800" }}
          >
            {avatar.initials}
          </NativeText>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text
          className="text-sm font-bold [-rn-line-height:19] text-foreground"
          numberOfLines={lines}
        >
          {title}
        </Text>
        {meta ? (
          <Text
            className="text-xs [-rn-line-height:17] text-muted-foreground"
            numberOfLines={lines}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      {amount || status ? (
        <View className="items-end">
          {amount ? (
            <Text className="text-sm font-bold tabular-nums text-foreground">
              {amount}
            </Text>
          ) : null}
          {status}
        </View>
      ) : null}
    </Pressable>
  )
}

/* ---------- StatusPill ---------- */

export type StatusPillTone = "danger" | "info" | "muted" | "ok" | "warn"

const PILL_TINT: Record<Exclude<StatusPillTone, "muted">, GreenTillTint> = {
  danger: "rose",
  info: "sky",
  ok: "mint",
  warn: "amber",
}

export function StatusPill({
  icon,
  label,
  tone,
}: {
  icon?: IconKeys
  label: string
  tone: StatusPillTone
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const tint = tone === "muted" ? null : PILL_TINT[tone]
  const fg = tint ? palette[`${tint}Foreground`] : undefined
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: tint ? palette[tint] : colors.muted,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        // A fixed height with centred content keeps short labels optically
        // centred on Android, where font padding pushes text up.
        height: 20,
        justifyContent: "center",
        marginTop: 3,
        paddingHorizontal: 8,
      }}
    >
      {icon ? (
        <Icon
          className={cn("size-[11px]", !fg && "text-muted-foreground")}
          color={fg}
          name={icon}
        />
      ) : null}
      {/* 700, not 800: Roboto mis-measures short heavy labels. */}
      {fg ? (
        <NativeText
          maxFontSizeMultiplier={1.4}
          style={{
            color: fg,
            fontSize: 10.5,
            fontWeight: "700",
            includeFontPadding: false,
            lineHeight: 13,
            textAlignVertical: "center",
          }}
        >
          {label}
        </NativeText>
      ) : (
        <Text className="text-[10.5px] font-bold [-rn-line-height:13] [-rn-include-font-padding:false] [-rn-text-align-vertical:center] text-muted-foreground">
          {label}
        </Text>
      )}
    </View>
  )
}

/* ---------- SetupSteps ---------- */

export type SetupStep = {
  key: string
  onPress?: () => void
  /** Optional icon instead of the step number (e.g. an optional task). */
  icon?: IconKeys
  state: "done" | "locked" | "now" | "todo"
  sub: string
  title: string
}

export function SetupSteps({ steps }: { steps: SetupStep[] }) {
  return (
    <View className="mt-3.5 rounded-[20px] bg-card px-3.5 py-1 shadow-sm">
      {steps.map((step, index) => (
        <Fragment key={step.key}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          <Pressable
            accessibilityRole={step.onPress ? "button" : undefined}
            accessibilityState={{ disabled: step.state === "locked" }}
            className={cn(
              "min-h-[58px] flex-row items-center gap-3 py-3.5",
              step.state === "locked" && "opacity-60",
            )}
            disabled={!step.onPress}
            haptic
            onPress={step.onPress}
          >
            <View
              className={cn(
                "size-[30px] items-center justify-center rounded-full border-[1.5px]",
                step.state === "now" && "border-primary bg-primary",
                step.state === "done" && "border-transparent bg-tint-mint",
                (step.state === "locked" || step.state === "todo") &&
                  "border-border",
              )}
            >
              {step.state === "done" ? (
                <Icon
                  className="size-[15px] text-tint-mint-foreground"
                  name="Check"
                />
              ) : step.state === "locked" ? (
                <Icon
                  className="size-[14px] text-muted-foreground"
                  name="Lock"
                />
              ) : step.icon ? (
                <Icon
                  className="size-[15px] text-muted-foreground"
                  name={step.icon}
                />
              ) : (
                <Text
                  className={cn(
                    "text-[13px] font-extrabold",
                    step.state === "now"
                      ? "text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className={cn(
                  "text-sm font-bold [-rn-line-height:19]",
                  step.state === "done"
                    ? "text-muted-foreground line-through"
                    : "text-foreground",
                )}
              >
                {step.title}
              </Text>
              <Text className="text-xs [-rn-line-height:17] text-muted-foreground">
                {step.sub}
              </Text>
            </View>
            {step.onPress ? (
              <Icon
                className="size-[18px] text-muted-foreground"
                name="ChevronRight"
              />
            ) : null}
          </Pressable>
        </Fragment>
      ))}
    </View>
  )
}

/* ---------- GhostPreview ---------- */

/** A dashed preview of a surface that fills in later (empty states). */
export function GhostPreview({
  bars = [30, 45, 25, 60, 50, 70, 40],
  icon = "Sparkles",
  message,
  variant = "chart",
}: {
  bars?: number[]
  icon?: IconKeys
  message: string
  variant?: "chart" | "rows"
}) {
  const colors = useColors()
  return (
    <View
      accessible
      accessibilityLabel={message}
      className="mt-3.5 rounded-[20px] border-[1.5px] border-dashed border-border px-4 py-3.5"
    >
      <View className="flex-row items-center gap-1.5">
        <Icon className="size-[14px] text-muted-foreground" name={icon} />
        <Text className="flex-1 text-xs text-muted-foreground">{message}</Text>
      </View>
      {variant === "rows" ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="mt-2.5 gap-3"
        >
          {["one", "two", "three"].map((key) => (
            <View
              key={key}
              className="flex-row items-center gap-3 border-b border-dashed border-border py-3"
            >
              <View className="size-[42px] rounded-[14px] bg-border" />
              <View className="flex-1 gap-2">
                <View className="h-2.5 w-3/4 rounded bg-border" />
                <View className="h-2 w-1/2 rounded bg-border" />
              </View>
              <View className="h-2.5 w-12 rounded bg-border" />
            </View>
          ))}
        </View>
      ) : (
        <View className="mt-2.5 h-[46px] flex-row items-end gap-1.5">
          {bars.map((height, index) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: decorative bars
              key={index}
              style={{
                backgroundColor: colors.border,
                borderRadius: 4,
                flex: 1,
                height: `${height}%`,
                opacity: 0.7,
              }}
            />
          ))}
        </View>
      )}
    </View>
  )
}

/* ---------- NudgeCard ---------- */

export function NudgeCard({
  actionLabel,
  icon,
  onAction,
  sub,
  testID,
  tint,
  title,
}: {
  actionLabel?: string
  icon: IconKeys
  onAction?: () => void
  sub: string
  testID?: string
  tint: GreenTillTint
  title: string
}) {
  const colors = useTint(tint)
  return (
    <View
      className="mt-3.5 flex-row items-center gap-3 rounded-[18px] bg-card p-3.5 shadow-sm"
      testID={testID}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.bg,
          borderRadius: 12,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Icon className="size-[20px]" color={colors.fg} name={icon} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold [-rn-line-height:19] text-foreground">
          {title}
        </Text>
        <Text className="text-xs [-rn-line-height:17] text-muted-foreground">
          {sub}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center pl-1"
          haptic
          hitSlop={6}
          onPress={onAction}
        >
          <Text className="text-[13px] font-extrabold text-primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/* ---------- ToggleRow ---------- */

export function ToggleRow({
  disabled,
  onValueChange,
  sub,
  title,
  value,
}: {
  disabled?: boolean
  onValueChange: (value: boolean) => void
  sub?: string
  title: string
  value: boolean
}) {
  return (
    <View className="min-h-[56px] flex-row items-center gap-3 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold [-rn-line-height:19] text-foreground">
          {title}
        </Text>
        {sub ? (
          <Text className="text-xs [-rn-line-height:17] text-muted-foreground">
            {sub}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        checked={value}
        disabled={disabled}
        onCheckedChange={onValueChange}
      />
    </View>
  )
}
