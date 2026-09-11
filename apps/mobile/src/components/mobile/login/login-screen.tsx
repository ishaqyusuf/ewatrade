import {
  AuthActionButton,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { QaAccountChooser } from "@/components/mobile/qa-account-chooser"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { ClassicLoginScreen } from "@/components/mobile/appearances/classic/login-screen"
import { MarketDayLoginScreen } from "@/components/mobile/appearances/market-day/login-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
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

export function LoginScreen() {
  const design = useMobileDesign("login")
  const Presentation =
    design === "market-day" ? MarketDayLoginScreen : ClassicLoginScreen
  const showInternalActions = shouldShowInternalDesignSystemEntry()
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string; returnTo?: string }>()
  const trpc = useTRPC()
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  )
  const [error, setError] = useState<string | null>(null)
  const normalizedEmail = email.trim().toLowerCase()
  const returnTo =
    typeof params.returnTo === "string" &&
    params.returnTo.startsWith("/(customer)/")
      ? params.returnTo
      : undefined
  const googleAuth = useMobileGoogleAuth({
    mode: "login",
    onError: setError,
    redirectHref: returnTo ?? "/",
  })
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        const message =
          error.message || "We could not send the verification code. Try again."

        setError(message)
      },
      onSuccess() {
        setError(null)
        router.push({
          pathname: "/verify-email",
          params: {
            email: normalizedEmail,
            mode: "login",
            returnTo,
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
    <Presentation
      actions={
        showInternalActions ? (
          <>
            <QaAccountChooser />
            <DevDesignSystemShortcut />
          </>
        ) : undefined
      }
      footer={
        <AuthFooterAction
          eyebrow="New to ẸwáTrade?"
          href="/sign-up"
          label="Create your business account"
        />
      }
    >
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
          appearance={design === "market-day" ? "market-day" : "default"}
          disabled={!normalizedEmail}
          isLoading={requestOtpMutation.isPending}
          loadingLabel="Sending code"
          onPress={continueWithEmail}
          trailingIcon="ArrowRight"
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
        {design === "market-day" ? (
          <View className="flex-row items-center justify-center gap-2 pt-1">
            <Icon className="size-[15px] text-market-ink" name="ShieldCheck" />
            <Text className="text-xs font-semibold text-market-muted-ink">
              Secure, password-free sign in
            </Text>
          </View>
        ) : null}
      </View>
    </Presentation>
  )
}
