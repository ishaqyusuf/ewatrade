import { ActionButton, MobileScreen, OtpInput } from "@/components/mobile";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { useOnboardingStore } from "@/store/onboardingStore";
import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

const OTP_LENGTH = 6;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function VerifyEmailRoute() {
  const auth = useAuthContext();
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );
  const params = useLocalSearchParams<{
    businessName?: string;
    email?: string;
    mode?: "login" | "sign-up";
    name?: string;
  }>();
  const email = firstParam(params.email) ?? "owner@ewatrade.test";
  const mode = firstParam(params.mode) === "login" ? "login" : "sign-up";
  const name = firstParam(params.name) ?? "Store Owner";
  const businessName = firstParam(params.businessName) ?? "My Business";
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "resent" | "verifying">(
    "idle",
  );

  const verifyCode = useCallback(() => {
    if (code.length !== OTP_LENGTH || status === "verifying") return;

    setStatus("verifying");
    completeOnboarding(true);

    if (mode === "login") {
      auth.signInLocal({ email, name, businessName });
      return;
    }

    auth.signUpLocal({ email, name, businessName });
  }, [
    auth,
    businessName,
    code.length,
    completeOnboarding,
    email,
    mode,
    name,
    status,
  ]);

  useEffect(() => {
    if (code.length === OTP_LENGTH) {
      verifyCode();
    }
  }, [code.length, verifyCode]);

  return (
    <MobileScreen contentClassName="justify-center gap-8">
      <View className="gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Text className="text-2xl font-bold text-primary">E</Text>
        </View>
        <Text className="text-3xl font-bold text-foreground">
          Check your email
        </Text>
        <Text className="text-base leading-6 text-muted-foreground">
          Enter the 6-digit code sent to {email}.
        </Text>
      </View>

      <View className="gap-4">
        <OtpInput onChange={setCode} value={code} />
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">
            {status === "resent" ? "Code sent again" : "Did not get it?"}
          </Text>
          <Pressable haptic onPress={() => setStatus("resent")} transition>
            <Text className="text-sm font-semibold text-primary">
              Resend code
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="gap-4">
        <ActionButton
          disabled={code.length !== OTP_LENGTH || status === "verifying"}
          onPress={verifyCode}
        >
          {status === "verifying" ? "Verifying" : "Verify and continue"}
        </ActionButton>
        <Link href={mode === "login" ? "/login" : "/sign-up"} asChild>
          <Pressable className="items-center" haptic transition>
            <Text className="text-sm font-semibold text-muted-foreground">
              Use another email
            </Text>
          </Pressable>
        </Link>
      </View>
    </MobileScreen>
  );
}
