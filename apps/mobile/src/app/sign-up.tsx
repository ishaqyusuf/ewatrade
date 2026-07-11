import { ActionButton, FormField, MobileScreen } from "@/components/mobile";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

export default function SignUpRoute() {
  const auth = useAuthContext();
  const router = useRouter();
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const normalizedEmail = email.trim().toLowerCase();
  const canContinue =
    !!name.trim() && !!businessName.trim() && !!normalizedEmail;

  const continueWithEmail = () => {
    if (!canContinue) return;

    router.push({
      pathname: "/verify-email",
      params: {
        businessName: businessName.trim(),
        email: normalizedEmail,
        mode: "sign-up",
        name: name.trim(),
      },
    });
  };

  const continueWithGoogle = () => {
    completeOnboarding(true);
    auth.signUpLocal({
      businessName: businessName.trim() || "My Business",
      email: normalizedEmail || "owner@ewatrade.test",
      name: name.trim() || "Store Owner",
    });
  };

  return (
    <MobileScreen contentClassName="justify-center gap-8">
      <View className="gap-4">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Text className="text-2xl font-bold text-primary">E</Text>
        </View>
        <View className="gap-2">
          <Text className="text-3xl font-bold text-foreground">
            Create your account
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Start with the essentials. You can add products, staff, and stock
            once the account is ready.
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <ActionButton
          className="border border-border bg-card active:bg-accent"
          onPress={continueWithGoogle}
          variant="outline"
        >
          Sign up with Google
        </ActionButton>
        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            or
          </Text>
          <View className="h-px flex-1 bg-border" />
        </View>
      </View>

      <View className="gap-4">
        <FormField
          label="Your name"
          onChangeText={setName}
          placeholder="Amina Yusuf"
          textContentType="name"
          value={name}
        />
        <FormField
          label="Business name"
          onChangeText={setBusinessName}
          placeholder="Amina Feeds"
          value={businessName}
        />
        <FormField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email address"
          onChangeText={setEmail}
          placeholder="owner@business.com"
          textContentType="emailAddress"
          value={email}
        />
      </View>

      <View className="gap-4">
        <ActionButton disabled={!canContinue} onPress={continueWithEmail}>
          Send verification code
        </ActionButton>
        <Link href="/login" asChild>
          <Pressable className="items-center" haptic transition>
            <Text className="text-sm font-semibold text-muted-foreground">
              I already have an account
            </Text>
          </Pressable>
        </Link>
      </View>
    </MobileScreen>
  );
}
