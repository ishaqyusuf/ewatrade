import { InventoryProductCard } from "@/components/mobile/inventory-product-card"
import type {
  StockChoiceProps,
  StockRowProps,
  StockSectionProps,
} from "@/components/mobile/stock-intake/stock-intake-presentation"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"

export function StockSection({
  title,
  description,
  children,
}: StockSectionProps) {
  return (
    <View className="gap-3">
      <Text className="text-base font-extrabold text-foreground">{title}</Text>
      {description ? (
        <Text className="text-sm text-muted-foreground [-rn-line-height:22]">
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  )
}
export function StockChoice({
  label,
  selected,
  disabled,
  onPress,
}: StockChoiceProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      haptic={!disabled}
      className={cn(
        "min-h-11 min-w-24 items-center justify-center rounded-full border px-4 py-2",
        selected
          ? "border-primary bg-primary"
          : "border-border bg-background active:bg-accent",
        disabled && "opacity-50",
      )}
    >
      <Text
        className={cn(
          "text-center text-sm font-extrabold [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
export function StockRow({ quantityLabel, ...props }: StockRowProps) {
  return (
    <InventoryProductCard
      {...props}
      accessibilityRole="radio"
      accessibilityLabel={`${props.title}, ${props.subtitle}, ${quantityLabel}`}
      accessibilityState={{ checked: props.selected, disabled: props.disabled }}
      className="border-border"
      stockTone="muted"
      stockLabel={quantityLabel}
    />
  )
}
