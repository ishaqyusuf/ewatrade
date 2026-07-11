import { ActionButton, MobileScreen } from "@/components/mobile";
import { Icon, type IconKeys } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

const ONBOARDING_STEPS = [
  {
    body: "Create one clean workspace for sales, inventory, customers, and staff.",
    icon: "Building2",
    title: "Set up your business",
  },
  {
    body: "Add products with units like bags, kilograms, half bags, or any variant you sell.",
    icon: "Warehouse",
    title: "Track stock your way",
  },
  {
    body: "Invite attendants, record sales, and keep offline work ready to sync later.",
    icon: "Users",
    title: "Sell with your team",
  },
] as const satisfies Array<{
  body: string;
  icon: IconKeys;
  title: string;
}>;

export default function OnboardingRoute() {
  const router = useRouter();
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const finishOnboarding = () => {
    completeOnboarding(true);
    router.replace("/login");
  };

  const continueOnboarding = () => {
    if (isLastStep) {
      finishOnboarding();
      return;
    }

    setStepIndex((current) =>
      Math.min(current + 1, ONBOARDING_STEPS.length - 1),
    );
  };

  return (
    <MobileScreen contentClassName="justify-center gap-8">
      <View className="gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-xl text-primary" name={step.icon} />
        </View>
        <Text className="text-3xl font-bold text-foreground">
          {step.title}
        </Text>
        <Text className="text-base leading-6 text-muted-foreground">
          {step.body}
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        {ONBOARDING_STEPS.map((item, index) => (
          <View
            className={
              index === stepIndex
                ? "h-2.5 flex-1 rounded-full bg-primary"
                : "h-2.5 flex-1 rounded-full bg-muted"
            }
            key={item.title}
          />
        ))}
      </View>

      <View className="gap-4">
        <ActionButton onPress={continueOnboarding}>
          {isLastStep ? "Get started" : "Continue"}
        </ActionButton>
        {!isLastStep ? (
          <Pressable className="items-center" haptic onPress={finishOnboarding}>
            <Text className="text-sm font-semibold text-muted-foreground">
              Skip for now
            </Text>
          </Pressable>
        ) : null}
      </View>
    </MobileScreen>
  );
}
