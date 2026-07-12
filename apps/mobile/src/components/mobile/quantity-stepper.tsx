import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input-2"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  formatWholeQuantity,
  normalizeWholeNumberInput,
  parseWholeQuantity,
} from "@/lib/quantity"
import { cn } from "@/lib/utils"
import { View } from "react-native"

type QuantityStepperProps = {
  helper?: string
  label?: string
  min?: number
  onChangeText: (value: string) => void
  onFocus?: () => void
  step?: number
  value: string
}

export function QuantityStepper({
  helper,
  label = "Quantity",
  min = 1,
  onChangeText,
  onFocus,
  step = 1,
  value,
}: QuantityStepperProps) {
  const quantity = parseWholeQuantity(value)
  const canDecrease = quantity > min

  const changeBy = (amount: number) => {
    const nextValue = Math.max(min, (quantity || min) + amount)
    onChangeText(formatWholeQuantity(nextValue))
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-foreground">{label}</Text>
        {helper ? (
          <Text className="text-xs text-muted-foreground">{helper}</Text>
        ) : null}
      </View>
      <View className="w-full flex-row items-center gap-3">
        <Pressable
          className={cn(
            "h-12 w-12 items-center justify-center rounded-xl border border-border bg-card active:bg-accent",
            !canDecrease && "opacity-50",
          )}
          disabled={!canDecrease}
          haptic
          onPress={() => changeBy(-step)}
          transition
        >
          <Icon className="size-base text-foreground" name="Minus" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Input
            className="h-12 rounded-xl border-border bg-card px-4 text-lg font-bold"
            expand
            inputTextAlign="center"
            inputMode="numeric"
            keyboardType="numeric"
            onChangeText={(nextValue) =>
              onChangeText(normalizeWholeNumberInput(nextValue))
            }
            onFocus={onFocus}
            onPressIn={onFocus}
            value={value}
          />
        </View>
        <Pressable
          className="h-12 w-12 items-center justify-center rounded-xl border border-border bg-card active:bg-accent"
          haptic
          onPress={() => changeBy(step)}
          transition
        >
          <Icon className="size-base text-foreground" name="Plus" />
        </Pressable>
      </View>
    </View>
  )
}
