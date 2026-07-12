import { useColors } from "@/hooks/use-color";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import {
  type NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  type TextInputKeyPressEventData,
  View,
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
  const colors = useColors();
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");
  const cells = digits.map((digit, index) => ({
    digit,
    id: `otp-cell-${index + 1}`,
  }));

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
      {cells.map(({ digit, id }, index) => (
        <TextInput
          accessibilityLabel={`OTP digit ${index + 1}`}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="numeric"
          keyboardType="number-pad"
          key={id}
          maxLength={index === 0 ? length : 1}
          onChangeText={(nextValue) => updateDigit(index, nextValue)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          ref={(node) => {
            refs.current[index] = node;
          }}
          selectTextOnFocus
          style={[
            styles.cell,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          value={digit}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    height: 56,
    textAlign: "center",
  },
});
