import { FirstProductSetupContent, MobileScreen } from "@/components/mobile"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { Redirect, useRouter } from "expo-router"
import { View } from "react-native"

export default function FirstProductSetupModalRoute() {
  const router = useRouter()
  const { isAuthenticated, profile } = useAuthContext()

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile) || isSalesRepRole(profile?.role)) {
    return <Redirect href="/dashboard" />
  }

  return (
    <MobileScreen keyboardBottomOffset={140} scroll={false}>
      <View className="mb-4 flex-row items-center justify-between gap-3 px-5">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold uppercase text-muted-foreground">
            Full-screen workflow
          </Text>
          <Text className="text-2xl font-extrabold text-foreground">
            Set up item
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close item setup"
          className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
          haptic
          onPress={() => router.replace("/dashboard")}
          transition
        >
          <Icon className="size-sm text-foreground" name="X" />
        </Pressable>
      </View>
      <FirstProductSetupContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </MobileScreen>
  )
}
