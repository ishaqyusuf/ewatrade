import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { useRef } from "react"
import {
  type NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native"

type OtpInputProps = {
  className?: string
  disableSystemKeyboard?: boolean
  length?: number
  onChange: (value: string) => void
  value: string
  variant?: "default" | "reference"
}

export function OtpInput({
  className,
  disableSystemKeyboard = false,
  length = 6,
  onChange,
  value,
  variant = "default",
}: OtpInputProps) {
  const colors = useColors()
  const refs = useRef<Array<TextInput | null>>([])
  const isReferenceVariant = variant === "reference"
  const digits = Array.from({ length }, (_, index) => value[index] ?? "")
  const cells = digits.map((digit, index) => ({
    digit,
    id: `otp-cell-${index + 1}`,
  }))

  const updateDigit = (index: number, nextValue: string) => {
    const nextDigits = [...digits]
    const numericValue = nextValue.replace(/\D/g, "")

    if (!numericValue) {
      nextDigits[index] = ""
      onChange(nextDigits.join(""))
      return
    }

    for (let offset = 0; offset < numericValue.length; offset++) {
      const targetIndex = index + offset
      if (targetIndex >= length) break
      nextDigits[targetIndex] = numericValue[offset] ?? ""
    }

    onChange(nextDigits.join(""))

    const nextFocusIndex = Math.min(index + numericValue.length, length - 1)
    refs.current[nextFocusIndex]?.focus()
  }

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (event.nativeEvent.key !== "Backspace" || digits[index]) return
    refs.current[Math.max(index - 1, 0)]?.focus()
  }

  return (
    <View className={cn("flex-row justify-between gap-2", className)}>
      {cells.map(({ digit, id }, index) => (
        <TextInput
          accessibilityLabel={`OTP digit ${index + 1}`}
          autoCapitalize="none"
          autoCorrect={false}
          caretHidden={disableSystemKeyboard}
          inputMode="numeric"
          keyboardType="number-pad"
          key={id}
          maxLength={index === 0 ? length : 1}
          onChangeText={(nextValue) => updateDigit(index, nextValue)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          ref={(node) => {
            refs.current[index] = node
          }}
          selectTextOnFocus
          selectionColor={colors.primary}
          showSoftInputOnFocus={!disableSystemKeyboard}
          style={[
            isReferenceVariant ? styles.referenceCell : styles.cell,
            {
              backgroundColor: isReferenceVariant ? colors.muted : colors.card,
              borderColor:
                isReferenceVariant &&
                (digit || (index === value.length && value.length < length))
                  ? colors.primary
                  : colors.border,
              color: colors.foreground,
            },
          ]}
          value={digit}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    height: 56,
    padding: 0,
    textAlign: "center",
    textAlignVertical: "center",
  },
  referenceCell: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 21,
    fontWeight: "700",
    height: 56,
    includeFontPadding: false,
    padding: 0,
    textAlign: "center",
    textAlignVertical: "center",
    width: 40,
  },
})
