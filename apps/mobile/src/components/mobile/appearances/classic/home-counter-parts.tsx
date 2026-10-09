import { ActionButton } from "@/components/mobile/action-button"
import type { DashboardHeroProps } from "@/components/mobile/dashboard/dashboard-presentation"
import { HOME_METRIC_LOADING } from "@/components/mobile/dashboard/home-journey-metrics"
import type { HomeMetric } from "@/components/mobile/dashboard/home-journey-presentation"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { MOBILE_ACCOUNT_AVATAR_TOKENS } from "@/lib/design-foundation"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import { Text as NativeText } from "react-native"

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
      <Pressable
        accessibilityLabel={
          props.hasNotification
            ? "Open sync status, items need attention"
            : "Open sync status"
        }
        accessibilityRole="button"
        className="relative size-12 items-center justify-center rounded-full bg-card active:bg-accent"
        haptic
        onPress={props.onNotificationPress}
      >
        <Icon className="size-base text-foreground" name="RefreshCw" />
        {props.hasNotification ? (
          <View className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={
          props.onSearchPress
            ? "Open global search"
            : "Search unavailable offline"
        }
        accessibilityRole="button"
        disabled={!props.onSearchPress}
        className={cn(
          "size-12 items-center justify-center rounded-full bg-card active:bg-accent",
          !props.onSearchPress && "opacity-50",
        )}
        haptic={!!props.onSearchPress}
        onPress={props.onSearchPress}
      >
        <Icon className="size-base text-foreground" name="Search" />
      </Pressable>
    </View>
  )
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityLabel={`${props.greetingName} account and business settings`}
          accessibilityRole="button"
          disabled={!props.onProfilePress}
          style={{
            alignItems: "center",
            backgroundColor: avatarColor,
            borderRadius: 24,
            flexShrink: 0,
            height: 48,
            justifyContent: "center",
            width: 48,
          }}
          haptic={!!props.onProfilePress}
          onPress={props.onProfilePress}
        >
          <NativeText
            style={{
              color: MOBILE_ACCOUNT_AVATAR_TOKENS.foreground,
              fontSize: 16,
              fontWeight: "700",
            }}
            maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
          >
            {initial}
          </NativeText>
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-foreground">
            Hello, {props.greetingName}
          </Text>
          <Pressable
            accessibilityLabel={`Switch Business, ${props.businessName}`}
            accessibilityRole="button"
            className="min-h-12 flex-row items-center gap-1 active:opacity-70"
            haptic
            onPress={props.onBusinessPress}
          >
            <Text className="min-w-0 shrink text-sm text-muted-foreground">
              {props.businessName}
            </Text>
            <Icon
              className="size-xs text-muted-foreground"
              name="ChevronDown"
            />
          </Pressable>
        </View>
        {largeText ? null : tools}
      </View>
      {largeText ? <View className="self-end">{tools}</View> : null}
    </View>
  )
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
      {metric.value === HOME_METRIC_LOADING ? (
        <SkeletonGroup accessibilityLabel={`Loading ${metric.label}`}>
          <Skeleton height={28} width="45%" />
        </SkeletonGroup>
      ) : (
        <Text className="text-2xl font-bold text-foreground">
          {metric.value}
        </Text>
      )}
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
          {revenue.value === HOME_METRIC_LOADING ? (
            <SkeletonGroup accessibilityLabel={`Loading ${revenue.label}`}>
              <Skeleton height={24} width={110} />
            </SkeletonGroup>
          ) : (
            <Text
              className={cn(
                "min-w-0 text-xl font-bold text-primary",
                !largeText && "shrink text-right",
              )}
            >
              {revenue.value}
            </Text>
          )}
        </View>
        <Text className="text-xs text-muted-foreground">{revenue.detail}</Text>
      </View>
    </View>
  )
}
