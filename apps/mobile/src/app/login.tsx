import {
  AuthActionButton,
  AuthBrandHeader,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
  FormField,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState } from "react"

function DevDesignSystemShortcut() {
  if (!shouldShowInternalDesignSystemEntry()) return null

  return (
    <View className="items-end">
      <Pressable
        accessibilityLabel="Open design system"
        accessibilityRole="button"
        className="size-11 items-center justify-center rounded-full bg-muted/70 active:bg-accent"
        haptic
        href="/design-system"
        transition
      >
        <Icon className="size-base text-primary" name="SlidersHorizontal" />
      </Pressable>
    </View>
  )
}

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
    <MobileScreen contentClassName="justify-center gap-7">
      <DevDesignSystemShortcut />
      <AuthBrandHeader
        subtitle="Welcome back. Select method to log in and continue managing sales, stock, and staff."
        title="Sign in to your account"
      />

      <View className="gap-4">
        <FormField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email address"
          leadingIcon="Mail"
          onChangeText={setEmail}
          placeholder="Enter your email address"
          textContentType="emailAddress"
          value={email}
          variant="auth"
        />
        <AuthActionButton
          disabled={!normalizedEmail}
          isLoading={requestOtpMutation.isPending}
          loadingLabel="Sending code"
          onPress={continueWithEmail}
        >
          Send login code
        </AuthActionButton>
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Login needs attention"
            tone="destructive"
          />
        ) : null}
        <AuthDivider label="Or Continue With" />
        <AuthMethodButton
          brandIcon="google"
          disabled={googleAuth.isPending}
          label="Google"
          loadingLabel="Connecting to Google"
          onPress={continueWithGoogle}
          pending={googleAuth.isPending}
        />
      </View>

      <AuthFooterAction
        eyebrow="New to Ewatrade?"
        href="/sign-up"
        label="Create your business account"
      />
    </MobileScreen>
  )
}
