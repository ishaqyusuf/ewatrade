import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { conversionCustody } from "@/components/mobile/unit-conversion/unit-conversion-model"
import type {
  ConversionHeaderProps,
  ConversionRowProps,
  ConversionSectionProps,
  ConversionSummaryProps,
} from "@/components/mobile/unit-conversion/unit-conversion-presentation"

export function ConversionHeader({ storeName }: ConversionHeaderProps) {
  return (
    <View className="gap-3 rounded-[24px] border-b-[5px] border-market-palm bg-market-marigold p-5">
      <Text className="font-market-mono text-[10px] uppercase tracking-[1.4px] text-market-on-marigold">
        {storeName} · packing bench
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-[38px] font-bold text-market-on-marigold [-rn-line-height:43]"
      >
        Same stock. New units.
      </Text>
      <Text className="text-sm text-market-on-marigold [-rn-line-height:21]">
        Move exact quantities between packaged balances. No stock gained, no
        stock lost.
      </Text>
    </View>
  )
}
export function ConversionSection({
  onLayout,
  title,
  description,
  children,
}: ConversionSectionProps) {
  return (
    <View className="gap-3" onLayout={onLayout}>
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
export function ConversionRow({
  row,
  selected,
  disabled,
  onPress,
}: ConversionRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${row.productName}, ${row.variantName}, ${row.inventoryUnitName}, ${conversionCustody(row)}, ${row.availableQuantity} available`}
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
          name={selected ? "CircleCheck" : "Warehouse"}
          className={cn(
            "size-base",
            selected ? "text-market-on-palm" : "text-market-on-marigold",
          )}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-extrabold text-market-ink">
          {row.productName} · {row.variantName}
        </Text>
        <Text className="text-sm font-bold text-market-accent-ink">
          {row.inventoryUnitName} · {row.availableQuantity} available
        </Text>
        <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
          {row.onHandQuantity} on hand · {conversionCustody(row)}
        </Text>
      </View>
    </Pressable>
  )
}
export function ConversionSummary({
  source,
  target,
  projection,
}: ConversionSummaryProps) {
  return (
    <View className="gap-3 rounded-[22px] border border-market-line bg-market-field p-4">
      <Text className="font-market-mono text-[10px] uppercase tracking-[1px] text-market-muted-ink">
        One conserved quantity
      </Text>
      <View className="gap-1 rounded-xl bg-market-palm p-4">
        <Text className="text-xs font-bold uppercase text-market-on-palm-muted">
          From · {source.inventoryUnitName}
        </Text>
        <Text className="font-market-display text-[28px] font-bold text-market-on-palm [-rn-line-height:34]">
          {projection.sourceQuantity}
        </Text>
        <Text className="text-xs text-market-on-palm-muted">
          On hand {source.onHandQuantity} → {projection.sourceAfter}
        </Text>
      </View>
      <View className="self-center">
        <Icon name="ChevronDown" className="size-base text-market-accent-ink" />
      </View>
      <View className="gap-1 rounded-xl bg-market-marigold p-4">
        <Text className="text-xs font-bold uppercase text-market-on-marigold">
          To · {target.inventoryUnitName}
        </Text>
        <Text className="font-market-display text-[28px] font-bold text-market-on-marigold [-rn-line-height:34]">
          {projection.targetQuantity}
        </Text>
        <Text className="text-xs text-market-on-marigold">
          On hand {target.onHandQuantity} → {projection.targetAfter}
        </Text>
      </View>
      <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
        Canonical amount conserved: {projection.canonicalQuantity}. These are
        reviewed values, not a reservation.
      </Text>
    </View>
  )
}
