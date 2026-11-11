import { ClassicLoginScreen } from "@/components/mobile/appearances/classic/login-screen"
import { AppleAuthButton } from "@/components/mobile/apple-auth-button"
import {
  AuthActionButton,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import {
  PhoneField,
  splitInternationalPhone,
} from "@/components/mobile/phone-field"
import {
  QaPhoneEntryPicker,
  type SelectedQaPhone,
} from "@/components/mobile/qa-phone-entry-picker"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text as QaPhoneText } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMobileAppleAuth } from "@/hooks/use-mobile-apple-auth"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import { assistantResponseLoginDestination } from "@/lib/assistant-response-link"
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
    /** +E.164 WhatsApp number from a staff invite: opens WhatsApp sign-in. */
    phone?: string
    returnTo?: string
  }>()
  const invitedPhone = splitInternationalPhone(
    typeof params.phone === "string" ? params.phone : null,
  )
  const trpc = useTRPC()
  const auth = useAuthContext()
  const largeTextLayout = useLargeTextLayout()
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  )
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  )
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [usePassword, setUsePassword] = useState(false)
  const [useWhatsApp, setUseWhatsApp] = useState(Boolean(invitedPhone))
  const [phone, setPhone] = useState(invitedPhone?.digits ?? "")
  const [qaPhone, setQaPhone] = useState<SelectedQaPhone | null>(null)
  const [phoneCountry, setPhoneCountry] = useState(
    invitedPhone?.countryCode ?? "NG",
  )
  const fullPhone =
    qaPhone?.phone ??
    toInternationalPhone(getCountry(phoneCountry).dialCode, phone)
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
            qaEntryId: qaPhone?.id,
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
      : assistantResponseLoginDestination(params.returnTo)
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
              countryCode: session.profile.countryCode ?? undefined,
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

  const isPending =
    requestOtpMutation.isPending ||
    passwordMutation.isPending ||
    requestPhoneMutation.isPending

  const continueWithEmail = () => {
    if (useWhatsApp) {
      requestPhoneMutation.mutate({
        phone: fullPhone,
        mode: "login",
        qaEntryId: qaPhone?.id,
        qaToken: qaPhone?.token,
      })
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
      footer={
        <AuthFooterAction
          eyebrow="New to ẸwáTrade?"
          href="/sign-up"
          label="Create a business account"
        />
      }
    >
      <View className={largeTextLayout ? "gap-5" : "gap-7"}>
        <View className="gap-2">
          <View className="gap-3">
            {useWhatsApp ? (
              <View className="gap-3">
                <QaPhoneEntryPicker
                  value={qaPhone}
                  onChange={setQaPhone}
                  disabled={isPending}
                />
                {qaPhone ? (
                  <QaPhoneText className="rounded-xl border border-border p-4">
                    {qaPhone.phone}
                  </QaPhoneText>
                ) : (
                  <PhoneField
                    countryCode={phoneCountry}
                    onCountryChange={setPhoneCountry}
                    onChangeText={setPhone}
                    value={phone}
                    label="WhatsApp number"
                    variant="green-gate"
                  />
                )}
              </View>
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
                  ? !qaPhone && phone.length < 7
                  : !normalizedEmail || (usePassword && !password)
              }
              isLoading={isPending}
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
          </View>
          {/* At large text the two method switches stack so each label reads
              in full instead of truncating at half width. */}
          <View
            className={
              largeTextLayout ? "gap-1" : "flex-row items-center justify-center"
            }
          >
            {phoneAvailability.data?.enabled ? (
              <View className={largeTextLayout ? "w-full" : "flex-1"}>
                <AuthMethodButton
                  icon={useWhatsApp ? "Mail" : "WhatsApp"}
                  brandIcon={useWhatsApp ? undefined : "whatsapp"}
                  label={useWhatsApp ? "Use email" : "Use WhatsApp"}
                  variant="link"
                  onPress={() => {
                    setUseWhatsApp(!useWhatsApp)
                    setUsePassword(false)
                    setError(null)
                  }}
                  disabled={isPending}
                />
              </View>
            ) : null}
            {!largeTextLayout && phoneAvailability.data?.enabled ? (
              <View className="h-4 w-px bg-border" />
            ) : null}
            <View className={largeTextLayout ? "w-full" : "flex-1"}>
              <AuthMethodButton
                icon={usePassword ? "Mail" : "Padlock"}
                label={usePassword ? "Use code" : "Use password"}
                variant="link"
                onPress={() => {
                  setUsePassword(!usePassword)
                  setUseWhatsApp(false)
                  setError(null)
                }}
                disabled={isPending}
              />
            </View>
          </View>
        </View>
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Login needs attention"
            tone="destructive"
          />
        ) : null}
        <View className="gap-2.5">
          <AuthDivider label="or" plain />
          <AppleAuthButton
            onPress={appleAuth.startAppleAuth}
            disabled={appleAuth.isPending}
          />
          <AuthMethodButton
            brandIcon="google"
            disabled={googleAuth.isPending}
            label="Continue with Google"
            variant="outline"
            loadingLabel="Connecting to Google"
            onPress={continueWithGoogle}
            pending={googleAuth.isPending}
          />
        </View>
      </View>
    </ClassicLoginScreen>
  )
}
