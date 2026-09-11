import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type StoreConversationNotificationPreferenceProjection,
  prioritizeStoreConversationNotificationChannel,
} from "@ewatrade/service-commerce"

export function CustomerNotificationAccountChannels({
  busy,
  emailEligible,
  onSave,
  preference,
}: {
  busy: boolean
  emailEligible: boolean
  onSave(preference: StoreConversationNotificationPreferenceProjection): void
  preference: StoreConversationNotificationPreferenceProjection
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm text-foreground">Try this channel first</Text>
      <View className="flex-row gap-2">
        {(["push", "email", "whatsapp"] as const).map((channel) => {
          const disabled =
            busy ||
            channel === "whatsapp" ||
            (channel === "email" && !emailEligible)
          const active = preference.orderedChannels[0] === channel
          const label =
            channel === "push"
              ? "App"
              : channel === "email"
                ? "Email"
                : "WhatsApp"
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: active }}
              className={
                active
                  ? "min-h-11 flex-1 items-center justify-center rounded-full border border-primary bg-primary px-2"
                  : "min-h-11 flex-1 items-center justify-center rounded-full border border-border px-2"
              }
              disabled={disabled}
              key={channel}
              onPress={() =>
                onSave({
                  ...preference,
                  orderedChannels:
                    prioritizeStoreConversationNotificationChannel({
                      channel,
                      orderedChannels: preference.orderedChannels,
                    }),
                })
              }
            >
              <Text
                className={
                  active
                    ? "text-xs font-bold text-primary-foreground"
                    : disabled
                      ? "text-xs font-bold text-muted-foreground opacity-40"
                      : "text-xs font-bold text-foreground"
                }
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
