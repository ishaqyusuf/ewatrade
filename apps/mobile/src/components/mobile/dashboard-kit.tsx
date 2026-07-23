import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReactNode } from "react"
import { StatusBadge } from "./status-badge"

export type DashboardTone =
  | "destructive"
  | "neutral"
  | "primary"
  | "success"
  | "warning"
export type DashboardMetricTone = Exclude<DashboardTone, "destructive">

type DashboardHomeHeaderProps = {
  businessName: string
  greetingName: string
  hasNotification?: boolean
  onBusinessPress?: () => void
  onNotificationPress: () => void
  onProfilePress?: () => void
}

export function DashboardHomeHeader({
  businessName,
  greetingName,
  hasNotification = false,
  onBusinessPress,
  onNotificationPress,
  onProfilePress,
}: DashboardHomeHeaderProps) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        accessibilityLabel={`Switch business from ${businessName}`}
        accessibilityRole="button"
        className="size-10 items-center justify-center rounded-xl bg-primary active:opacity-85"
        disabled={!onBusinessPress}
        haptic={Boolean(onBusinessPress)}
        onPress={onBusinessPress}
      >
        <Text className="text-xs font-extrabold text-primary-foreground">
          {initials(businessName)}
        </Text>
      </Pressable>
      <View className="min-w-0 flex-1">
        <Text
          className="text-xl font-extrabold tracking-tight text-foreground"
          numberOfLines={1}
        >
          Hello, {greetingName} 👋
        </Text>
        <Text
          className="mt-0.5 text-xs text-muted-foreground"
          numberOfLines={1}
        >
          {businessName}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={
          hasNotification
            ? "Open sync status, items need attention"
            : "Open sync status"
        }
        accessibilityRole="button"
        className="relative size-11 items-center justify-center rounded-full bg-card active:bg-accent"
        haptic
        onPress={onNotificationPress}
      >
        <Icon className="size-base text-foreground" name="Bell" />
        {hasNotification ? (
          <View className="absolute right-1 top-1 size-2.5 rounded-full border-2 border-card bg-destructive" />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`${greetingName} profile`}
        accessibilityRole="button"
        className="size-11 items-center justify-center rounded-full bg-foreground active:opacity-85"
        disabled={!onProfilePress}
        haptic={Boolean(onProfilePress)}
        onPress={onProfilePress}
      >
        <Text className="text-sm font-extrabold text-background">
          {initials(greetingName)}
        </Text>
      </Pressable>
    </View>
  )
}

type DashboardOverviewMetricProps = {
  detail: string
  icon: IconKeys
  label: string
  tone?: "accent" | "secondary"
  value: string
}

export function DashboardOverviewMetric({
  detail,
  icon,
  label,
  tone = "secondary",
  value,
}: DashboardOverviewMetricProps) {
  return (
    <View
      className={cn(
        "min-w-0 flex-1 rounded-2xl p-4",
        tone === "accent" ? "bg-accent" : "bg-secondary",
      )}
    >
      <View className="flex-row items-center gap-2">
        <Icon className="size-sm text-foreground" name={icon} />
        <Text className="text-xs font-bold text-foreground" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        className="mt-5 text-2xl font-extrabold tracking-tight text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
      <View className="mt-2 flex-row items-center gap-1.5">
        <Icon className="size-xs text-primary" name="TrendingUp" />
        <Text
          className="min-w-0 flex-1 text-[11px] text-muted-foreground"
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
    </View>
  )
}

type DashboardRevenueCardProps = {
  detail: string
  label: string
  value: string
}

export function DashboardRevenueCard({
  detail,
  label,
  value,
}: DashboardRevenueCardProps) {
  return (
    <View className="overflow-hidden rounded-2xl bg-primary p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-bold text-primary-foreground/80">
          {label}
        </Text>
        <View className="size-9 items-center justify-center rounded-full bg-primary-foreground/15">
          <Icon className="size-sm text-primary-foreground" name="BarChart3" />
        </View>
      </View>
      <Text
        className="mt-5 text-[32px] font-extrabold tracking-tight text-primary-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
      <View className="mt-2 flex-row items-center gap-2">
        <View className="size-5 items-center justify-center rounded-full bg-primary-foreground/15">
          <Icon className="size-xs text-primary-foreground" name="TrendingUp" />
        </View>
        <Text className="text-xs text-primary-foreground/80">{detail}</Text>
      </View>
    </View>
  )
}

type DashboardActionRowProps = {
  disabled?: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  tone?: DashboardMetricTone
}

export function DashboardActionRow({
  disabled = false,
  icon,
  label,
  onPress,
  tone = "primary",
}: DashboardActionRowProps) {
  const toneClassNames = metricToneClassNames[tone]

  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-4 border-b border-border/70 py-3 active:bg-accent"
      disabled={disabled}
      haptic={!disabled}
      onPress={onPress}
    >
      <View
        className={cn(
          "size-10 items-center justify-center rounded-full",
          toneClassNames.iconBackground,
          disabled && "opacity-50",
        )}
      >
        <Icon className={cn("size-sm", toneClassNames.iconText)} name={icon} />
      </View>
      <Text
        className={cn(
          "min-w-0 flex-1 font-bold text-foreground",
          disabled && "text-muted-foreground",
        )}
      >
        {label}
      </Text>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

type DashboardRecentOrderRowProps = {
  amount: string
  customer: string
  detail: string
  onPress?: () => void
  status: string
  tone: "destructive" | "primary" | "success" | "warning"
}

export function DashboardRecentOrderRow({
  amount,
  customer,
  detail,
  onPress,
  status,
  tone,
}: DashboardRecentOrderRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className="flex-row items-start gap-3 border-b border-border/70 py-4 active:bg-accent"
      disabled={!onPress}
      haptic={Boolean(onPress)}
      onPress={onPress}
    >
      <View className="size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-foreground" name="ReceiptText" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground" numberOfLines={1}>
          {customer}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {detail}
        </Text>
        <StatusBadge className="mt-1 self-start" label={status} tone={tone} />
      </View>
      <Text className="pt-0.5 font-extrabold text-foreground">{amount}</Text>
    </Pressable>
  )
}

function initials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "EW"
  )
}

const metricToneClassNames: Record<
  DashboardTone,
  {
    iconBackground: string
    iconText: string
    surfaceBackground: string
    text: string
  }
> = {
  destructive: {
    iconBackground: "bg-destructive/10",
    iconText: "text-destructive",
    surfaceBackground: "bg-destructive/10",
    text: "text-destructive",
  },
  neutral: {
    iconBackground: "bg-muted",
    iconText: "text-muted-foreground",
    surfaceBackground: "bg-muted",
    text: "text-foreground",
  },
  primary: {
    iconBackground: "bg-primary/10",
    iconText: "text-primary",
    surfaceBackground: "bg-primary/10",
    text: "text-primary",
  },
  success: {
    iconBackground: "bg-success/10",
    iconText: "text-success",
    surfaceBackground: "bg-success/10",
    text: "text-success",
  },
  warning: {
    iconBackground: "bg-warn/10",
    iconText: "text-warn",
    surfaceBackground: "bg-warn/10",
    text: "text-warn",
  },
}

type DashboardMetricCardProps = {
  detail: string
  label: string
  tone: DashboardMetricTone
  value: number
}

export function DashboardMetricCard({
  detail,
  label,
  tone,
  value,
}: DashboardMetricCardProps) {
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const businesses = useBusinessStore((state) => state.businesses)
  const currencyCode =
    businesses.find((business) => business.id === activeBusinessId)?.currency ??
    "NGN"
  const displayValue =
    label === "Today sales"
      ? formatMinorMoney(value, currencyCode)
      : String(value)
  const toneClassNames = metricToneClassNames[tone]

  return (
    <View variant="card" className="min-w-[47%] flex-1 gap-3 p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View
          className={cn(
            "h-9 w-9 items-center justify-center rounded-full",
            toneClassNames.iconBackground,
          )}
        >
          <Icon
            className={cn("size-base", toneClassNames.iconText)}
            name={tone === "warning" ? "TriangleAlert" : "TrendingUp"}
          />
        </View>
        <Text className="text-right text-[11px] font-bold uppercase tracking-[1px] text-muted-foreground">
          {label}
        </Text>
      </View>
      <View className="gap-1">
        <Text className="text-2xl font-extrabold leading-8 text-foreground">
          {displayValue}
        </Text>
        <Text className="text-xs leading-5 text-muted-foreground">
          {detail}
        </Text>
      </View>
    </View>
  )
}

type DashboardQuickActionProps = {
  description: string
  icon: IconKeys
  label: string
  onPress?: () => void
}

export function DashboardQuickAction({
  description,
  icon,
  label,
  onPress,
}: DashboardQuickActionProps) {
  return (
    <Pressable
      className="min-w-[30%] flex-1 gap-3 rounded-2xl bg-card p-4 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-base text-primary" name={icon} />
      </View>
      <View className="gap-1">
        <Text className="text-sm font-extrabold text-foreground">{label}</Text>
        <Text className="text-xs leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
    </Pressable>
  )
}

type DashboardPanelProps = {
  actionLabel?: string
  children?: ReactNode
  description: string
  icon?: IconKeys
  onActionPress?: () => void
  title: string
  tone?: DashboardTone
}

export function DashboardPanel({
  actionLabel,
  children,
  description,
  icon,
  onActionPress,
  title,
  tone = "neutral",
}: DashboardPanelProps) {
  const toneClassNames = metricToneClassNames[tone]

  return (
    <View variant="card" className="gap-4 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          {icon ? (
            <View
              className={cn(
                "mt-0.5 h-10 w-10 items-center justify-center rounded-full",
                toneClassNames.iconBackground,
              )}
            >
              <Icon
                className={cn("size-sm", toneClassNames.iconText)}
                name={icon}
              />
            </View>
          ) : null}
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-extrabold text-foreground">{title}</Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {description}
            </Text>
          </View>
        </View>
        {actionLabel && onActionPress ? (
          <Pressable
            className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
            haptic
            onPress={onActionPress}
            transition
          >
            <Text className="text-xs font-bold text-primary">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  )
}

type DashboardStatTileProps = {
  detail?: string
  label: string
  tone?: DashboardTone
  value: string | number
}

export function DashboardStatTile({
  detail,
  label,
  tone = "neutral",
  value,
}: DashboardStatTileProps) {
  const toneClassNames = metricToneClassNames[tone]

  return (
    <View variant="muted" className="min-w-[47%] flex-1 p-3">
      <Text className="text-[11px] font-bold uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text className={cn("mt-1 text-lg font-extrabold", toneClassNames.text)}>
        {value}
      </Text>
      {detail ? (
        <Text className="mt-1 text-xs leading-4 text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

type DashboardInlineStatusProps = {
  label: string
  tone?: DashboardTone
  title: string
}

export function DashboardInlineStatus({
  label,
  title,
  tone = "neutral",
}: DashboardInlineStatusProps) {
  const toneClassNames = metricToneClassNames[tone]

  return (
    <View
      className={cn(
        "flex-row items-center justify-between gap-3 rounded-xl px-3 py-2",
        toneClassNames.surfaceBackground,
      )}
    >
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      <Text className={cn("text-xs font-bold", toneClassNames.text)}>
        {label}
      </Text>
    </View>
  )
}

type DashboardRecordRowProps = {
  children?: ReactNode
  detail: string
  icon: IconKeys
  metadata?: string
  title: string
  trailing?: ReactNode
}

export function DashboardRecordRow({
  children,
  detail,
  icon,
  metadata,
  title,
  trailing,
}: DashboardRecordRowProps) {
  return (
    <View variant="muted" className="gap-3 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-muted">
            <Icon className="size-sm text-muted-foreground" name={icon} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-extrabold text-foreground" numberOfLines={1}>
              {title}
            </Text>
            <Text
              className="text-sm leading-5 text-muted-foreground"
              numberOfLines={2}
            >
              {detail}
            </Text>
            {metadata ? (
              <Text className="text-xs leading-4 text-muted-foreground">
                {metadata}
              </Text>
            ) : null}
          </View>
        </View>
        {trailing}
      </View>
      {children ? (
        <View className="flex-row flex-wrap items-center gap-2">
          {children}
        </View>
      ) : null}
    </View>
  )
}
