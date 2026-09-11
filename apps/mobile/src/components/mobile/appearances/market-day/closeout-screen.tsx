import { FormField } from "@/components/mobile/form-field"
import type {
  CloseoutHeaderProps,
  CloseoutRowProps,
} from "@/components/mobile/closeout/closeout-presentation"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"

export function MarketDayCloseoutHeader({
  attendantName,
  storeName,
  count,
  changedCount,
}: CloseoutHeaderProps) {
  return (
    <View className="-mx-4 mb-5">
      <View className="gap-3 border-b-[6px] border-market-marigold bg-market-palm px-4 pb-6 pt-2">
        <Text className="font-market-mono text-[11px] uppercase tracking-[1.4px] text-market-on-palm-muted">
          Inventory custody
        </Text>
        <Text
          accessibilityRole="header"
          className="font-market-display text-[34px] text-market-on-palm [-rn-line-height:40]"
        >
          Close your shift.
        </Text>
        <Text className="text-sm text-market-on-palm-muted [-rn-line-height:20]">
          {attendantName} · {storeName}
        </Text>
      </View>
      <View className="mx-4 mt-5 flex-row flex-wrap justify-between gap-4 bg-market-marigold p-4">
        <View className="gap-1">
          <Text className="font-market-mono text-[10px] uppercase text-market-on-marigold">
            Custody balances
          </Text>
          <Text className="text-2xl font-extrabold text-market-on-marigold">
            {count ?? "—"}
          </Text>
        </View>
        <View className="gap-1">
          <Text className="font-market-mono text-[10px] uppercase text-market-on-marigold">
            With variance
          </Text>
          <Text className="text-2xl font-extrabold text-market-on-marigold">
            {changedCount ?? "—"}
          </Text>
        </View>
      </View>
    </View>
  )
}
export function MarketDayCloseoutRow({
  line,
  index,
  disabled,
  onChange,
}: CloseoutRowProps) {
  const row = line.balance
  const largeText = useLargeTextLayout()
  return (
    <View className="mb-2 gap-3 border-b border-market-line py-4">
      <View className="flex-row items-start gap-3">
        <Text className="w-7 pt-1 font-market-mono text-xs text-market-muted-ink">
          {String(index + 1).padStart(2, "0")}
        </Text>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-bold text-market-ink">{row.productName}</Text>
          <Text className="text-xs text-market-muted-ink">
            {row.variantName} · {row.inventoryUnitName}
          </Text>
        </View>
      </View>
      <View
        className={cn(
          "gap-4",
          largeText ? "flex-col" : "flex-row items-end pl-10",
        )}
      >
        <View className={cn("min-w-0 gap-1 pb-3", !largeText && "flex-1")}>
          <Text className="font-market-mono text-[10px] uppercase text-market-muted-ink">
            Expected
          </Text>
          <Text className="font-extrabold text-market-ink">
            {row.onHandQuantity} {row.inventoryUnitName}
          </Text>
        </View>
        <View className={largeText ? "w-full" : "w-36"}>
          <FormField
            editable={!disabled}
            keyboardType="decimal-pad"
            label="Declared quantity"
            accessibilityLabel={`Declared quantity for ${row.productName}, ${row.variantName}, ${row.inventoryUnitName}`}
            inputClassName="bg-market-field text-market-ink"
            onChangeText={onChange}
            value={line.value}
            error={line.error ?? undefined}
          />
        </View>
      </View>
      {line.variance !== null ? (
        <Text
          className={cn(
            "text-xs font-semibold",
            line.variance === "0"
              ? "text-market-muted-ink"
              : "text-destructive",
          )}
        >
          {line.variance === "0"
            ? "Matches expected quantity"
            : `Variance ${line.variance.startsWith("-") ? "" : "+"}${line.variance} ${row.inventoryUnitName}`}
        </Text>
      ) : null}
    </View>
  )
}
