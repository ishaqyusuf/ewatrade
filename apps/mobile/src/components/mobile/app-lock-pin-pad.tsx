import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { appLockBiometricName } from "@/lib/app-lock-messages"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { keypadHaptic } from "@/lib/keypad-haptic"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { BackspaceGlyph } from "./otp-keypad"

const PIN_KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const

type AppLockPinPadProps = {
  /** Platform name for the biometric key, such as "Fingerprint" or "Face ID". */
  biometricLabel?: string
  codeLength: number
  /** Marks the dots rose after a wrong PIN. */
  error?: boolean
  /** Status line between the dots and the keys. */
  message?: ReactNode
  disabled?: boolean
  onBiometricPress?: () => void
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  showBiometric?: boolean
  value: string
}

export function AppLockPinPad({
  biometricLabel = "Fingerprint",
  codeLength,
  error = false,
  message,
  disabled = false,
  onBiometricPress,
  onDeletePress,
  onDigitPress,
  showBiometric = false,
  value,
}: AppLockPinPadProps) {
  return (
    <View className="w-full items-center">
      <PinCodeCells codeLength={codeLength} error={error} value={value} />
      {message}
      <View className="mt-3 w-full max-w-[270px] gap-2.5">
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
              accessibilityLabel={`Use ${appLockBiometricName(biometricLabel)}`}
              disabled={disabled}
              icon="FingerPrintScan"
              onPress={onBiometricPress}
            />
          ) : (
            <View className="size-16" />
          )}

          <PinKey
            disabled={disabled}
            label="0"
            onPress={() => onDigitPress("0")}
          />

          <PinIconKey
            accessibilityLabel="Delete last digit"
            disabled={disabled || value.length === 0}
            icon="Delete"
            onPress={onDeletePress}
          />
        </View>
      </View>
    </View>
  )
}

/** Gate dots: hollow until typed, solid once filled, rose after a wrong PIN. */
function PinCodeCells({
  codeLength,
  error,
  value,
}: {
  codeLength: number
  error: boolean
  value: string
}) {
  // A wrong PIN keeps every dot filled so the shake reads as "this one".
  const filled = error ? codeLength : value.length
  return (
    <View
      accessibilityLabel={`${value.length} of ${codeLength} digits entered`}
      accessible
      className="my-5 flex-row justify-center gap-3.5"
    >
      {Array.from({ length: codeLength }, (_, index) => (
        <View
          key={`app-lock-pin-cell-${index + 1}`}
          className={cn(
            "size-3.5 rounded-full border-2",
            error ? "border-[var(--gate-error)]" : "border-[var(--gate-fg)]",
            index < filled
              ? error
                ? "bg-[var(--gate-error)]"
                : "bg-[var(--gate-fg)]"
              : "opacity-[0.55]",
          )}
        />
      ))}
    </View>
  )
}

/** Round gate key: the circle brightens and dips while held. */
function GateKey({
  accessibilityLabel,
  children,
  disabled,
  filled,
  onPress,
}: {
  accessibilityLabel: string
  children: ReactNode
  disabled: boolean
  /** Digits sit on a tinted circle; icon keys show one only while held. */
  filled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      allowOverflow
      className={cn("size-16", disabled && "opacity-40")}
      disabled={disabled}
      noRipple
      onPress={onPress}
      onPressIn={disabled ? undefined : keypadHaptic}
    >
      {({ pressed }) => (
        <View
          className={cn(
            "size-16 items-center justify-center rounded-full",
            pressed
              ? "scale-[0.94] bg-[var(--gate-pressed)]"
              : filled
                ? "bg-[var(--gate-chip)]"
                : "bg-transparent",
          )}
        >
          {children}
        </View>
      )}
    </Pressable>
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
    <GateKey
      accessibilityLabel={`Enter digit ${label}`}
      disabled={disabled}
      filled
      onPress={onPress}
    >
      {/* No font padding and a fixed line box, so the digit sits dead centre. */}
      <Text
        maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
        className="text-center text-[26px] font-semibold [-rn-include-font-padding:false] [-rn-line-height:30] [-rn-text-align-vertical:center] text-[var(--gate-fg)]"
      >
        {label}
      </Text>
    </GateKey>
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
  const palette = useGatePalette()
  return (
    <GateKey
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      filled={false}
      onPress={onPress}
    >
      {icon === "Delete" ? (
        <BackspaceGlyph color={palette.heroForeground} />
      ) : (
        <Icon
          className="size-[26px]"
          color={palette.heroForeground}
          name={icon}
        />
      )}
    </GateKey>
  )
}

function useGatePalette() {
  const { colorScheme } = useColorScheme()
  return GREEN_TILL_THEME[colorScheme]
}
