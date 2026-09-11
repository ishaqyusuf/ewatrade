import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { StoreConversationAccountInvitationProjection } from "@ewatrade/service-commerce"

import { projectCustomerAccountInvitation } from "./customer-account-invitation-presentation"

export function CustomerAccountInvitationContent({
  accountSession,
  actionsDisabled = false,
  dismissing,
  invitation,
  invitationError,
  onCreateAccount,
  onDismiss,
  onSignIn,
}: {
  accountSession: boolean
  actionsDisabled?: boolean
  dismissing: boolean
  invitation: StoreConversationAccountInvitationProjection
  invitationError: string | null
  onCreateAccount: () => void
  onDismiss: () => void
  onSignIn: () => void
}) {
  if (invitation.state !== "offered") {
    return (
      <View className="items-start">
        <View className="w-full gap-1 border-y border-border py-3">
          <Text className="font-bold text-foreground">{invitation.title}</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {invitation.body}
          </Text>
        </View>
      </View>
    )
  }

  const presentation = projectCustomerAccountInvitation({
    accountSession,
    invitation,
  })

  return (
    <View className="items-start">
      <View className="w-full border-y border-border py-4">
        <View className="flex-row items-start gap-3">
          <View className="size-10 items-center justify-center rounded-full bg-primary/10">
            <Icon className="size-sm text-primary" name="UserPlus" />
          </View>
          <View className="min-w-0 flex-1">
            <View className="self-start rounded-full bg-muted px-2 py-1">
              <Text className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {presentation.optionalLabel}
              </Text>
            </View>
            <Text className="mt-2 text-base font-extrabold leading-6 text-foreground">
              {invitation.title}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-muted-foreground">
              {invitation.body}
            </Text>
            <View
              accessible
              accessibilityLabel={presentation.assurance ?? undefined}
              className="mt-3 flex-row items-start gap-2"
            >
              <Icon className="mt-0.5 size-xs text-primary" name="Check" />
              <Text className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                {presentation.assurance}
              </Text>
            </View>
            {actionsDisabled ? (
              <Text className="mt-3 text-xs font-bold text-muted-foreground">
                Account actions are unavailable while messages are paused.
              </Text>
            ) : (
              <>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    accessibilityHint="Opens account creation. Your guest conversation stays available."
                    accessibilityRole="button"
                    className="min-h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-primary px-3"
                    haptic
                    onPress={onCreateAccount}
                  >
                    <Text className="text-center text-sm font-bold text-primary-foreground">
                      {presentation.primaryLabel}
                    </Text>
                  </Pressable>
                  {presentation.secondaryLabel ? (
                    <Pressable
                      accessibilityHint="Signs in to an existing Customer Account. Your guest conversation stays available."
                      accessibilityRole="button"
                      className="min-h-11 min-w-0 flex-1 items-center justify-center rounded-full bg-muted px-3"
                      haptic
                      onPress={onSignIn}
                    >
                      <Text className="text-center text-sm font-bold text-foreground">
                        {presentation.secondaryLabel}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  accessibilityHint="Dismisses this invitation and keeps guest access."
                  accessibilityRole="button"
                  className="min-h-11 self-start justify-center rounded-full px-1"
                  disabled={dismissing}
                  haptic
                  onPress={onDismiss}
                >
                  <Text className="text-sm font-bold text-muted-foreground">
                    {presentation.dismissLabel}
                  </Text>
                </Pressable>
              </>
            )}
            {invitationError ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-xs leading-5 text-destructive"
              >
                {invitationError}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}
