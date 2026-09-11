import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function CustomerNotificationVerificationRecovery({
  busy,
  onChangeContact,
  onRequestNewCode,
}: {
  busy: boolean
  onChangeContact(): void
  onRequestNewCode(): void
}) {
  return (
    <View className="flex-row gap-2">
      <Pressable
        accessibilityRole="button"
        className="min-h-11 flex-1 items-center justify-center rounded-full px-2"
        disabled={busy}
        haptic
        onPress={onChangeContact}
      >
        <Text className="text-xs font-bold text-muted-foreground">
          Change contact
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 flex-1 items-center justify-center rounded-full px-2"
        disabled={busy}
        haptic
        onPress={onRequestNewCode}
      >
        <Text className="text-xs font-bold text-primary">
          Request a new code
        </Text>
      </Pressable>
    </View>
  )
}
