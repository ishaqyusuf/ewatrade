import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { ActivityIndicator } from "react-native"

type ShareLinkMetricTileProps = {
  icon: IconKeys
  label: string
  value: string
}

type ShareLinkRecordRowProps = {
  children?: ReactNode
  detail: string
  meta?: string
  title: string
  trailing?: ReactNode
}

type ShareLinkActionButtonProps = {
  destructive?: boolean
  disabled?: boolean
  icon: IconKeys
  isLoading?: boolean
  label: string
  loadingLabel?: string
  onPress: () => void
}

type ShareLinkPanelProps = {
  children?: ReactNode
  description: string
  icon: IconKeys
  title: string
}

type ShareLinkOptionPillProps = {
  disabled?: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  selected?: boolean
}

export function ShareLinkMetricTile({
  icon,
  label,
  value,
}: ShareLinkMetricTileProps) {
  return (
    <View variant="card" className="min-w-[45%] flex-1 gap-2 p-4">
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Icon className="size-sm text-muted-foreground" name={icon} />
        </View>
        <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
          {label}
        </Text>
      </View>
      <Text className="text-2xl font-extrabold leading-8 text-foreground">
        {value}
      </Text>
    </View>
  )
}

export function ShareLinkRecordRow({
  children,
  detail,
  meta,
  title,
  trailing,
}: ShareLinkRecordRowProps) {
  return (
    <View variant="muted" className="gap-3 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{title}</Text>
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={2}
          >
            {detail}
          </Text>
          {meta ? (
            <Text className="text-xs leading-5 text-muted-foreground">
              {meta}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
      {children}
    </View>
  )
}

export function ShareLinkPanel({
  children,
  description,
  icon,
  title,
}: ShareLinkPanelProps) {
  return (
    <View variant="card" className="gap-4 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{title}</Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {description}
          </Text>
        </View>
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-sm text-primary" name={icon} />
        </View>
      </View>
      {children}
    </View>
  )
}

export function ShareLinkOptionPill({
  disabled = false,
  icon,
  label,
  onPress,
  selected = false,
}: ShareLinkOptionPillProps) {
  return (
    <Pressable
      className={cn(
        "flex-row items-center gap-2 rounded-full px-3 py-2 active:bg-accent",
        selected ? "bg-primary/10" : "bg-muted/60",
        disabled && "opacity-60",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Icon
        className={cn(
          "size-xs",
          selected ? "text-primary" : "text-muted-foreground",
        )}
        name={icon}
      />
      <Text
        className={cn(
          "text-xs font-bold",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function ShareLinkActionButton({
  destructive = false,
  disabled = false,
  icon,
  isLoading = false,
  label,
  loadingLabel,
  onPress,
}: ShareLinkActionButtonProps) {
  const colors = useColors()
  const isDisabled = disabled || isLoading

  return (
    <Pressable
      accessibilityState={{ busy: isLoading, disabled: isDisabled }}
      className={cn(
        "min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full px-3",
        destructive ? "bg-destructive/10" : "bg-primary/10",
        destructive ? "active:bg-destructive/20" : "active:bg-primary/20",
        isDisabled && "opacity-60",
      )}
      disabled={isDisabled}
      haptic={!isDisabled}
      onPress={onPress}
      transition
    >
      {isLoading ? (
        <ActivityIndicator
          color={destructive ? colors.destructive : colors.primary}
          size="small"
        />
      ) : (
        <Icon
          className={cn(
            "size-sm",
            destructive ? "text-destructive" : "text-primary",
          )}
          name={icon}
        />
      )}
      <Text
        className={cn(
          "text-sm font-extrabold",
          destructive ? "text-destructive" : "text-primary",
        )}
      >
        {isLoading && loadingLabel ? loadingLabel : label}
      </Text>
    </Pressable>
  )
}
