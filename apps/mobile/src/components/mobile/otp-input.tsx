import { cn } from "@/lib/utils";
import { useRef } from "react";
import {
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";

type OtpInputProps = {
  className?: string;
  length?: number;
  onChange: (value: string) => void;
  value: string;
};

export function OtpInput({
  className,
  length = 6,
  onChange,
  value,
}: OtpInputProps) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  const updateDigit = (index: number, nextValue: string) => {
    const nextDigits = [...digits];
    const numericValue = nextValue.replace(/\D/g, "");

    if (!numericValue) {
      nextDigits[index] = "";
      onChange(nextDigits.join(""));
      return;
    }

    for (let offset = 0; offset < numericValue.length; offset++) {
      const targetIndex = index + offset;
      if (targetIndex >= length) break;
      nextDigits[targetIndex] = numericValue[offset] ?? "";
    }

    onChange(nextDigits.join(""));

    const nextFocusIndex = Math.min(index + numericValue.length, length - 1);
    refs.current[nextFocusIndex]?.focus();
  };

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (event.nativeEvent.key !== "Backspace" || digits[index]) return;
    refs.current[Math.max(index - 1, 0)]?.focus();
  };

  return (
    <View className={cn("flex-row justify-between gap-2", className)}>
      {digits.map((digit, index) => (
        <TextInput
          accessibilityLabel={`OTP digit ${index + 1}`}
          autoComplete="sms-otp"
          className="h-14 flex-1 rounded-xl border border-border bg-card text-center text-xl font-bold text-foreground shadow-sm shadow-black/5"
          inputMode="numeric"
          keyboardType="number-pad"
          key={`otp-${index}`}
          maxLength={index === 0 ? length : 1}
          onChangeText={(nextValue) => updateDigit(index, nextValue)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          ref={(node) => {
            refs.current[index] = node;
          }}
          selectTextOnFocus
          textContentType="oneTimeCode"
          value={digit}
        />
      ))}
    </View>
  );
}
