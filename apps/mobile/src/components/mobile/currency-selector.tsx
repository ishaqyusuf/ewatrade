import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import {
  OPERATING_CURRENCIES,
  type OperatingCurrencyCode,
} from "@ewatrade/utils"
import { ScrollView, View } from "react-native"

type CurrencySelectorProps = {
  appearance?: "classic" | "market-day" | "chips"
  disabled?: boolean
  label?: string
  onChange: (currencyCode: OperatingCurrencyCode) => void
  value: OperatingCurrencyCode
}

export function CurrencySelector({
  appearance = "classic",
  disabled = false,
  label = "Operating currency",
  onChange,
  value,
}: CurrencySelectorProps) {
  const market = appearance === "market-day"
  if (appearance === "chips")
    return (
      <View className="gap-2">
        <Text className="text-xs font-bold [-rn-line-height:18] text-muted-foreground">
          {label}
        </Text>
        <View className="-mx-[18px]">
          <ScrollView
            accessibilityRole="radiogroup"
            contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {OPERATING_CURRENCIES.map((currency) => {
              const selected = currency.code === value
              return (
                <Pressable
                  accessibilityLabel={`${currency.label}, ${currency.code}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  className={cn(
                    "min-h-9 justify-center rounded-full border-[1.5px] px-[14px]",
                    selected
                      ? "border-primary bg-accent"
                      : "border-transparent bg-muted",
                  )}
                  disabled={disabled}
                  haptic
                  key={currency.code}
                  onPress={() => onChange(currency.code)}
                >
                  <Text
                    className={cn(
                      "text-[13px] font-extrabold [-rn-line-height:18]",
                      selected ? "text-primary" : "text-foreground",
                    )}
                  >
                    {selected
                      ? `${currency.code} ${currency.symbol}`
                      : currency.code}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </View>
    )

  return (
    <View className="gap-2.5">
      <Text
        className={cn(
          "text-xs font-bold uppercase tracking-[1.4px]",
          market ? "text-market-muted-ink" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {OPERATING_CURRENCIES.map((currency) => {
          const selected = currency.code === value
          return (
            <Pressable
              accessibilityLabel={`${currency.label}, ${currency.code}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              className={cn(
                "min-h-[52px] min-w-[92px] flex-1 items-center justify-center rounded-xl border px-3 py-3",
                market
                  ? selected
                    ? "border-market-palm bg-market-soft-band"
                    : "border-market-line bg-market-field"
                  : selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card",
              )}
              haptic
              key={currency.code}
              onPress={() => onChange(currency.code)}
            >
              <Text
                className={cn(
                  "text-sm font-semibold [-rn-include-font-padding:false] [-rn-line-height:20] [-rn-text-align-vertical:center]",
                  market
                    ? selected
                      ? "text-market-accent-ink"
                      : "text-market-ink"
                    : selected
                      ? "text-primary"
                      : "text-foreground",
                )}
              >
                {currency.symbol} {currency.code}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text
        className={cn(
          "text-xs [-rn-line-height:16]",
          market ? "text-market-muted-ink" : "text-muted-foreground",
        )}
      >
        Used for prices, totals, reports, and customer pages.
      </Text>
    </View>
  )
}
