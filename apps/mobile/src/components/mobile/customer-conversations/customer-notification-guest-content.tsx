import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

import {
  type CustomerNotificationContactItem,
  CustomerNotificationContactList,
} from "./customer-notification-contact-list"
import { CustomerNotificationGuestForm } from "./customer-notification-guest-form"
import {
  type CustomerNotificationGuestChannel,
  projectCustomerNotificationGuestSetup,
} from "./customer-notification-guest-presentation"

export function CustomerNotificationGuestContent({
  busy,
  channel,
  code,
  consented,
  contacts,
  destination,
  loading,
  loadError,
  onChannelChange,
  onChangeContact,
  onCodeChange,
  onCollapse,
  onConsentChange,
  onDestinationChange,
  onRemoveContact,
  onRequestCode,
  onRequestNewCode,
  onRetry,
  onVerifyCode,
  verificationId,
}: {
  busy: boolean
  channel: CustomerNotificationGuestChannel
  code: string
  consented: boolean
  contacts: CustomerNotificationContactItem[]
  destination: string
  loading: boolean
  loadError: boolean
  onChannelChange(channel: CustomerNotificationGuestChannel): void
  onChangeContact(): void
  onCodeChange(value: string): void
  onCollapse(): void
  onConsentChange(value: boolean): void
  onDestinationChange(value: string): void
  onRemoveContact(contactId: string): void
  onRequestCode(): void
  onRequestNewCode(): void
  onRetry(): void
  onVerifyCode(): void
  verificationId: string | null
}) {
  const presentation = projectCustomerNotificationGuestSetup({
    channel,
    code,
    consented,
    destination,
    verificationId,
  })
  return (
    <View className="border-y border-border py-4">
      <View className="flex-row items-start gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-sm text-primary" name="Bell" />
        </View>
        <View className="min-w-0 flex-1">
          <View className="-mr-2 -mt-2 min-h-11 flex-row items-center justify-between gap-2">
            <View className="rounded-full bg-muted px-2 py-1">
              <Text className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {presentation.optionalLabel}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Collapse response notifications"
              accessibilityRole="button"
              className="min-h-11 min-w-11 items-center justify-center rounded-full"
              onPress={onCollapse}
            >
              <Icon
                className="size-xs rotate-180 text-muted-foreground"
                name="ChevronDown"
              />
            </Pressable>
          </View>
          <Text className="text-base font-extrabold leading-6 text-foreground">
            {presentation.title}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-muted-foreground">
            {presentation.body}
          </Text>
          <View className="mt-3 gap-2">
            <CustomerNotificationContactList
              busy={busy}
              contacts={contacts}
              loading={loading}
              loadError={loadError}
              onRemoveContact={onRemoveContact}
              onRetry={onRetry}
            />
            <CustomerNotificationGuestForm
              busy={busy}
              channel={channel}
              code={code}
              consented={consented}
              destination={destination}
              onChannelChange={onChannelChange}
              onChangeContact={onChangeContact}
              onCodeChange={onCodeChange}
              onConsentChange={onConsentChange}
              onDestinationChange={onDestinationChange}
              onRequestCode={onRequestCode}
              onRequestNewCode={onRequestNewCode}
              onVerifyCode={onVerifyCode}
              verificationId={verificationId}
            />
          </View>
        </View>
      </View>
    </View>
  )
}
