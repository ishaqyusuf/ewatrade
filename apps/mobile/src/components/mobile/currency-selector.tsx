import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import {
  OPERATING_CURRENCIES,
  type OperatingCurrencyCode,
} from "@ewatrade/utils"
import { View } from "react-native"

type CurrencySelectorProps = {
  label?: string
  onChange: (currencyCode: OperatingCurrencyCode) => void
  value: OperatingCurrencyCode
}

export function CurrencySelector({
  label = "Operating currency",
  onChange,
  value,
}: CurrencySelectorProps) {
  return (
    <View className="gap-2.5">
      <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {OPERATING_CURRENCIES.map((currency) => {
          const selected = currency.code === value
          return (
            <Pressable
              accessibilityLabel={`${currency.label}, ${currency.code}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={cn(
                "min-w-[92px] flex-1 rounded-xl border px-3 py-3",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card",
              )}
              haptic
              key={currency.code}
              onPress={() => onChange(currency.code)}
            >
              <Text
                className={cn(
                  "text-center text-sm font-semibold",
                  selected ? "text-primary" : "text-foreground",
                )}
              >
                {currency.symbol} {currency.code}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text className="text-xs leading-4 text-muted-foreground">
        Used for prices, totals, reports, and customer pages.
      </Text>
    </View>
  )
}
