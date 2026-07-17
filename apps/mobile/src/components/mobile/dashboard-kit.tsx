import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReactNode } from "react"

export type DashboardTone =
  | "destructive"
  | "neutral"
  | "primary"
  | "success"
  | "warning"
export type DashboardMetricTone = Exclude<DashboardTone, "destructive">

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
