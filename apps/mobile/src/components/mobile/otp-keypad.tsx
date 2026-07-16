import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { View } from "react-native"

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
}: OtpKeypadProps) {
  return (
    <View className="w-full max-w-[360px] self-center gap-2.5">
      {OTP_KEYPAD_ROWS.map((row) => (
        <View className="flex-row gap-2.5" key={row.join("-")}>
          {row.map((key) => (
            <OtpKey
              disabled={disabled}
              key={key}
              label={key}
              onDeletePress={onDeletePress}
              onDigitPress={onDigitPress}
              onPastePress={onPastePress}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

function OtpKey({
  disabled,
  label,
  onDeletePress,
  onDigitPress,
  onPastePress,
}: {
  disabled: boolean
  label: OtpKeypadKey
  onDeletePress: () => void
  onDigitPress: (digit: string) => void
  onPastePress: () => void
}) {
  const isDigit = /^\d$/.test(label)
  const letters = DIGIT_LETTERS[label]
  const keyClassName = cn(
    "h-[58px] flex-1 items-center justify-center rounded-xl bg-muted active:bg-accent",
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
      <Text className="text-[21px] font-medium leading-6 text-foreground">
        {label}
      </Text>
      {letters ? (
        <Text className="text-[10px] font-medium leading-3 text-muted-foreground">
          {letters}
        </Text>
      ) : null}
    </Pressable>
  )
}
