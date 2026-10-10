import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { appLockBiometricName } from "@/lib/app-lock-messages"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
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
  /** Gate only: marks the dots rose after a wrong PIN. */
  error?: boolean
  /** Gate only: status line between the dots and the keys. */
  message?: ReactNode
  disabled?: boolean
  onBiometricPress?: () => void
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  showBiometric?: boolean
  value: string
  /** "gate" is Settings 21 / 01 One Gate; "quiet-seal" is Market Day. */
  variant?: "gate" | "quiet-seal"
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
  variant = "gate",
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
        "size-16 items-center justify-center rounded-full bg-[var(--gate-chip)]",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        className="text-[26px] font-semibold [-rn-line-height:32] text-[var(--gate-fg)]"
      >
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
  const palette = useGatePalette()
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "size-16 items-center justify-center rounded-full",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      haptic
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
    </Pressable>
  )
}

function useGatePalette() {
  const { colorScheme } = useColorScheme()
  return GREEN_TILL_THEME[colorScheme]
}
