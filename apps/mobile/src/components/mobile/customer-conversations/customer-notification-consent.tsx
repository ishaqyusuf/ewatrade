import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function CustomerNotificationConsent({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange(checked: boolean): void
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="min-h-11 flex-row items-start gap-3"
      disabled={disabled}
      onPress={() => onChange(!checked)}
    >
      <View
        className={
          checked
            ? "mt-1 size-5 items-center justify-center rounded-md border border-primary bg-primary"
            : "mt-1 size-5 rounded-md border border-border bg-background"
        }
      >
        {checked ? (
          <Icon className="size-xs text-primary-foreground" name="Check" />
        ) : null}
      </View>
      <Text className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
        {label}
      </Text>
    </Pressable>
  )
}
