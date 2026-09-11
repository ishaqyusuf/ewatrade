import { FormField } from "@/components/mobile/form-field"
import type {
  CloseoutHeaderProps,
  CloseoutRowProps,
} from "@/components/mobile/closeout/closeout-presentation"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function ClassicCloseoutHeader(_props: CloseoutHeaderProps) {
  return null
}
export function ClassicCloseoutRow({
  line,
  disabled,
  onChange,
}: CloseoutRowProps) {
  const row = line.balance
  return (
    <View className="mb-5 gap-3 rounded-2xl border border-border bg-card p-4">
      <View>
        <Text className="font-bold text-foreground">
          {row.productName} · {row.variantName}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          Expected {row.onHandQuantity} {row.inventoryUnitName}
        </Text>
      </View>
      <FormField
        editable={!disabled}
        keyboardType="decimal-pad"
        label="Declared quantity"
        accessibilityLabel={`Declared quantity for ${row.productName}, ${row.variantName}, ${row.inventoryUnitName}`}
        onChangeText={onChange}
        value={line.value}
        error={line.error ?? undefined}
      />
    </View>
  )
}
