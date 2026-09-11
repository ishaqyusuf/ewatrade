import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

import type { CustomerNotificationGuestChannel } from "./customer-notification-guest-presentation"

export function CustomerNotificationContactChannel({
  channel,
  disabled,
  onChange,
}: {
  channel: CustomerNotificationGuestChannel
  disabled: boolean
  onChange(channel: CustomerNotificationGuestChannel): void
}) {
  return (
    <View className="flex-row gap-2">
      {(
        [
          ["email", "Email"],
          ["whatsapp", "Phone"],
        ] as const
      ).map(([value, label]) => {
        const selected = channel === value
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            className={
              selected
                ? "min-h-11 flex-1 items-center justify-center rounded-full border border-primary bg-primary/10 px-3"
                : "min-h-11 flex-1 items-center justify-center rounded-full border border-border bg-background px-3"
            }
            disabled={disabled}
            haptic
            key={value}
            onPress={() => onChange(value)}
          >
            <Text
              className={
                selected
                  ? "text-sm font-bold text-primary"
                  : "text-sm font-medium text-muted-foreground"
              }
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
