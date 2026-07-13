import {
  ActionButton,
  AuthHeader,
  AuthMethodButton,
  FormField,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

export default function LoginRoute() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const trpc = useTRPC()
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  )
  const [error, setError] = useState<string | null>(null)
  const normalizedEmail = email.trim().toLowerCase()
  const googleAuth = useMobileGoogleAuth({
    mode: "login",
    onError: setError,
  })
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        setError(
          error.message ||
            "We could not send a production code. You can continue locally while the service is unavailable.",
        )
        router.push({
          pathname: "/verify-email",
          params: {
            email: normalizedEmail,
            fallback: "local",
            mode: "login",
          },
        })
      },
      onSuccess() {
        setError(null)
        router.push({
          pathname: "/verify-email",
          params: {
            email: normalizedEmail,
            mode: "login",
          },
        })
      },
    }),
  )

  const continueWithEmail = () => {
    if (!normalizedEmail) return

    requestOtpMutation.mutate({
      email: normalizedEmail,
      mode: "login",
    })
  }

  const continueWithGoogle = () => {
    void googleAuth.startGoogleAuth()
  }

  return (
    <MobileScreen contentClassName="justify-center gap-8">
      <AuthHeader
        badge="Retail ops"
        icon="Building2"
        subtitle="Sign in to continue managing sales, stock, and staff from your phone."
        title="Welcome back"
      />

      <View className="gap-3">
        <AuthMethodButton
          disabled={googleAuth.isPending}
          icon="Globe"
          label="Continue with Google"
          loadingLabel="Connecting to Google"
          onPress={continueWithGoogle}
          pending={googleAuth.isPending}
        />
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
          placeholder="Enter your email address"
          textContentType="emailAddress"
          value={email}
        />
        <ActionButton disabled={!normalizedEmail} onPress={continueWithEmail}>
          {requestOtpMutation.isPending ? "Sending code" : "Send login code"}
        </ActionButton>
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Login needs attention"
            tone="destructive"
          />
        ) : null}
      </View>

      <Pressable
        className="items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-4 active:bg-primary/10"
        haptic
        href="/sign-up"
        transition
      >
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
            <Icon className="size-base text-primary-foreground" name="Plus" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm leading-5 text-muted-foreground">
              New to Ewatrade?
            </Text>
            <Text className="text-lg font-bold text-primary">
              Create your business account
            </Text>
          </View>
          <Icon className="size-sm text-primary" name="ChevronRight" />
        </View>
      </Pressable>
    </MobileScreen>
  )
}
