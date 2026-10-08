import { ActionButton } from "@/components/mobile/action-button"
import {
  AuthListCard,
  AuthListRow,
} from "@/components/mobile/green-till/auth-list"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { NoAccessStage } from "@/components/mobile/green-till/auth-stage"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"

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
  return (
    <GreenTillAuthScreen
      eyebrow={email ? `Signed in as ${email}` : "Your account"}
      title="No business on this account yet"
      subtitle="Start your own business, or ask your employer to invite this email."
      stage={<NoAccessStage />}
      testID="green-gate-no-access"
    >
      <AuthListCard>
        <AuthListRow
          accessibilityLabel="Start a business. Set up a workspace with this account"
          chevron
          icon="Building2"
          onPress={onStart}
          subtitle="Set up a workspace with this account"
          tint="mint"
          title="Start a business"
        />
        <AuthListRow
          accessibilityLabel="Waiting for an invite? Share your email with your employer"
          chevron
          disabled={!email}
          icon="UserPlus"
          onPress={onShareEmail}
          subtitle={
            email ? `Share ${email}` : "Ask your employer to invite your email"
          }
          tint="lilac"
          title="Waiting for an invite?"
        />
        <AuthListRow
          accessibilityLabel="Account and privacy. Terms, data and deletion"
          chevron
          icon="ShieldCheck"
          onPress={onPrivacy}
          subtitle="Terms, data and deletion"
          tint="sky"
          title="Account and privacy"
        />
      </AuthListCard>
      <ActionButton
        onPress={onCheck}
        isLoading={checking}
        loadingLabel="Checking access"
        trailingIcon="RefreshCw"
      >
        Check again
      </ActionButton>
      <Pressable
        accessibilityRole="button"
        className="-mt-2 min-h-11 flex-row items-center justify-center gap-1.5"
        haptic
        onPress={onSignOut}
      >
        <Icon className="size-[16px] text-muted-foreground" name="LogOut" />
        <Text className="text-[13px] [-rn-line-height:18] text-muted-foreground">
          Sign out
        </Text>
      </Pressable>
    </GreenTillAuthScreen>
  )
}
