import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { View } from "react-native"

type InventoryProductCardContentProps = {
  icon: IconKeys
  priceLabel?: string
  selected?: boolean
  stockLabel?: string
  stockTone: MobileDesignStatusTone
  subtitle?: string
  title: string
  trailing?: ReactNode
}

export type InventoryProductCardProps = InventoryProductCardContentProps & {
  className?: string
  disabled?: boolean
  onPress?: () => void
}

type InventorySegmentOptionProps = {
  disabled?: boolean
  label: string
  onPress: () => void
  selected: boolean
}

type InventoryUnitOptionProps = {
  label: string
  onPress: () => void
  selected: boolean
  stockLabel: string
  stockTone: MobileDesignStatusTone
}

type InventoryMovementRowProps = {
  detail: string
  quantityLabel: string
  quantityTone: "destructive" | "success"
  statusLabel: string
  statusTone: MobileDesignStatusTone
  title: string
}

function InventoryProductCardContent({
  icon,
  priceLabel,
  selected,
  stockLabel,
  stockTone,
  subtitle,
  title,
  trailing,
}: InventoryProductCardContentProps) {
  return (
    <>
      <View
        className={cn(
          "h-11 w-11 items-center justify-center rounded-full bg-muted",
          selected && "bg-primary/10",
        )}
      >
        <Icon
          className={cn(
            "size-base text-muted-foreground",
            selected && "text-primary",
          )}
          name={selected ? "CircleCheck" : icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <View className="gap-1">
          <Text className="font-semibold text-foreground">{title}</Text>
          {subtitle ? (
            <Text className="text-sm leading-5 text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {stockLabel ? (
            <StatusBadge label={stockLabel} tone={stockTone} />
          ) : null}
          {priceLabel ? <StatusBadge label={priceLabel} tone="muted" /> : null}
        </View>
      </View>
      {trailing}
    </>
  )
}

export function InventoryProductCard({
  className,
  disabled = false,
  icon,
  onPress,
  priceLabel,
  selected = false,
  stockLabel,
  stockTone = "muted",
  subtitle,
  title,
  trailing,
}: InventoryProductCardProps) {
  const containerClassName = cn(
    "flex-row items-start gap-3 border-t border-border py-4",
    selected && "border-primary",
    disabled && "opacity-50",
    className,
  )
  const content = (
    <InventoryProductCardContent
      icon={icon}
      priceLabel={priceLabel}
      selected={selected}
      stockLabel={stockLabel}
      stockTone={stockTone}
      subtitle={subtitle}
      title={title}
      trailing={trailing}
    />
  )

  if (!onPress) {
    return <View className={containerClassName}>{content}</View>
  }

  return (
    <Pressable
      className={cn(containerClassName, "active:bg-accent")}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      {content}
    </Pressable>
  )
}

export function InventorySegmentOption({
  disabled = false,
  label,
  onPress,
  selected,
}: InventorySegmentOptionProps) {
  return (
    <Pressable
      className={cn(
        "min-h-11 flex-1 items-center justify-center rounded-full border px-3",
        selected
          ? "border-primary bg-primary"
          : "border-border bg-background active:bg-accent",
        disabled && "opacity-50",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-sm font-extrabold",
          selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function InventoryUnitOption({
  label,
  onPress,
  selected,
  stockLabel,
  stockTone,
}: InventoryUnitOptionProps) {
  return (
    <Pressable
      className={cn(
        "min-w-[45%] flex-1 gap-2 rounded-2xl border px-4 py-3",
        selected
          ? "border-primary bg-primary"
          : "border-border bg-background active:bg-accent",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-sm font-extrabold",
          selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
      <StatusBadge
        className="self-start"
        label={stockLabel}
        tone={selected ? "default" : stockTone}
      />
    </Pressable>
  )
}

export function InventoryMovementRow({
  detail,
  quantityLabel,
  quantityTone,
  statusLabel,
  statusTone,
  title,
}: InventoryMovementRowProps) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-t border-border py-4">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{title}</Text>
        <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
          {detail}
        </Text>
      </View>
      <View className="items-end gap-2">
        <Text
          className={cn(
            "font-extrabold",
            quantityTone === "success" ? "text-success" : "text-destructive",
          )}
        >
          {quantityLabel}
        </Text>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </View>
    </View>
  )
}
