import { ClassicLoginScreen } from "@/components/mobile/appearances/classic/login-screen"
import { AppleAuthButton } from "@/components/mobile/apple-auth-button"
import {
  AuthActionButton,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import { PhoneField } from "@/components/mobile/phone-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useMobileAppleAuth } from "@/hooks/use-mobile-apple-auth"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import { useOnboardingStore } from "@/store/onboardingStore"
import { useTRPC } from "@/trpc/client"
import { getCountry, toInternationalPhone } from "@ewatrade/utils/countries"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState } from "react"

export function LoginScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    email?: string
    notice?: string
    returnTo?: string
  }>()
  const trpc = useTRPC()
  const auth = useAuthContext()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  )
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [usePassword, setUsePassword] = useState(false)
  const [useWhatsApp, setUseWhatsApp] = useState(false)
  const [phone, setPhone] = useState("")
  const [phoneCountry, setPhoneCountry] = useState("NG")
  const fullPhone = toInternationalPhone(
    getCountry(phoneCountry).dialCode,
    phone,
  )
  const phoneAvailability = useQuery(
    trpc.auth.phoneOtpAvailability.queryOptions(undefined, { retry: false }),
  )
  const requestPhoneMutation = useMutation(
    trpc.auth.requestPhoneOtp.mutationOptions({
      onError(error) {
        setError(error.message)
      },
      onSuccess() {
        setError(null)
        router.push({
          pathname: "/verify-email",
          params: {
            channel: "whatsapp",
            phone: fullPhone,
            mode: "login",
            returnTo,
          },
        })
      },
    }),
  )
  const normalizedEmail = email.trim().toLowerCase()
  const returnTo =
    typeof params.returnTo === "string" &&
    params.returnTo.startsWith("/(customer)/")
      ? params.returnTo
      : undefined
  const appleAuth = useMobileAppleAuth({
    mode: "login",
    onError: setError,
    redirectHref: returnTo ?? "/",
  })
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
  const passwordMutation = useMutation(
    trpc.auth.signInMobilePassword.mutationOptions({
      onError() {
        setError("Invalid email or password, or the account is not verified.")
      },
      onSuccess(session) {
        setError(null)
        setPassword("")
        completeOnboarding(true)
        auth.applyAuthenticatedSession(
          {
            accessProfile: session.accessProfile,
            expiresAt: session.expiresAt.toISOString(),
            profile: {
              businessId: session.profile.businessId ?? undefined,
              businessName: session.profile.businessName ?? undefined,
              businessSlug: session.tenant?.slug ?? undefined,
              storeId: session.tenant?.storeId ?? undefined,
              storeName: session.tenant?.storeName ?? undefined,
              currencyCode: session.profile.currencyCode,
              email: session.profile.email,
              id: session.profile.id,
              name: session.profile.name,
              role: session.profile.role,
              staffAccessMode: session.profile.staffAccessMode,
              catalogEditor: session.profile.catalogEditor,
              status: session.profile.status,
            },
            token: session.token,
          },
          returnTo ?? "/",
        )
      },
    }),
  )

  const continueWithEmail = () => {
    if (useWhatsApp) {
      requestPhoneMutation.mutate({ phone: fullPhone, mode: "login" })
      return
    }
    if (!normalizedEmail) return

    if (usePassword) {
      if (!password) return
      passwordMutation.mutate({ email: normalizedEmail, password })
      return
    }

    requestOtpMutation.mutate({
      email: normalizedEmail,
      mode: "login",
    })
  }

  const continueWithGoogle = () => {
    void googleAuth.startGoogleAuth()
  }

  return (
    <ClassicLoginScreen
      subtitle={
        useWhatsApp
          ? "Use your WhatsApp number. We’ll send a 6-digit code."
          : usePassword
            ? "Use your email and password to sign in."
            : "Use your email. We’ll send a 6-digit code."
      }
      footer={
        <AuthFooterAction
          eyebrow="New to ẸwáTrade?"
          href="/sign-up"
          label="Create a business account"
        />
      }
    >
      <View className="gap-4">
        {useWhatsApp ? (
          <PhoneField
            countryCode={phoneCountry}
            onCountryChange={setPhoneCountry}
            onChangeText={setPhone}
            value={phone}
            label="WhatsApp number"
            variant="green-gate"
          />
        ) : (
          <FormField
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email address"
            onChangeText={setEmail}
            placeholder="Enter your email address"
            textContentType="emailAddress"
            value={email}
            variant="green-gate"
          />
        )}
        {usePassword && !useWhatsApp ? (
          <FormField
            autoCapitalize="none"
            autoComplete="current-password"
            label="Password"
            leadingIcon="Lock"
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            textContentType="password"
            value={password}
            variant="green-gate"
          />
        ) : null}
        <AuthActionButton
          disabled={
            useWhatsApp
              ? phone.length < 7
              : !normalizedEmail || (usePassword && !password)
          }
          isLoading={
            requestOtpMutation.isPending ||
            passwordMutation.isPending ||
            requestPhoneMutation.isPending
          }
          loadingLabel={usePassword ? "Signing in" : "Sending code"}
          onPress={continueWithEmail}
          trailingIcon="ArrowRight"
        >
          {useWhatsApp
            ? "Send WhatsApp code"
            : usePassword
              ? "Sign in with password"
              : "Send login code"}
        </AuthActionButton>
        {phoneAvailability.data?.enabled ? (
          <AuthMethodButton
            icon={useWhatsApp ? "Mail" : "WhatsApp"}
            brandIcon={useWhatsApp ? undefined : "whatsapp"}
            label={useWhatsApp ? "Use email instead" : "Use WhatsApp instead"}
            onPress={() => {
              setUseWhatsApp(!useWhatsApp)
              setUsePassword(false)
              setError(null)
            }}
            disabled={
              requestPhoneMutation.isPending ||
              requestOtpMutation.isPending ||
              passwordMutation.isPending
            }
          />
        ) : null}
        {!useWhatsApp ? (
          <Pressable
            accessibilityRole="button"
            className="-my-3 min-h-11 items-center justify-center"
            onPress={() => {
              setUsePassword((current) => !current)
              setError(null)
            }}
          >
            <Text className="text-xs font-extrabold [-rn-line-height:22] text-primary">
              {usePassword
                ? "Use a login code instead"
                : "Use a password instead"}
            </Text>
          </Pressable>
        ) : null}
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Login needs attention"
            tone="destructive"
          />
        ) : null}
        <AuthDivider label="or" plain />
        <AppleAuthButton
          onPress={appleAuth.startAppleAuth}
          disabled={appleAuth.isPending}
        />
        <AuthMethodButton
          brandIcon="google"
          disabled={googleAuth.isPending}
          label="Continue with Google"
          variant="sso"
          loadingLabel="Connecting to Google"
          onPress={continueWithGoogle}
          pending={googleAuth.isPending}
        />
      </View>
    </ClassicLoginScreen>
  )
}
