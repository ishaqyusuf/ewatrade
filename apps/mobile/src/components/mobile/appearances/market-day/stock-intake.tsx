import { Icon } from "@/components/ui/icon"
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

export function StockHeader({ storeName, description }: StockHeaderProps) {
  return (
    <View className="gap-3 rounded-[24px] border-b-[5px] border-market-marigold bg-market-palm px-5 py-6">
      <Text className="font-market-mono text-[10px] uppercase tracking-[1.3px] text-market-on-palm-muted">
        {storeName} · stock journal
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-[36px] font-bold text-market-on-palm [-rn-line-height:41]"
      >
        Every unit accounted for.
      </Text>
      <Text className="text-sm text-market-on-palm-muted [-rn-line-height:21]">
        {description}
      </Text>
    </View>
  )
}
export function StockSection({
  title,
  description,
  children,
}: StockSectionProps) {
  return (
    <View className="gap-3">
      <View className="gap-1 border-l-[3px] border-market-marigold pl-3">
        <Text
          accessibilityRole="header"
          className="text-base font-extrabold text-market-ink"
        >
          {title}
        </Text>
        {description ? (
          <Text className="text-sm text-market-muted-ink [-rn-line-height:20]">
            {description}
          </Text>
        ) : null}
      </View>
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
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={!disabled}
      className={cn(
        "min-h-11 min-w-24 items-center justify-center rounded-full border px-4 py-2",
        selected
          ? "border-market-palm bg-market-palm"
          : "border-market-line bg-market-field active:bg-market-line",
        disabled && "opacity-45",
      )}
    >
      <Text
        className={cn(
          "text-center text-sm font-bold [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
          selected ? "text-market-on-palm" : "text-market-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
export function StockRow({
  title,
  subtitle,
  quantityLabel,
  icon,
  selected,
  disabled,
  onPress,
}: StockRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${title}, ${subtitle}, ${quantityLabel}`}
      disabled={disabled}
      onPress={onPress}
      haptic={!disabled}
      className={cn(
        "my-1 min-h-20 flex-row items-start gap-3 rounded-2xl border p-4",
        selected
          ? "border-market-accent-ink bg-market-field"
          : "border-market-line bg-market-canvas active:bg-market-field",
        disabled && "opacity-45",
      )}
    >
      <View
        className={cn(
          "size-11 shrink-0 items-center justify-center rounded-xl",
          selected ? "bg-market-palm" : "bg-market-marigold",
        )}
      >
        <Icon
          name={selected ? "CircleCheck" : icon}
          className={cn(
            "size-base",
            selected ? "text-market-on-palm" : "text-market-on-marigold",
          )}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-extrabold text-market-ink">
          {title}
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {subtitle}
        </Text>
        <Text className="font-market-mono text-xs font-bold text-market-accent-ink [-rn-line-height:18]">
          {quantityLabel}
        </Text>
      </View>
    </Pressable>
  )
}
