import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { View } from "@/components/ui/view"

const PIN_KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const

type AppLockPinPadProps = {
  codeLength: number
  disabled?: boolean
  onBiometricPress?: () => void
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  showBiometric?: boolean
  value: string
  variant?: "default" | "quiet-seal"
}

export function AppLockPinPad({
  codeLength,
  disabled = false,
  onBiometricPress,
  onDeletePress,
  onDigitPress,
  showBiometric = false,
  value,
  variant = "default",
}: AppLockPinPadProps) {
  const largeTextLayout = useLargeTextLayout()

  if (variant === "quiet-seal") {
    return (
      <View className="w-full items-center gap-[25px]">
        <QuietSealPinCodeCells codeLength={codeLength} value={value} />

        <View className="w-full max-w-[254px] gap-2">
          {PIN_KEYPAD_ROWS.map((row) => (
            <View className="flex-row justify-between" key={row.join("-")}>
              {row.map((digit) => (
                <QuietSealPinKey
                  disabled={disabled}
                  key={digit}
                  label={digit}
                  largeTextLayout={largeTextLayout}
                  onPress={() => onDigitPress(digit)}
                />
              ))}
            </View>
          ))}

          <View className="flex-row justify-between">
            {showBiometric && onBiometricPress ? (
              <QuietSealIconKey
                accessibilityLabel="Use fingerprint"
                disabled={disabled}
                icon="FingerPrintScan"
                largeTextLayout={largeTextLayout}
                onPress={onBiometricPress}
              />
            ) : (
              <View
                className={
                  largeTextLayout ? "h-[68px] w-[62px]" : "h-[52px] w-[62px]"
                }
              />
            )}

            <QuietSealPinKey
              disabled={disabled}
              label="0"
              largeTextLayout={largeTextLayout}
              onPress={() => onDigitPress("0")}
            />

            <QuietSealIconKey
              accessibilityLabel="Delete last digit"
              disabled={disabled}
              icon="Delete"
              largeTextLayout={largeTextLayout}
              onPress={onDeletePress}
              tone="action"
            />
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="w-full items-center gap-12">
      <PinCodeCells codeLength={codeLength} value={value} />

      <View className="w-full max-w-[260px] gap-7">
        {PIN_KEYPAD_ROWS.map((row) => (
          <View className="flex-row justify-between" key={row.join("-")}>
            {row.map((digit) => (
              <PinKey
                disabled={disabled}
                key={digit}
                label={digit}
                onPress={() => onDigitPress(digit)}
              />
            ))}
          </View>
        ))}

        <View className="flex-row justify-between">
          {showBiometric && onBiometricPress ? (
            <PinIconKey
              accessibilityLabel="Use fingerprint"
              disabled={disabled}
              icon="FingerPrintScan"
              onPress={onBiometricPress}
            />
          ) : (
            <View className="h-12 w-12" />
          )}

          <PinKey
            disabled={disabled}
            label="0"
            onPress={() => onDigitPress("0")}
          />

          <PinIconKey
            accessibilityLabel="Delete last digit"
            disabled={disabled}
            icon="Delete"
            onPress={onDeletePress}
          />
        </View>
      </View>
    </View>
  )
}

function QuietSealPinCodeCells({
  codeLength,
  value,
}: {
  codeLength: number
  value: string
}) {
  return (
    <View className="w-full max-w-[218px] flex-row items-center justify-center gap-2.5">
      {Array.from({ length: codeLength }, (_, index) => {
        const isFilled = index < value.length
        const isActive = index === value.length && value.length < codeLength

        return (
          <View
            accessibilityLabel={`PIN digit ${index + 1}${isFilled ? ", filled" : ", empty"}`}
            accessible
            key={`app-lock-quiet-seal-pin-${index + 1}`}
            className={cn(
              "size-7 items-center justify-center rounded-full border-2",
              isFilled ? "bg-market-marigold" : "bg-market-canvas",
              isActive ? "border-market-paprika" : "border-market-line",
            )}
          >
            {isFilled ? (
              <View className="size-2 rounded-full bg-market-palm" />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function QuietSealPinKey({
  disabled,
  label,
  largeTextLayout,
  onPress,
}: {
  disabled: boolean
  label: string
  largeTextLayout: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Enter digit ${label}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic
      onPress={onPress}
      className={cn(
        "w-[62px] items-center justify-center border-b-2 border-market-line bg-market-canvas active:bg-market-soft-band",
        largeTextLayout ? "h-[68px]" : "h-[52px]",
        disabled && "opacity-40",
      )}
    >
      <Text
        maxFontSizeMultiplier={2}
        className="text-center text-[22px] font-extrabold [-rn-line-height:28] text-market-ink"
      >
        {label}
      </Text>
    </Pressable>
  )
}

function QuietSealIconKey({
  accessibilityLabel,
  disabled,
  icon,
  largeTextLayout,
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string
  disabled: boolean
  icon: "Delete" | "FingerPrintScan"
  largeTextLayout: boolean
  onPress: () => void
  tone?: "action" | "default"
}) {
  const toneClassName =
    tone === "action" ? "text-market-paprika" : "text-market-ink"

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic
      onPress={onPress}
      className={cn(
        "w-[62px] items-center justify-center border-b-2 bg-market-canvas active:bg-market-soft-band",
        largeTextLayout ? "h-[68px]" : "h-[52px]",
        tone === "action" ? "border-market-paprika" : "border-market-line",
        disabled && "opacity-40",
      )}
    >
      {icon === "Delete" ? (
        <Text
          maxFontSizeMultiplier={2}
          className={cn(
            "text-center text-[23px] font-extrabold [-rn-line-height:28]",
            toneClassName,
          )}
        >
          ⌫
        </Text>
      ) : (
        <Icon className={cn("size-[21px]", toneClassName)} name={icon} />
      )}
    </Pressable>
  )
}

function PinCodeCells({
  codeLength,
  value,
}: {
  codeLength: number
  value: string
}) {
  return (
    <View className="flex-row justify-center gap-3">
      {Array.from({ length: codeLength }, (_, index) => {
        const isFilled = index < value.length
        const isActive = index === value.length && value.length < codeLength

        return (
          <View
            accessibilityLabel={`PIN digit ${index + 1}`}
            className={cn(
              "h-12 w-12 items-center justify-center rounded-full bg-muted",
              isActive && "bg-accent",
              isFilled && "bg-primary/15",
            )}
            key={`app-lock-pin-cell-${index + 1}`}
          >
            {isFilled ? (
              <Text className="text-[20px] font-extrabold [-rn-line-height:24] text-foreground">
                *
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function PinKey({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Enter digit ${label}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "h-12 w-12 items-center justify-center rounded-full active:bg-accent",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Text className="text-[20px] font-medium [-rn-line-height:24] text-foreground">
        {label}
      </Text>
    </Pressable>
  )
}

function PinIconKey({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
}: {
  accessibilityLabel: string
  disabled: boolean
  icon: "Delete" | "FingerPrintScan"
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "h-12 w-12 items-center justify-center rounded-full active:bg-accent",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Icon className="size-base text-foreground" name={icon} />
    </Pressable>
  )
}
