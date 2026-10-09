import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useState } from "react"
import { Platform } from "react-native"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
export function LedgerEffectiveTimeField({
  value,
  onChange,
  disabled,
  exactRecovery = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  exactRecovery?: boolean
}) {
  const [mode, setMode] = useState<"date" | "time" | null>(null)
  const date = new Date(value)
  const valid = Number.isFinite(date.getTime())
  if (exactRecovery || Platform.OS === "web")
    return (
      <FormField
        label="Original effective time (ISO UTC)"
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        maxLength={24}
      />
    )
  return (
    <View className="gap-3">
      <Text className="text-sm font-bold">Effective date and time</Text>
      <Text>
        {valid ? date.toLocaleString() : "Choose the effective date and time"}
      </Text>
      <View className="flex-row flex-wrap gap-3">
        <ActionButton
          variant="outline"
          disabled={disabled}
          onPress={() => setMode("date")}
        >
          Choose date
        </ActionButton>
        <ActionButton
          variant="outline"
          disabled={disabled}
          onPress={() => setMode("time")}
        >
          Choose time
        </ActionButton>
      </View>
      {mode ? (
        <>
          <DateTimePicker
            value={valid ? date : new Date()}
            mode={mode}
            onChange={(event, next) => {
              if (Platform.OS !== "ios" || event.type === "dismissed")
                setMode(null)
              if (!disabled && event.type === "set" && next)
                onChange(next.toISOString())
            }}
          />
          {Platform.OS === "ios" ? (
            <ActionButton onPress={() => setMode(null)}>Done</ActionButton>
          ) : null}
        </>
      ) : null}
    </View>
  )
}
