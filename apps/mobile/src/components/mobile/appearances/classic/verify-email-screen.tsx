import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { VerifyStage } from "@/components/mobile/green-till/auth-stage"
import type { VerifyEmailPresentationProps } from "@/components/mobile/verify-email/verify-email-presentation"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function ClassicVerifyEmailScreen({
  authEntryHref,
  email,
  channel = "email",
  mode,
  previewQaCode,
  otp,
  resend,
  keypad,
}: VerifyEmailPresentationProps) {
  return (
    <GreenTillAuthScreen
      eyebrow={
        channel === "whatsapp"
          ? "WhatsApp verification"
          : mode === "login"
            ? "Login code"
            : "Email verification"
      }
      title={
        previewQaCode
          ? `Use ${previewQaCode} to sign in`
          : "Enter the code we sent"
      }
      subtitle={
        previewQaCode ? (
          "The code expires in 10 minutes."
        ) : (
          <>
            Sent to <Text className="font-bold text-foreground">{email}</Text>
          </>
        )
      }
      backHref={authEntryHref}
      backLabel={
        channel === "whatsapp" ? "Use another number" : "Use another email"
      }
      stageCollapsed={Boolean(previewQaCode)}
      stage={<VerifyStage email={email} channel={channel} />}
      testID="green-gate-verify"
    >
      <View className="-mb-1 gap-2.5">
        {otp}
        {resend}
      </View>
      {keypad}
      <Pressable
        accessibilityRole="button"
        className="-mt-2 min-h-11 items-center justify-center"
        href={authEntryHref}
      >
        <Text className="text-xs font-extrabold [-rn-line-height:22] text-primary">
          {channel === "whatsapp" ? "Use another number" : "Use another email"}
        </Text>
      </Pressable>
    </GreenTillAuthScreen>
  )
}
