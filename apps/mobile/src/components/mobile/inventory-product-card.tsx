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
          "h-12 w-12 items-center justify-center rounded-2xl bg-muted",
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
    "flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4",
    selected && "border-primary bg-primary/10",
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
