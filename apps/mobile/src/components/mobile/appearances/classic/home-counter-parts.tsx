import { ActionButton } from "@/components/mobile/action-button"
import type { DashboardHeroProps } from "@/components/mobile/dashboard/dashboard-presentation"
import type { HomeMetric } from "@/components/mobile/dashboard/home-journey-presentation"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { MOBILE_ACCOUNT_AVATAR_TOKENS } from "@/lib/design-foundation"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import { Text as NativeText } from "react-native"

/** Green Till Home header: avatar, greeting over the business switcher, tools. */
export function ClassicCounterHeader(props: DashboardHeroProps) {
  const largeText = useLargeTextLayout()
  const initial =
    Array.from(
      (Array.from(props.greetingName.trim())[0] ?? "?").toUpperCase(),
    )[0] ?? "?"
  const avatarColor =
    MOBILE_ACCOUNT_AVATAR_TOKENS.backgrounds[
      Math.abs((initial.codePointAt(0) ?? 65) - 65) %
        MOBILE_ACCOUNT_AVATAR_TOKENS.backgrounds.length
    ]
  const tools = (
    <View className="flex-row gap-2">
      {props.hideSearch ? null : (
        <Pressable
          accessibilityLabel={
            props.onSearchPress
              ? "Open global search"
              : "Search unavailable offline"
          }
          accessibilityRole="button"
          disabled={!props.onSearchPress}
          className={cn(
            "size-[38px] items-center justify-center rounded-full bg-card shadow-sm active:bg-accent",
            !props.onSearchPress && "opacity-50",
          )}
          haptic={!!props.onSearchPress}
          hitSlop={4}
          onPress={props.onSearchPress}
        >
          <Icon className="size-[19px] text-foreground" name="Search" />
        </Pressable>
      )}
      <Pressable
        accessibilityLabel={
          props.hasNotification
            ? "Open sync status, items need attention"
            : "Open sync status"
        }
        accessibilityRole="button"
        className="relative size-[38px] items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
        haptic
        hitSlop={4}
        onPress={props.onNotificationPress}
      >
        <Icon className="size-[19px] text-foreground" name="RefreshCw" />
        {props.hasNotification ? (
          <View className="absolute right-[8px] top-[7px] size-2 rounded-full border-2 border-card bg-gold" />
        ) : null}
      </Pressable>
    </View>
  )
  return (
    <View className="mb-1 mt-1.5 gap-3">
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityLabel={`${props.greetingName} account and business settings`}
          accessibilityRole="button"
          disabled={!props.onProfilePress}
          style={{
            alignItems: "center",
            backgroundColor: avatarColor,
            borderRadius: 20,
            flexShrink: 0,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
          haptic={!!props.onProfilePress}
          hitSlop={4}
          onPress={props.onProfilePress}
        >
          <NativeText
            style={{
              color: MOBILE_ACCOUNT_AVATAR_TOKENS.foreground,
              fontSize: 16,
              fontWeight: "800",
            }}
            maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
          >
            {initial}
          </NativeText>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold text-muted-foreground">
            {homeGreeting(new Date().getHours())}, {props.greetingName}
          </Text>
          <Pressable
            accessibilityLabel={`Switch Business, ${props.businessName}`}
            accessibilityRole="button"
            className="min-h-7 flex-row items-center gap-1 active:opacity-70"
            haptic
            hitSlop={6}
            onPress={props.onBusinessPress}
          >
            <Text
              className="min-w-0 shrink text-[17px] font-extrabold tracking-tight text-foreground"
              numberOfLines={largeText ? undefined : 1}
            >
              {props.businessName}
            </Text>
            {props.roleLabel ? (
              <Text className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                · {props.roleLabel}
              </Text>
            ) : (
              <Icon
                className="size-[15px] text-muted-foreground"
                name="ChevronDown"
              />
            )}
          </Pressable>
        </View>
        {largeText ? null : tools}
      </View>
      {largeText ? <View className="self-end">{tools}</View> : null}
    </View>
  )
}

export function homeGreeting(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export function CounterHeading({
  title,
  message,
}: { title: string; message: string }) {
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="text-2xl font-bold tracking-tight text-foreground"
      >
        {title}
      </Text>
      <Text className="text-sm text-muted-foreground">{message}</Text>
    </View>
  )
}

export function CounterTask({
  title,
  message,
  label,
  icon,
  disabled,
  onPress,
}: {
  title: string
  message?: string
  label: string
  icon: IconKeys
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <View className="gap-4 rounded-2xl border border-border bg-card p-5">
      <View className="size-11 items-center justify-center rounded-xl bg-accent">
        <Icon className="size-base text-primary" name={icon} />
      </View>
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="text-xl font-bold text-foreground"
        >
          {title}
        </Text>
        {message ? (
          <Text className="text-sm text-muted-foreground">{message}</Text>
        ) : null}
      </View>
      <ActionButton
        accessibilityLabel={label}
        disabled={disabled}
        icon="Plus"
        onPress={onPress}
      >
        {label}
      </ActionButton>
    </View>
  )
}

export function CounterRow({
  label,
  detail,
  icon,
  disabled,
  onPress,
}: {
  label: string
  detail?: string
  icon: IconKeys
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      className={cn(
        "min-h-16 flex-row items-center gap-3 border-b border-border py-3 active:bg-accent",
        disabled && "opacity-50",
      )}
      disabled={disabled}
      haptic={!disabled}
      onPress={onPress}
    >
      <View className="size-10 items-center justify-center rounded-xl bg-accent">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold text-foreground">{label}</Text>
        {detail ? (
          <Text className="text-xs text-muted-foreground">{detail}</Text>
        ) : null}
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

function CounterFact({ metric, icon }: { metric: HomeMetric; icon: IconKeys }) {
  return (
    <View className="min-w-0 flex-1 gap-3 rounded-xl bg-card p-4">
      <View className="flex-row items-start gap-2">
        <Icon className="size-sm text-primary" name={icon} />
        <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
          {metric.label}
        </Text>
      </View>
      <Text className="text-2xl font-bold text-foreground">{metric.value}</Text>
      {metric.detail ? (
        <Text className="text-xs text-muted-foreground">{metric.detail}</Text>
      ) : null}
    </View>
  )
}

export function CounterFacts({
  primary,
  orders,
  revenue,
}: { primary: HomeMetric; orders: HomeMetric; revenue: HomeMetric }) {
  const largeText = useLargeTextLayout()
  return (
    <View className="gap-3">
      <View className={largeText ? "gap-3" : "flex-row gap-3"}>
        <CounterFact
          metric={primary}
          icon={primary.label === "Active work" ? "Wrench" : "Warehouse"}
        />
        <CounterFact metric={orders} icon="ReceiptText" />
      </View>
      <View className="gap-2 rounded-xl bg-accent p-4">
        <View
          className={
            largeText ? "gap-2" : "flex-row items-center justify-between gap-3"
          }
        >
          <Text className="text-xs text-muted-foreground">{revenue.label}</Text>
          <Text
            className={cn(
              "min-w-0 text-xl font-bold text-primary",
              !largeText && "shrink text-right",
            )}
          >
            {revenue.value}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">{revenue.detail}</Text>
      </View>
    </View>
  )
}
