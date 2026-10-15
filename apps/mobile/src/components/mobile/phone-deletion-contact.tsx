import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { ActionButton } from "./action-button"
import { FormField } from "./form-field"

type Props = {
  email: string
  code: string
  status: "ready" | "sending-code" | "submitting-request"
  notice: string | null
  onEmailChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSendCode: () => void
}

export function PhoneDeletionContact({
  email,
  code,
  status,
  notice,
  onEmailChange,
  onCodeChange,
  onSendCode,
}: Props) {
  const isSendingCode = status === "sending-code"
  const disabled = status !== "ready"
  return (
    <View className="gap-4 py-3">
      <Text className="text-sm leading-6 text-muted-foreground">
        Verify an email for your deletion request and outcome. Your phone number
        stays your sign-in method.
      </Text>
      <FormField
        label="Contact email"
        accessibilityLabel="Deletion contact email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        editable={!disabled}
        onChangeText={onEmailChange}
        placeholder="you@example.com"
      />
      <ActionButton
        variant="outline"
        isLoading={isSendingCode}
        loadingLabel="Sending code…"
        disabled={disabled || !email.trim()}
        onPress={onSendCode}
      >
        Send email code
      </ActionButton>
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm leading-5 text-muted-foreground"
        >
          {notice}
        </Text>
      ) : null}
      <FormField
        label="Email verification code"
        accessibilityLabel="Deletion email verification code"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        editable={!disabled}
        onChangeText={onCodeChange}
        placeholder="Six-digit code"
      />
    </View>
  )
}
