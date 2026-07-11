import { ActionButton, FormField, MobileScreen } from "@/components/mobile";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

export default function LoginRoute() {
  const auth = useAuthContext();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const normalizedEmail = email.trim().toLowerCase();

  const continueWithEmail = () => {
    if (!normalizedEmail) return;

    router.push({
      pathname: "/verify-email",
      params: {
        email: normalizedEmail,
        mode: "login",
      },
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
            Welcome back
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Sign in to continue managing sales, stock, and staff from your
            phone.
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <ActionButton
          className="border border-border bg-card active:bg-accent"
          onPress={() => auth.signInLocal()}
          variant="outline"
        >
          Continue with Google
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
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email address"
          onChangeText={setEmail}
          placeholder="owner@business.com"
          textContentType="emailAddress"
          value={email}
        />
        <ActionButton disabled={!normalizedEmail} onPress={continueWithEmail}>
          Send login code
        </ActionButton>
      </View>

      <View className="items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <Text className="text-base leading-6 text-muted-foreground">
          New to Ewatrade?
        </Text>
        <Link href="/sign-up" asChild>
          <Pressable haptic transition>
            <Text className="text-lg font-bold text-primary">
              Create your business account
            </Text>
          </Pressable>
        </Link>
      </View>
    </MobileScreen>
  );
}
