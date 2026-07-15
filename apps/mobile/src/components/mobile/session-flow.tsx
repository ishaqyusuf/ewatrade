import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type SessionSourcePanelProps = {
  detail: string
  label: string
  title: string
  tone?: MobileDesignStatusTone
}

type SessionStatTileProps = {
  label: string
  tone?: MobileDesignStatusTone
  value: string
}

type SessionInventoryLineProps = {
  children: ReactNode
  expectedLabel: string
  productName: string
  unitName: string
  varianceLabel: string
  varianceTone?: MobileDesignStatusTone
}

type SessionVarianceRowProps = {
  label: string
  value: string
  tone?: MobileDesignStatusTone
}

const toneTextClasses: Record<MobileDesignStatusTone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warn",
}

export function SessionSourcePanel({
  detail,
  label,
  title,
  tone = "muted",
}: SessionSourcePanelProps) {
  return (
    <StatusBanner icon="Activity" message={detail} title={title} tone={tone}>
      <View className="mt-2 self-start">
        <StatusBadge label={label} tone={tone} />
      </View>
    </StatusBanner>
  )
}

export function SessionStatTile({
  label,
  tone = "default",
  value,
}: SessionStatTileProps) {
  return (
    <View variant="muted" className="min-w-0 flex-1 gap-1 p-3">
      <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text
        className={cn("text-lg font-extrabold", toneTextClasses[tone])}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

export function SessionInventoryLine({
  children,
  expectedLabel,
  productName,
  unitName,
  varianceLabel,
  varianceTone = "success",
}: SessionInventoryLineProps) {
  return (
    <View variant="muted" className="gap-3 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{productName}</Text>
          <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
            {unitName}
          </Text>
        </View>
        <StatusBadge label={expectedLabel} tone="muted" />
      </View>
      {children}
      <Text
        className={cn("text-xs font-extrabold", toneTextClasses[varianceTone])}
      >
        {varianceLabel}
      </Text>
    </View>
  )
}

export function SessionVarianceRow({
  label,
  tone = "success",
  value,
}: SessionVarianceRowProps) {
  return (
    <View variant="muted" className="flex-row items-center justify-between gap-3 p-3">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Text className={cn("text-sm font-extrabold", toneTextClasses[tone])}>
        {value}
      </Text>
    </View>
  )
}

export function SessionSectionHeader({
  icon,
  title,
}: {
  icon: IconKeys
  title: string
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="size-9 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <Text className="text-base font-extrabold text-foreground">{title}</Text>
    </View>
  )
}
