import { AuthHeader, MobileScreen } from "@/components/mobile"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useOnboardingStore } from "@/store/onboardingStore"
import { Redirect } from "expo-router"
import { View } from "react-native"

function StartupSplash() {
  return (
    <MobileScreen
      contentClassName="items-center justify-center gap-6"
      scroll={false}
    >
      <AuthHeader
        align="center"
        badge="Business operations"
        icon="Building2"
        subtitle="Preparing your catalog, orders, stock, and work workspace."
        title="Ewatrade"
      />
      <View className="flex-row gap-2">
        <View className="h-2 w-8 rounded-full bg-primary" />
        <View className="h-2 w-2 rounded-full bg-primary/30" />
        <View className="h-2 w-2 rounded-full bg-primary/20" />
      </View>
    </MobileScreen>
  )
}

export default function StartRoute() {
  const { isAuthenticated } = useAuthContext()
  const hasCompletedOnboarding = useOnboardingStore(
    (state) => state.hasCompletedOnboarding,
  )
  const hasHydrated = useOnboardingStore((state) => state.hasHydrated)

  if (!hasHydrated) {
    return <StartupSplash />
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  return <Redirect href="/dashboard" />
}
