import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type SyncReliabilityRowProps = {
  children?: ReactNode
  detail: string
  statusIcon?: IconKeys
  statusLabel?: string
  statusTone?: MobileDesignStatusTone
  testID?: string
  title: string
}

type SyncReliabilityActionProps = {
  disabled?: boolean
  icon: IconKeys
  label: string
  onPress?: () => void
  tone?: "destructive" | "muted" | "primary"
}

type SyncReliabilityPanelProps = {
  children?: ReactNode
  description: string
  icon?: IconKeys
  statusIcon?: IconKeys
  statusLabel?: string
  statusTone?: MobileDesignStatusTone
  testID?: string
  title: string
}

type SyncReliabilityStatProps = {
  label: string
  testID?: string
  tone?: MobileDesignStatusTone
  value: string
}

type SyncReliabilityToggleProps = {
  active: boolean
  description: string
  label: string
  onPress: () => void
  testID?: string
}

const toneTextClasses: Record<MobileDesignStatusTone, string> = {
  default: "text-foreground",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warn",
}

export function SyncReliabilityRow({
  children,
  detail,
  statusIcon,
  statusLabel,
  statusTone = "muted",
  testID,
  title,
}: SyncReliabilityRowProps) {
  return (
    <View variant="muted" className="gap-3 p-4" testID={testID}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{title}</Text>
          <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
            {detail}
          </Text>
        </View>
        {statusLabel ? (
          <StatusBadge
            icon={statusIcon}
            label={statusLabel}
            tone={statusTone}
          />
        ) : null}
      </View>
      {children}
    </View>
  )
}

export function SyncReliabilityPanel({
  children,
  description,
  icon,
  statusIcon,
  statusLabel,
  statusTone = "muted",
  testID,
  title,
}: SyncReliabilityPanelProps) {
  const toneClassName = toneTextClasses[statusTone]

  return (
    <View variant="card" className="gap-3 p-4" testID={testID}>
      <View className="flex-row items-start gap-3">
        {icon ? (
          <View className="size-10 items-center justify-center rounded-full bg-muted">
            <Icon className={cn("size-sm", toneClassName)} name={icon} />
          </View>
        ) : null}
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{title}</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {description}
          </Text>
        </View>
        {statusLabel ? (
          <StatusBadge
            icon={statusIcon}
            label={statusLabel}
            tone={statusTone}
          />
        ) : null}
      </View>
      {children}
    </View>
  )
}

export function SyncReliabilityStat({
  label,
  testID,
  tone = "default",
  value,
}: SyncReliabilityStatProps) {
  return (
    <View
      className="min-w-0 flex-1 gap-1 rounded-2xl bg-muted/40 p-3"
      testID={testID}
    >
      <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
        {label}
      </Text>
      <Text
        className={cn("text-2xl font-extrabold", toneTextClasses[tone])}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

export function SyncReliabilityToggle({
  active,
  description,
  label,
  onPress,
  testID,
}: SyncReliabilityToggleProps) {
  return (
    <Pressable
      className="flex-row items-center justify-between gap-3 rounded-2xl bg-card p-4 active:bg-accent"
      haptic
      onPress={onPress}
      testID={testID}
      transition
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
      <View
        className={cn(
          "h-7 w-12 justify-center rounded-full px-1",
          active ? "items-end bg-primary" : "items-start bg-muted",
        )}
      >
        <View className="size-5 rounded-full bg-background" />
      </View>
    </Pressable>
  )
}

export function SyncReliabilityAction({
  disabled = false,
  icon,
  label,
  onPress,
  tone = "primary",
}: SyncReliabilityActionProps) {
  return (
    <Pressable
      className={cn(
        "min-h-10 flex-row items-center gap-2 rounded-full px-3",
        tone === "primary" && "bg-primary active:bg-primary/90",
        tone === "destructive" && "bg-destructive/10 active:bg-destructive/20",
        tone === "muted" && "bg-muted",
        disabled && "opacity-60",
      )}
      disabled={disabled}
      haptic={!disabled && !!onPress}
      onPress={onPress}
      transition
    >
      <Icon
        className={cn(
          "size-sm",
          tone === "primary" && "text-primary-foreground",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
        name={icon}
      />
      <Text
        className={cn(
          "text-xs font-extrabold",
          tone === "primary" && "text-primary-foreground",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
