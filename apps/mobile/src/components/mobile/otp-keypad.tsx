import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import Svg, { Path } from "react-native-svg"

export const OTP_KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["paste", "0", "delete"],
] as const

type OtpKeypadKey = (typeof OTP_KEYPAD_ROWS)[number][number]

type OtpKeypadProps = {
  disabled?: boolean
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  onPastePress: () => void
  variant?: "default" | "market-tally" | "green-till"
}

const DIGIT_LETTERS: Partial<Record<OtpKeypadKey, string>> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
}

export function OtpKeypad({
  disabled = false,
  onDeletePress,
  onDigitPress,
  onPastePress,
  variant = "default",
}: OtpKeypadProps) {
  const largeTextLayout = useLargeTextLayout()
  const isMarketTally = variant === "market-tally"
  if (variant === "green-till")
    return (
      <View className="w-full gap-1.5">
        {OTP_KEYPAD_ROWS.map((row) => (
          <View className="flex-row gap-1.5" key={row.join("-")}>
            {row.map((key) => (
              <GreenTillKey
                disabled={disabled}
                key={key}
                label={key}
                largeTextLayout={largeTextLayout}
                onDeletePress={onDeletePress}
                onDigitPress={onDigitPress}
                onPastePress={onPastePress}
              />
            ))}
          </View>
        ))}
      </View>
    )

  return (
    <View
      className={cn(
        "w-full max-w-[360px] self-center",
        isMarketTally && "border-2 border-market-ink",
      )}
    >
      <View className={isMarketTally ? "gap-0" : "gap-2.5"}>
        {OTP_KEYPAD_ROWS.map((row, rowIndex) => (
          <View
            className={isMarketTally ? "flex-row gap-0" : "flex-row gap-2.5"}
            key={row.join("-")}
          >
            {row.map((key, columnIndex) => (
              <OtpKey
                columnIndex={columnIndex}
                disabled={disabled}
                isMarketTally={isMarketTally}
                key={key}
                label={key}
                largeTextLayout={largeTextLayout}
                onDeletePress={onDeletePress}
                onDigitPress={onDigitPress}
                onPastePress={onPastePress}
                rowIndex={rowIndex}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function OtpKey({
  columnIndex,
  disabled,
  isMarketTally,
  label,
  largeTextLayout,
  onDeletePress,
  onDigitPress,
  onPastePress,
  rowIndex,
}: {
  columnIndex: number
  disabled: boolean
  isMarketTally: boolean
  label: OtpKeypadKey
  largeTextLayout: boolean
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  onPastePress: () => void
  rowIndex: number
}) {
  const isDigit = /^\d$/.test(label)
  const letters = DIGIT_LETTERS[label]
  const defaultKeyHeightClassName = largeTextLayout ? "h-[76px]" : "h-[58px]"

  if (isMarketTally) {
    const marketKeyClassName = cn(
      "flex-1 items-center justify-center border-market-line",
      largeTextLayout ? "h-[94px]" : "h-[76px]",
      label === "paste" ? "bg-market-marigold" : "bg-market-field",
      rowIndex < OTP_KEYPAD_ROWS.length - 1 && "border-b",
      columnIndex < 2 && "border-r",
      disabled && "opacity-60",
    )

    if (label === "paste") {
      return (
        <Pressable
          accessibilityLabel="Paste verification code"
          disabled={disabled}
          haptic
          onPress={onPastePress}
          className={marketKeyClassName}
          transition
        >
          <Text className="text-[11px] font-extrabold text-market-on-marigold">
            Paste
          </Text>
        </Pressable>
      )
    }

    if (label === "delete") {
      return (
        <Pressable
          accessibilityLabel="Delete last digit"
          disabled={disabled}
          haptic
          onPress={onDeletePress}
          className={marketKeyClassName}
          transition
        >
          <Text className="text-[11px] font-extrabold text-market-paprika">
            Delete
          </Text>
        </Pressable>
      )
    }

    return (
      <Pressable
        accessibilityLabel={`Enter digit ${label}`}
        disabled={disabled || !isDigit}
        haptic
        onPress={() => onDigitPress(label)}
        className={marketKeyClassName}
        transition
      >
        <View className="flex-row items-baseline gap-0.5">
          <Text className="text-2xl font-extrabold tabular-nums [-rn-line-height:28] text-market-ink">
            {label}
          </Text>
          {letters ? (
            <Text className="text-[7px] font-bold uppercase [-rn-line-height:12] text-market-muted-ink">
              {letters}
            </Text>
          ) : null}
        </View>
      </Pressable>
    )
  }

  const keyClassName = cn(
    defaultKeyHeightClassName,
    "flex-1 items-center justify-center rounded-xl bg-muted active:bg-accent",
    disabled && "opacity-60",
  )

  if (label === "paste") {
    return (
      <Pressable
        accessibilityLabel="Paste verification code"
        className={keyClassName}
        disabled={disabled}
        haptic
        onPress={onPastePress}
        transition
      >
        <Icon
          className="size-base text-muted-foreground"
          name="ClipboardList"
        />
        <Text className="mt-0.5 text-[10px] font-medium text-muted-foreground">
          Paste
        </Text>
      </Pressable>
    )
  }

  if (label === "delete") {
    return (
      <Pressable
        accessibilityLabel="Delete last digit"
        className={keyClassName}
        disabled={disabled}
        haptic
        onPress={onDeletePress}
        transition
      >
        <Icon className="size-base text-foreground" name="Delete" />
      </Pressable>
    )
  }

  return (
    <Pressable
      accessibilityLabel={`Enter digit ${label}`}
      className={keyClassName}
      disabled={disabled || !isDigit}
      haptic
      onPress={() => onDigitPress(label)}
      transition
    >
      <View className="flex-row items-baseline gap-0.5">
        <Text className="text-[21px] font-medium [-rn-line-height:24] text-foreground">
          {label}
        </Text>
        {letters ? (
          <Text className="text-[10px] font-medium [-rn-line-height:12] text-muted-foreground">
            {letters}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

/** 03 Market Preview keypad: white keys, plain Paste and a backspace mark. */
function GreenTillKey({
  disabled,
  label,
  largeTextLayout,
  onDeletePress,
  onDigitPress,
  onPastePress,
}: {
  disabled: boolean
  label: OtpKeypadKey
  largeTextLayout: boolean
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  onPastePress: () => void
}) {
  const colors = useColors()
  const height = largeTextLayout ? "h-[64px]" : "h-[46px]"
  if (label === "paste" || label === "delete") {
    const paste = label === "paste"
    return (
      <Pressable
        accessibilityLabel={
          paste ? "Paste verification code" : "Delete last digit"
        }
        className={cn(
          height,
          "flex-1 items-center justify-center rounded-[13px] active:bg-accent",
          disabled && "opacity-60",
        )}
        disabled={disabled}
        haptic
        onPress={paste ? onPastePress : onDeletePress}
        transition
      >
        {paste ? (
          <Text className="text-[12.5px] font-extrabold [-rn-line-height:18] text-primary">
            Paste
          </Text>
        ) : (
          <Svg
            accessible={false}
            fill="none"
            height={20}
            stroke={colors.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.9}
            viewBox="0 0 24 24"
            width={20}
          >
            <Path d="M10 5a2 2 0 0 0-1.34.52l-6.33 5.74a1 1 0 0 0 0 1.48l6.33 5.74A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
            <Path d="m12 9 6 6M18 9l-6 6" />
          </Svg>
        )}
      </Pressable>
    )
  }
  return (
    <Pressable
      accessibilityLabel={`Enter digit ${label}`}
      className={cn(
        height,
        "flex-1 items-center justify-center rounded-[13px] bg-card shadow-sm active:bg-accent",
        disabled && "opacity-60",
      )}
      disabled={disabled}
      haptic
      onPress={() => onDigitPress(label)}
      transition
    >
      <Text className="text-[20px] font-bold [-rn-line-height:24] text-foreground">
        {label}
      </Text>
    </Pressable>
  )
}
