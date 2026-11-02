import { FormField } from "@/components/mobile/form-field"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { getCurrencySymbol } from "@ewatrade/utils"
import { View } from "react-native"
import type { StartingBalanceChoice } from "./starting-balance-model"

const choices: Array<[StartingBalanceChoice, string]> = [
  ["none", "No"],
  ["owes", "They owe me"],
  ["credit", "Paid ahead"],
]

/**
 * Workshop Mobile Quality v19, screen 18 v2 direction 01: a starting balance
 * inside Add customer. Saved with the customer in one command; no money moves.
 */
export function StartingBalanceField({
  amount,
  choice,
  currencyCode,
  disabled,
  onAmountChange,
  onChoiceChange,
}: {
  amount: string
  choice: StartingBalanceChoice
  currencyCode: string
  disabled: boolean
  onAmountChange: (amount: string) => void
  onChoiceChange: (choice: StartingBalanceChoice) => void
}) {
  return (
    <View className="gap-3">
      <Text className="text-xs font-extrabold text-muted-foreground">
        Do they already owe you, or have they paid ahead?
      </Text>
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {choices.map(([value, label]) => {
          const selected = choice === value
          return (
            <Pressable
              key={value}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              // Keep the border width constant: Android drops the label when it changes.
              className={
                selected
                  ? "min-h-11 justify-center rounded-xl border-[1.5px] border-primary bg-accent px-3.5"
                  : "min-h-11 justify-center rounded-xl border-[1.5px] border-transparent bg-card px-3.5 shadow-sm"
              }
              disabled={disabled}
              haptic
              onPress={() => onChoiceChange(value)}
            >
              <Text
                className={
                  selected
                    ? "text-sm font-bold text-accent-foreground"
                    : "text-sm font-bold text-foreground"
                }
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {choice === "none" ? null : (
        <View className="gap-1.5">
          <FormField
            variant="green-gate"
            editable={!disabled}
            keyboardType="decimal-pad"
            label={`${choice === "owes" ? "Amount they owe" : "Amount paid ahead"} · ${getCurrencySymbol(currencyCode)}`}
            maxLength={16}
            onChangeText={onAmountChange}
            placeholder="0"
            value={amount}
          />
          <Text className="text-xs text-muted-foreground">
            Added to their statement as a starting balance. No money moves.
          </Text>
        </View>
      )}
    </View>
  )
}
