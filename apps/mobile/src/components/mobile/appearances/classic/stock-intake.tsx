import { InventoryProductCard } from "@/components/mobile/inventory-product-card"
import { SecondarySheetHeader } from "@/components/mobile/secondary-operations"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import type {
  StockChoiceProps,
  StockHeaderProps,
  StockRowProps,
  StockSectionProps,
} from "@/components/mobile/stock-intake/stock-intake-presentation"

export function StockHeader({ description }: StockHeaderProps) {
  return (
    <SecondarySheetHeader
      icon="Warehouse"
      title="Inventory movement"
      description={description}
    />
  )
}
export function StockSection({
  title,
  description,
  children,
}: StockSectionProps) {
  return (
    <View className="gap-3">
      <Text className="text-base font-extrabold text-foreground">{title}</Text>
      {description ? (
        <Text className="text-sm text-muted-foreground [-rn-line-height:20]">
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
      stockTone="muted"
      stockLabel={quantityLabel}
    />
  )
}
