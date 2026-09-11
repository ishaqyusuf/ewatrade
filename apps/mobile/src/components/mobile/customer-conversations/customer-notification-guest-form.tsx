import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { TextInput } from "react-native"

import { CustomerNotificationConsent } from "./customer-notification-consent"
import { CustomerNotificationContactChannel } from "./customer-notification-contact-channel"
import {
  type CustomerNotificationGuestChannel,
  projectCustomerNotificationGuestSetup,
} from "./customer-notification-guest-presentation"
import { CustomerNotificationVerificationRecovery } from "./customer-notification-verification-recovery"

export function CustomerNotificationGuestForm({
  busy,
  channel,
  code,
  consented,
  destination,
  onChannelChange,
  onChangeContact,
  onCodeChange,
  onConsentChange,
  onDestinationChange,
  onRequestCode,
  onRequestNewCode,
  onVerifyCode,
  verificationId,
}: {
  busy: boolean
  channel: CustomerNotificationGuestChannel
  code: string
  consented: boolean
  destination: string
  onChannelChange(channel: CustomerNotificationGuestChannel): void
  onChangeContact(): void
  onCodeChange(value: string): void
  onConsentChange(value: boolean): void
  onDestinationChange(value: string): void
  onRequestCode(): void
  onRequestNewCode(): void
  onVerifyCode(): void
  verificationId: string | null
}) {
  const colors = useColors()
  const presentation = projectCustomerNotificationGuestSetup({
    channel,
    code,
    consented,
    destination,
    verificationId,
  })
  const actionEnabled = presentation.actionEnabled && !busy

  return (
    <View className="gap-2">
      {!verificationId ? (
        <>
          <CustomerNotificationContactChannel
            channel={channel}
            disabled={busy}
            onChange={onChannelChange}
          />
          <TextInput
            accessibilityLabel={presentation.destinationAccessibilityLabel}
            autoCapitalize="none"
            autoComplete={channel === "email" ? "email" : "tel"}
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-base text-foreground"
            editable={!busy}
            keyboardType={channel === "email" ? "email-address" : "phone-pad"}
            onChangeText={onDestinationChange}
            placeholder={presentation.destinationPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            value={destination}
          />
          <CustomerNotificationConsent
            checked={consented}
            disabled={busy}
            label={presentation.consentLabel}
            onChange={onConsentChange}
          />
        </>
      ) : (
        <TextInput
          accessibilityLabel="Six digit verification code"
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-base text-foreground"
          editable={!busy}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={onCodeChange}
          placeholder="6-digit code"
          placeholderTextColor={colors.mutedForeground}
          value={code}
        />
      )}
      <View
        accessible
        accessibilityLabel={presentation.scopeLabel}
        className="min-h-8 flex-row items-center gap-2"
      >
        <Icon className="size-xs text-primary" name="Check" />
        <Text className="text-xs text-muted-foreground">
          {presentation.scopeLabel}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        className={
          actionEnabled
            ? "min-h-11 items-center justify-center rounded-full bg-primary px-4"
            : "min-h-11 items-center justify-center rounded-full bg-muted px-4"
        }
        disabled={!actionEnabled}
        haptic
        onPress={verificationId ? onVerifyCode : onRequestCode}
      >
        <Text
          className={
            actionEnabled
              ? "text-sm font-bold text-primary-foreground"
              : "text-sm font-bold text-muted-foreground"
          }
        >
          {presentation.actionLabel}
        </Text>
      </Pressable>
      {verificationId ? (
        <CustomerNotificationVerificationRecovery
          busy={busy}
          onChangeContact={onChangeContact}
          onRequestNewCode={onRequestNewCode}
        />
      ) : null}
    </View>
  )
}
