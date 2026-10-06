import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useState } from "react"
import { Platform, View } from "react-native"

export function FinanceBankDateField({
  label,
  value,
  onChange,
  minimum,
  maximum,
  disabled,
}: {
  label: string
  value: string
  onChange: (day: string) => void
  minimum: string
  maximum: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  const min = new Date(`${minimum}T00:00:00.000Z`)
  const max = new Date(`${maximum}T00:00:00.000Z`)
  const available =
    Number.isFinite(min.getTime()) &&
    Number.isFinite(max.getTime()) &&
    min <= max
  const selected = Number.isFinite(parsed.getTime()) ? parsed : max
  const clamped = new Date(
    Math.max(min.getTime(), Math.min(max.getTime(), selected.getTime())),
  )
  return (
    <View className="gap-2">
      <FormField
        label={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="none"
        maxLength={10}
        helper="YYYY-MM-DD · UTC"
        actionLabel={Platform.OS === "web" ? undefined : "Calendar"}
        onActionPress={() => {
          if (!disabled && available) setOpen(true)
        }}
      />
      {open && !disabled && available && Platform.OS !== "web" ? (
        <>
          <DateTimePicker
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            value={clamped}
            minimumDate={min}
            maximumDate={max}
            timeZoneName="UTC"
            onChange={(event, date) => {
              if (Platform.OS !== "ios" || event.type === "dismissed")
                setOpen(false)
              if (event.type === "set" && date)
                onChange(date.toISOString().slice(0, 10))
            }}
          />
          {Platform.OS === "ios" ? (
            <ActionButton variant="outline" onPress={() => setOpen(false)}>
              Done choosing date
            </ActionButton>
          ) : null}
        </>
      ) : null}
    </View>
  )
}
