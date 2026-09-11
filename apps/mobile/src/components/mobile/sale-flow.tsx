import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { View } from "react-native"

type SaleSelectableRowProps = {
  accessory?: string
  children?: ReactNode
  disabled?: boolean
  meta: string
  onPress: () => void
  selected?: boolean
  title: string
  value: string
}

export function SaleSelectableRow({
  accessory,
  children,
  disabled,
  meta,
  onPress,
  selected,
  title,
  value,
}: SaleSelectableRowProps) {
  return (
    <Pressable
      className={cn(
        "gap-3 border-t border-border py-4 active:bg-accent",
        selected && "border-primary",
        disabled && "opacity-50",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            {selected ? (
              <View className="h-2 w-2 rounded-full bg-primary" />
            ) : null}
            <Text className="font-extrabold text-foreground">{title}</Text>
          </View>
          <Text className="text-xs font-semibold text-muted-foreground">
            {meta}
          </Text>
          {accessory ? (
            <Text className="text-xs text-muted-foreground">{accessory}</Text>
          ) : null}
        </View>
        <Text className="text-right font-extrabold text-foreground">
          {value}
        </Text>
      </View>
      {children}
    </Pressable>
  )
}

export type SaleSegmentOptionProps = {
  className?: string
  disabled?: boolean
  icon?: IconKeys
  label: string
  onPress: () => void
  selected: boolean
}

export function SaleSegmentOption({
  className,
  disabled = false,
  icon = "CheckCircle2",
  label,
  onPress,
  selected,
}: SaleSegmentOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      className={cn(
        "min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-full border px-3 py-2",
        selected
          ? "border-primary bg-primary"
          : "border-border bg-background active:bg-accent",
        className,
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Icon
        className={cn(
          "size-sm",
          selected ? "text-primary-foreground" : "text-muted-foreground",
        )}
        name={icon}
      />
      <Text
        className={cn(
          "shrink text-center text-sm font-extrabold [-rn-line-height:20] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

type SaleTotalSummaryProps = {
  helper?: string
  label: string
  value: string
}

export function SaleTotalSummary({
  helper,
  label,
  value,
}: SaleTotalSummaryProps) {
  return (
    <View className="gap-2 border-y border-border py-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
          {label}
        </Text>
        {helper ? (
          <Text className="text-xs font-semibold text-muted-foreground">
            {helper}
          </Text>
        ) : null}
      </View>
      <Text className="text-4xl font-extrabold [-rn-line-height:44] text-foreground">
        {value}
      </Text>
    </View>
  )
}
