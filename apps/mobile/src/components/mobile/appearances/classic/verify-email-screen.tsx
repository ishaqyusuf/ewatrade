import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { VerifyStage } from "@/components/mobile/green-till/auth-stage"
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
      subtitle={
        <>
          Sent to <Text className="font-bold text-foreground">{email}</Text>
        </>
      }
      backHref={authEntryHref}
      backLabel="Use another email"
      stage={<VerifyStage email={email} />}
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
        <Text className="text-[13px] font-extrabold [-rn-line-height:18] text-primary">
          Use another email
        </Text>
      </Pressable>
    </GreenTillAuthScreen>
  )
}
