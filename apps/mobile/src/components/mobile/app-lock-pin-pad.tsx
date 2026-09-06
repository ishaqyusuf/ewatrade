import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { APP_LOCK_QUIET_SEAL_LAYOUT } from "@/lib/app-lock-quiet-seal-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StyleSheet, View } from "react-native"

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
  if (variant === "quiet-seal") {
    return (
      <View style={quietSealStyles.container}>
        <QuietSealPinCodeCells codeLength={codeLength} value={value} />

        <View style={quietSealStyles.keypad}>
          {PIN_KEYPAD_ROWS.map((row) => (
            <View style={quietSealStyles.row} key={row.join("-")}>
              {row.map((digit) => (
                <QuietSealPinKey
                  disabled={disabled}
                  key={digit}
                  label={digit}
                  onPress={() => onDigitPress(digit)}
                />
              ))}
            </View>
          ))}

          <View style={quietSealStyles.row}>
            {showBiometric && onBiometricPress ? (
              <QuietSealIconKey
                accessibilityLabel="Use fingerprint"
                disabled={disabled}
                icon="FingerPrintScan"
                onPress={onBiometricPress}
              />
            ) : (
              <View style={quietSealStyles.blankKey} />
            )}

            <QuietSealPinKey
              disabled={disabled}
              label="0"
              onPress={() => onDigitPress("0")}
            />

            <QuietSealIconKey
              accessibilityLabel="Delete last digit"
              disabled={disabled}
              icon="Delete"
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
  const marketDay = useMarketDayPalette()

  return (
    <View style={quietSealStyles.cells}>
      {Array.from({ length: codeLength }, (_, index) => {
        const isFilled = index < value.length
        const isActive = index === value.length && value.length < codeLength

        return (
          <View
            accessibilityLabel={`PIN digit ${index + 1}${isFilled ? ", filled" : ", empty"}`}
            accessible
            key={`app-lock-quiet-seal-pin-${index + 1}`}
            style={[
              quietSealStyles.cell,
              {
                backgroundColor: isFilled
                  ? marketDay.marigold
                  : marketDay.canvas,
                borderColor: isActive ? marketDay.paprika : marketDay.line,
              },
            ]}
          >
            {isFilled ? (
              <View
                style={[
                  quietSealStyles.cellCore,
                  { backgroundColor: marketDay.palm },
                ]}
              />
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
  onPress,
}: {
  disabled: boolean
  label: string
  onPress: () => void
}) {
  const marketDay = useMarketDayPalette()

  return (
    <Pressable
      accessibilityLabel={`Enter digit ${label}`}
      disabled={disabled}
      haptic
      onPress={onPress}
      style={({ pressed }) => [
        quietSealStyles.key,
        {
          backgroundColor: pressed ? marketDay.softBand : marketDay.canvas,
          borderBottomColor: marketDay.line,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        style={[quietSealStyles.keyText, { color: marketDay.ink }]}
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
  onPress,
  tone = "default",
}: {
  accessibilityLabel: string
  disabled: boolean
  icon: "Delete" | "FingerPrintScan"
  onPress: () => void
  tone?: "action" | "default"
}) {
  const marketDay = useMarketDayPalette()
  const color = tone === "action" ? marketDay.paprika : marketDay.ink

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      haptic
      onPress={onPress}
      style={({ pressed }) => [
        quietSealStyles.key,
        {
          backgroundColor: pressed ? marketDay.softBand : marketDay.canvas,
          borderBottomColor:
            tone === "action" ? marketDay.paprika : marketDay.line,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {icon === "Delete" ? (
        <Text style={[quietSealStyles.backspaceGlyph, { color }]}>⌫</Text>
      ) : (
        <Icon color={color} name={icon} size={21} />
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

const quietSealStyles = StyleSheet.create({
  backspaceGlyph: {
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 28,
    textAlign: "center",
  },
  blankKey: {
    height: APP_LOCK_QUIET_SEAL_LAYOUT.keyHeight,
    width: APP_LOCK_QUIET_SEAL_LAYOUT.keyWidth,
  },
  cell: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: APP_LOCK_QUIET_SEAL_LAYOUT.pinCellSize,
    justifyContent: "center",
    width: APP_LOCK_QUIET_SEAL_LAYOUT.pinCellSize,
  },
  cellCore: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  cells: {
    alignItems: "center",
    flexDirection: "row",
    gap: APP_LOCK_QUIET_SEAL_LAYOUT.pinCellGap,
    justifyContent: "center",
    maxWidth: APP_LOCK_QUIET_SEAL_LAYOUT.pinRailWidth,
    width: "100%",
  },
  container: {
    alignItems: "center",
    gap: 25,
    width: "100%",
  },
  key: {
    alignItems: "center",
    borderBottomWidth: 2,
    height: APP_LOCK_QUIET_SEAL_LAYOUT.keyHeight,
    justifyContent: "center",
    width: APP_LOCK_QUIET_SEAL_LAYOUT.keyWidth,
  },
  keyText: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
    textAlign: "center",
  },
  keypad: {
    gap: APP_LOCK_QUIET_SEAL_LAYOUT.keyRowGap,
    maxWidth: APP_LOCK_QUIET_SEAL_LAYOUT.keypadWidth,
    width: "100%",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
})
