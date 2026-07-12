import { ActionButton, MobileScreen, OtpInput } from "@/components/mobile";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
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
    fallback?: "local";
    mode?: "login" | "sign-up";
    name?: string;
  }>();
  const email = firstParam(params.email)?.trim() ?? "";
  const emailDeliveryLabel = email || "your email address";
  const mode = firstParam(params.mode) === "login" ? "login" : "sign-up";
  const apiMode = mode === "login" ? "login" : "sign_up";
  const isLocalFallback = firstParam(params.fallback) === "local";
  const name = firstParam(params.name) ?? "Store Owner";
  const businessName = firstParam(params.businessName) ?? "My Business";
  const trpc = useTRPC();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "resent" | "verifying" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        setStatus("error");
        setMessage(error.message || "We could not resend the code.");
      },
      onSuccess() {
        setStatus("resent");
        setMessage("Code sent again");
      },
    }),
  );
  const verifyOtpMutation = useMutation(
    trpc.auth.verifyMobileOwnerOtp.mutationOptions({
      onError(error) {
        setStatus("error");
        setCode("");
        setMessage(error.message || "We could not verify that code.");
      },
      onSuccess(session) {
        completeOnboarding(true);
        auth.applyAuthenticatedSession({
          expiresAt: session.expiresAt.toISOString(),
          profile: {
            businessId: session.profile.businessId ?? undefined,
            businessName: session.profile.businessName ?? undefined,
            email: session.profile.email,
            id: session.profile.id,
            name: session.profile.name,
            role: session.profile.role ?? undefined,
            status: session.profile.status ?? undefined,
          },
          token: session.token,
        });
      },
    }),
  );

  const verifyCode = useCallback(() => {
    if (code.length !== OTP_LENGTH || status === "verifying") return;

    setStatus("verifying");

    if (isLocalFallback) {
      completeOnboarding(true);

      if (mode === "login") {
        auth.signInLocal({ email, name, businessName });
        return;
      }

      auth.signUpLocal({ email, name, businessName });
      return;
    }

    verifyOtpMutation.mutate({
      businessName,
      code,
      email,
      mode: apiMode,
      name,
    });
  }, [
    apiMode,
    auth,
    businessName,
    code,
    code.length,
    completeOnboarding,
    email,
    isLocalFallback,
    mode,
    name,
    status,
    verifyOtpMutation,
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
          Enter the 6-digit code sent to {emailDeliveryLabel}.
        </Text>
      </View>

      <View className="gap-4">
        <OtpInput onChange={setCode} value={code} />
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">
            {message ??
              (status === "resent" ? "Code sent again" : "Did not get it?")}
          </Text>
          <Pressable
            haptic
            onPress={() => {
              if (isLocalFallback) {
                setStatus("resent");
                setMessage("Use any 6-digit code while offline.");
                return;
              }

              requestOtpMutation.mutate({
                businessName,
                email,
                mode: apiMode,
                name,
              });
            }}
            transition
          >
            <Text className="text-sm font-semibold text-primary">
              {requestOtpMutation.isPending ? "Sending" : "Resend code"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="gap-4">
        <ActionButton
          disabled={code.length !== OTP_LENGTH || status === "verifying"}
          onPress={verifyCode}
        >
          {status === "verifying" || verifyOtpMutation.isPending
            ? "Verifying"
            : "Verify and continue"}
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
