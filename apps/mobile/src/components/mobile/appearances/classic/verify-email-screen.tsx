import { MobileScreen } from "@/components/mobile/screen"
import type { VerifyEmailPresentationProps } from "@/components/mobile/verify-email/verify-email-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"

export function ClassicVerifyEmailScreen({
  authEntryHref,
  email,
  mode,
  otp,
  resend,
  keypad,
}: VerifyEmailPresentationProps) {
  const largeText = useLargeTextLayout()
  return (
    <MobileScreen
      contentClassName="justify-between gap-6"
      keyboardBottomOffset={40}
    >
      <View className="gap-6">
        <View className="flex-row items-center justify-between gap-2">
          <Pressable
            accessibilityLabel="Use another email"
            accessibilityRole="button"
            className="size-12 items-center justify-center rounded-full active:bg-muted"
            haptic
            href={authEntryHref}
          >
            <Icon className="size-base text-foreground" name="ChevronLeft" />
          </Pressable>
          <Text
            className="flex-1 text-center text-[11px] font-bold uppercase tracking-[1.3px] text-primary"
            numberOfLines={largeText ? undefined : 1}
          >
            {mode === "login" ? "Login code" : "Email verification"}
          </Text>
          <View className="size-12" />
        </View>
        <View className="items-center gap-7 py-4">
          <View className="items-center gap-3">
            <Text
              accessibilityRole="header"
              className="max-w-[280px] text-center text-[25px] font-extrabold [-rn-line-height:31] text-foreground"
            >
              Enter the code we sent you
            </Text>
            <Text className="max-w-[285px] text-center text-[13px] [-rn-line-height:20] text-muted-foreground">
              We sent a 6-digit code to {email}.
            </Text>
          </View>
          <View
            accessibilityLabel="Verify and continue"
            className="w-full items-center gap-4"
          >
            {otp}
            {resend}
          </View>
        </View>
        <View className="gap-4 pb-8">{keypad}</View>
      </View>
    </MobileScreen>
  )
}
