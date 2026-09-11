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

export function ConversionHeader(_props: ConversionHeaderProps) {
  return (
    <Text className="text-sm text-muted-foreground [-rn-line-height:20]">
      Transform exact stock between independently balanced packaged units. The
      server proves canonical conservation.
    </Text>
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
      <Text
        accessibilityRole="header"
        className="font-extrabold text-foreground"
      >
        {title}
      </Text>
      {description ? (
        <Text className="text-sm text-muted-foreground [-rn-line-height:20]">
          {description}
        </Text>
      ) : null}
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
      className={cn(
        "my-1 min-h-16 rounded-2xl border p-4",
        selected ? "border-primary bg-primary/5" : "border-border bg-card",
        disabled && "opacity-50",
      )}
    >
      <Text className="font-bold text-foreground">
        {row.productName} · {row.variantName} · {row.inventoryUnitName}
      </Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        On hand {row.onHandQuantity} · Available {row.availableQuantity}
      </Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        {conversionCustody(row)}
      </Text>
    </Pressable>
  )
}
export function ConversionSummary({
  source,
  target,
  projection,
}: ConversionSummaryProps) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Text className="text-base font-extrabold text-foreground">
        Reviewed conversion
      </Text>
      <Text className="font-bold text-foreground">
        {projection.sourceQuantity} {source.inventoryUnitName} →{" "}
        {projection.targetQuantity} {target.inventoryUnitName}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Source on hand: {source.onHandQuantity} → {projection.sourceAfter}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Target on hand: {target.onHandQuantity} → {projection.targetAfter}
      </Text>
      <Text className="text-xs text-muted-foreground">
        Canonical amount conserved: {projection.canonicalQuantity}
      </Text>
    </View>
  )
}
