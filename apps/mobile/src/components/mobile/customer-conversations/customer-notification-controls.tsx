import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

import { CustomerNotificationAccountContent } from "./customer-notification-account-content"
import { CustomerNotificationGuestContent } from "./customer-notification-guest-content"
import { CustomerNotificationSummaryControls } from "./customer-notification-summary-controls"
import { useCustomerNotificationControls } from "./use-customer-notification-controls"

export function CustomerNotificationControls({
  accountAccess,
  available,
  blocked,
  conversationId,
  onNotice,
  publicToken,
}: {
  accountAccess: boolean
  available: boolean
  blocked: boolean
  conversationId: string
  onNotice(message: string): void
  publicToken: string
}) {
  const controls = useCustomerNotificationControls({
    accountAccess,
    conversationId,
    onNotice,
    publicToken,
  })

  return (
    <View className="gap-2 py-1">
      {blocked ? (
        <Text className="text-xs leading-4 text-muted-foreground">
          Conversation notifications are paused while this Store is blocked. You
          can still manage your notification settings and contacts.
        </Text>
      ) : null}
      {!available || !controls.expanded || accountAccess ? (
        <CustomerNotificationSummaryControls
          available={available}
          blocked={blocked}
          busy={controls.busy}
          expanded={controls.expanded}
          onNotifyWhenAvailable={() => void controls.notifyWhenAvailable()}
          onToggle={() => controls.setExpanded((current: boolean) => !current)}
        />
      ) : null}

      {controls.expanded && accountAccess ? (
        <CustomerNotificationAccountContent
          busy={controls.busy}
          emailEligible={controls.preference.data?.emailEligible ?? false}
          error={controls.preference.isError}
          loading={controls.preference.isLoading}
          onRetry={() => void controls.preference.refetch()}
          onSave={(preference) => void controls.savePreference(preference)}
          preference={controls.preference.data?.preference}
        />
      ) : null}

      {controls.expanded && !accountAccess ? (
        <CustomerNotificationGuestContent
          busy={controls.busy}
          channel={controls.channel}
          code={controls.code}
          consented={controls.consented}
          contacts={controls.contacts.data ?? []}
          destination={controls.destination}
          loading={controls.contacts.isLoading}
          loadError={controls.contacts.isError}
          onChannelChange={controls.changeChannel}
          onChangeContact={controls.changeContact}
          onCodeChange={controls.setCode}
          onCollapse={() => controls.setExpanded(false)}
          onConsentChange={controls.setConsented}
          onDestinationChange={controls.setDestination}
          onRemoveContact={(contactId) =>
            void controls.removeContact(contactId)
          }
          onRequestCode={() => void controls.requestCode()}
          onRequestNewCode={() => void controls.requestCode()}
          onRetry={() => void controls.contacts.refetch()}
          onVerifyCode={() => void controls.confirmCode()}
          verificationId={controls.verificationId}
        />
      ) : null}
    </View>
  )
}
