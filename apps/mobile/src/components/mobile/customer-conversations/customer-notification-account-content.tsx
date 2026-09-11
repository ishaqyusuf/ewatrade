import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import type { StoreConversationNotificationPreferenceProjection } from "@ewatrade/service-commerce"
import { Switch } from "react-native"

import { CustomerNotificationAccountChannels } from "./customer-notification-account-channels"

export function CustomerNotificationAccountContent({
  busy,
  emailEligible,
  error,
  loading,
  onRetry,
  onSave,
  preference,
}: {
  busy: boolean
  emailEligible: boolean
  error: boolean
  loading: boolean
  onRetry(): void
  onSave(preference: StoreConversationNotificationPreferenceProjection): void
  preference?: StoreConversationNotificationPreferenceProjection
}) {
  const colors = useColors()
  if (loading) {
    return (
      <Text
        accessibilityLiveRegion="polite"
        className="px-1 pb-2 text-xs text-muted-foreground"
      >
        Loading notification preferences…
      </Text>
    )
  }
  if (error) {
    return (
      <Pressable
        accessibilityRole="button"
        className="min-h-11 items-center justify-center rounded-full border border-border px-4"
        onPress={onRetry}
      >
        <Text className="text-sm font-bold text-foreground">
          Retry notification settings
        </Text>
      </Pressable>
    )
  }
  if (!preference) return null
  return (
    <View className="gap-3 px-1 pb-2">
      <PreferenceSwitch
        accessibilityLabel="Unread Store reply notifications"
        body="Alert me when a Store reply remains unread."
        busy={busy}
        label="Unread replies"
        onValueChange={(unreadEnabled) =>
          onSave({ ...preference, unreadEnabled })
        }
        trackColor={colors}
        value={preference.unreadEnabled}
      />
      <PreferenceSwitch
        accessibilityLabel="Store reopening notifications"
        body="Alert me after a Store chat becomes available again."
        busy={busy}
        label="Store reopening"
        onValueChange={(reopeningEnabled) =>
          onSave({ ...preference, reopeningEnabled })
        }
        trackColor={colors}
        value={preference.reopeningEnabled}
      />
      <CustomerNotificationAccountChannels
        busy={busy}
        emailEligible={emailEligible}
        onSave={onSave}
        preference={preference}
      />
      <Text className="text-xs text-muted-foreground">
        {emailEligible
          ? "If your first choice is unavailable, ẸwáTrade safely tries the next eligible channel. "
          : "Verify your account email before choosing Email. "}
        WhatsApp remains unavailable until current Store policy and provider
        readiness allow it.
      </Text>
    </View>
  )
}

function PreferenceSwitch({
  accessibilityLabel,
  body,
  busy,
  label,
  onValueChange,
  trackColor,
  value,
}: {
  accessibilityLabel: string
  body: string
  busy: boolean
  label: string
  onValueChange(value: boolean): void
  trackColor: { muted: string; primary: string }
  value: boolean
}) {
  return (
    <View className="min-h-11 flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{body}</Text>
      </View>
      <Switch
        accessibilityLabel={accessibilityLabel}
        disabled={busy}
        onValueChange={onValueChange}
        trackColor={{ false: trackColor.muted, true: trackColor.primary }}
        value={value}
      />
    </View>
  )
}
