import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { View } from "react-native"

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
}

export function AppLockPinPad({
  codeLength,
  disabled = false,
  onBiometricPress,
  onDeletePress,
  onDigitPress,
  showBiometric = false,
  value,
}: AppLockPinPadProps) {
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
              <Text className="text-[20px] font-extrabold leading-6 text-foreground">
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
      className={cn(
        "h-12 w-12 items-center justify-center rounded-full active:bg-accent",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Text className="text-[20px] font-medium leading-6 text-foreground">
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
