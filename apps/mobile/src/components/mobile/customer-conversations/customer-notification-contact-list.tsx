import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export type CustomerNotificationContactItem = {
  contactId: string
  maskedDestination: string
  state: string
}

export function CustomerNotificationContactList({
  busy,
  contacts,
  loading,
  loadError,
  onRemoveContact,
  onRetry,
}: {
  busy: boolean
  contacts: CustomerNotificationContactItem[]
  loading: boolean
  loadError: boolean
  onRemoveContact(contactId: string): void
  onRetry(): void
}) {
  return (
    <View className="gap-2">
      {loading ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          Loading verified contacts…
        </Text>
      ) : null}
      {loadError ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-full border border-border px-4"
          onPress={onRetry}
        >
          <Text className="text-sm font-bold text-foreground">
            Retry verified contacts
          </Text>
        </Pressable>
      ) : null}
      {contacts.map((contact) => (
        <View
          className="min-h-11 flex-row items-center gap-3 border-t border-border"
          key={contact.contactId}
        >
          <View className="min-w-0 flex-1">
            <Text className="text-sm text-foreground">
              {contact.maskedDestination}
            </Text>
            <Text className="text-xs capitalize text-muted-foreground">
              {contact.state}
            </Text>
          </View>
          {contact.state !== "revoked" ? (
            <Pressable
              accessibilityLabel={`Remove ${contact.maskedDestination}`}
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              disabled={busy}
              onPress={() => onRemoveContact(contact.contactId)}
            >
              <Text className="text-sm font-bold text-destructive">Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  )
}
