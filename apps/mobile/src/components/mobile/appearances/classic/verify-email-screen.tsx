import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import type { VerifyEmailPresentationProps } from "@/components/mobile/verify-email/verify-email-presentation"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function ClassicVerifyEmailScreen({
  authEntryHref,
  email,
  mode,
  otp,
  resend,
  keypad,
}: VerifyEmailPresentationProps) {
  return (
    <GreenTillAuthScreen
      eyebrow={mode === "login" ? "Login code" : "Email verification"}
      title="Enter the code we sent"
      subtitle={`Sent to ${email}`}
      backHref={authEntryHref}
      backLabel="Use another email"
      testID="green-gate-verify"
    >
      <View className="gap-3 py-1">
        {otp}
        {resend}
      </View>
      {keypad}
      <Pressable
        accessibilityRole="button"
        className="min-h-11 items-center justify-center"
        href={authEntryHref}
      >
        <Text className="text-sm font-bold [-rn-line-height:21] text-primary">
          Use another email
        </Text>
      </Pressable>
    </GreenTillAuthScreen>
  )
}
