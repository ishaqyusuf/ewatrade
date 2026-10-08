import { ActionButton } from "@/components/mobile/action-button"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export type NoAccessPresentationProps = {
  email?: string
  onStart: () => void
  onShareEmail: () => void
  onPrivacy: () => void
  onCheck: () => void
  onSignOut: () => void
  checking?: boolean
}
export function ClassicNoAccessScreen({
  email,
  onStart,
  onShareEmail,
  onPrivacy,
  onCheck,
  onSignOut,
  checking,
}: NoAccessPresentationProps) {
  const rows = [
    {
      title: "Start a business",
      detail: "Set up a workspace with this account",
      icon: "Building2" as const,
      action: onStart,
    },
    {
      title: "Waiting for an invite?",
      detail: email
        ? `Copy ${email} to share with your employer`
        : "Ask your employer to invite your email",
      icon: "UserPlus" as const,
      action: onShareEmail,
    },
    {
      title: "Account and privacy",
      detail: "Terms, data and deletion",
      icon: "ShieldCheck" as const,
      action: onPrivacy,
    },
  ]
  return (
    <GreenTillAuthScreen
      eyebrow={email ? `Signed in as ${email}` : "Your account"}
      title="No business on this account yet"
      subtitle="Start your own business, or ask your employer to invite this email."
      testID="green-gate-no-access"
    >
      <View>
        {rows.map((row) => (
          <Pressable
            key={row.title}
            accessibilityRole="button"
            className="min-h-16 flex-row items-center gap-3 border-b border-border py-4"
            onPress={row.action}
            disabled={row.icon === "UserPlus" && !email}
          >
            <View className="size-11 items-center justify-center rounded-[14px] bg-accent">
              <Icon name={row.icon} className="size-base text-primary" />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-sm font-bold [-rn-line-height:21] text-foreground">
                {row.title}
              </Text>
              <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
                {row.detail}
              </Text>
            </View>
            <Icon
              name="ChevronRight"
              className="size-sm text-muted-foreground"
            />
          </Pressable>
        ))}
      </View>
      <ActionButton
        onPress={onCheck}
        isLoading={checking}
        loadingLabel="Checking access"
        trailingIcon="RefreshCw"
      >
        Check again
      </ActionButton>
    <ActionButton onPress={onSignOut} variant="ghost" icon="LogOut">
        Sign out
      </ActionButton>
    </GreenTillAuthScreen>
  )
}
