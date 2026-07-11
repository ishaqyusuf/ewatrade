import { MobileScreen } from "@/components/mobile";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Redirect } from "expo-router";
import { View } from "react-native";

function StartupSplash() {
  return (
    <MobileScreen
      contentClassName="items-center justify-center gap-6"
      scroll={false}
    >
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
        <Icon className="size-2xl text-primary" name="Building2" />
      </View>
      <View className="items-center gap-2">
        <Text className="text-3xl font-bold text-foreground">Ewatrade</Text>
        <Text className="text-center text-base leading-6 text-muted-foreground">
          Preparing your sales and inventory workspace.
        </Text>
      </View>
      <View className="flex-row gap-2">
        <View className="h-2 w-8 rounded-full bg-primary" />
        <View className="h-2 w-2 rounded-full bg-primary/30" />
        <View className="h-2 w-2 rounded-full bg-primary/20" />
      </View>
    </MobileScreen>
  );
}

export default function StartRoute() {
  const { isAuthenticated } = useAuthContext();
  const hasCompletedOnboarding = useOnboardingStore(
    (state) => state.hasCompletedOnboarding,
  );
  const hasHydrated = useOnboardingStore((state) => state.hasHydrated);

  if (!hasHydrated) {
    return <StartupSplash />;
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/dashboard" />;
}
