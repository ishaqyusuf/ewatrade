import { Pressable } from "@/components/ui/pressable"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import {
  formatCurrencyInput,
  getCurrencySymbol,
  normalizeCurrencyInput,
} from "@ewatrade/utils"
import { Text as NativeText, TextInput, View } from "react-native"

export type AmountSuggestion = {
  label: string
  /** Major-unit input value, e.g. "37200". */
  value: string
  tint: GreenTillTint
}

/**
 * Green Till's centred money entry: a small label, the amount large in the
 * middle of a card, and tinted chips that fill a suggested amount.
 */
export function BigAmountField({
  currencyCode,
  editable = true,
  label,
  onChangeValue,
  suggestions = [],
  value,
}: {
  currencyCode: string
  editable?: boolean
  label: string
  onChangeValue: (value: string) => void
  suggestions?: AmountSuggestion[]
  value: string
}) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const symbol = getCurrencySymbol(currencyCode)
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.card,
        borderRadius: 22,
        boxShadow: "0 1px 3px rgba(24, 36, 32, 0.08)",
        gap: 2,
        padding: 16,
      }}
    >
      <NativeText
        style={{
          color: colors.mutedForeground,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </NativeText>
      <View style={{ alignItems: "center", flexDirection: "row" }}>
        <NativeText
          style={{
            color: value ? colors.foreground : colors.mutedForeground,
            fontSize: 38,
            fontWeight: "800",
            letterSpacing: -1.2,
          }}
        >
          {symbol}
        </NativeText>
        <TextInput
          accessibilityLabel={label}
          editable={editable}
          keyboardType="decimal-pad"
          maxLength={18}
          onChangeText={(next) => onChangeValue(normalizeCurrencyInput(next))}
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          style={{
            color: colors.foreground,
            fontSize: 38,
            fontVariant: ["tabular-nums"],
            fontWeight: "800",
            letterSpacing: -1.2,
            minWidth: 40,
            padding: 0,
          }}
          value={formatCurrencyInput(value)}
        />
      </View>
      {suggestions.length ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.label}
              accessibilityLabel={`Fill ${suggestion.label}`}
              accessibilityRole="button"
              disabled={!editable}
              haptic
              onPress={() => onChangeValue(suggestion.value)}
              style={{
                backgroundColor: palette[suggestion.tint],
                borderRadius: 999,
                minHeight: 32,
                justifyContent: "center",
                paddingHorizontal: 10,
              }}
            >
              <NativeText
                style={{
                  color: palette[`${suggestion.tint}Foreground`],
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {suggestion.label}
              </NativeText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
