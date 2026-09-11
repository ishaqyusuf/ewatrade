import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { useRef } from "react"
import {
  type NativeSyntheticEvent,
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
  variant?: "default" | "market-tally" | "reference"
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
  const largeTextLayout = useLargeTextLayout()
  const refs = useRef<Array<TextInput | null>>([])
  const isReferenceVariant = variant === "reference"
  const isMarketTallyVariant = variant === "market-tally"
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
    <View
      className={
        isMarketTallyVariant
          ? "w-full border-2 border-market-ink bg-market-field px-2 py-[9px]"
          : undefined
      }
    >
      <View
        className={cn(
          "flex-row justify-between",
          isMarketTallyVariant ? "gap-0" : "gap-2",
          className,
        )}
      >
        {cells.map(({ digit, id }, index) => {
          const isActive =
            Boolean(digit) || (index === value.length && value.length < length)

          return (
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
              className={cn(
                "p-0 text-center font-bold [-rn-text-align-vertical:center]",
                isMarketTallyVariant
                  ? cn(
                      "flex-1 rounded-none border-0 border-b-[5px] bg-market-field text-[22px] font-extrabold tabular-nums text-market-ink [-rn-include-font-padding:false]",
                      largeTextLayout ? "h-[72px]" : "h-[62px]",
                      index < length - 1 && "border-r",
                      isActive
                        ? "border-market-marigold"
                        : "border-market-line",
                    )
                  : cn(
                      "rounded-xl border text-foreground",
                      isReferenceVariant
                        ? "bg-muted text-[21px] [-rn-include-font-padding:false]"
                        : "h-14 flex-1 bg-card text-xl",
                      isReferenceVariant &&
                        (largeTextLayout ? "h-16 w-12" : "h-14 w-10"),
                      isReferenceVariant && isActive
                        ? "border-primary"
                        : "border-border",
                    ),
              )}
              value={digit}
            />
          )
        })}
      </View>
      {isMarketTallyVariant ? (
        <>
          <View
            pointerEvents="none"
            className="absolute -left-[11px] top-1/2 -mt-[9px] size-[18px] rounded-full bg-market-canvas"
          />
          <View
            pointerEvents="none"
            className="absolute -right-[11px] top-1/2 -mt-[9px] size-[18px] rounded-full bg-market-canvas"
          />
        </>
      ) : null}
    </View>
  )
}
