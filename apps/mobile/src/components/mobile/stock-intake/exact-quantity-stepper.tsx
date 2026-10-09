import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { FormField } from "../form-field"
import { stepExactQuantity } from "./stock-preview"
export function ExactQuantityStepper({
  label,
  value,
  onChange,
  disabled = false,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}) {
  const large = useLargeTextLayout()
  return (
    <View className={large ? "gap-3" : "flex-row items-end gap-3"}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(stepExactQuantity(value, -1))}
        className="min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl bg-tint-mint"
      >
        <Icon name="Minus" className="size-[20px] text-tint-mint-foreground" />
      </Pressable>
      <View className={large ? "w-full" : "min-w-0 flex-1"}>
        <FormField
          label={label}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          maxLength={40}
          keyboardType="decimal-pad"
          error={error}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(stepExactQuantity(value, 1))}
        className="min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl bg-tint-mint"
      >
        <Icon name="Plus" className="size-[20px] text-tint-mint-foreground" />
      </Pressable>
    </View>
  )
}
