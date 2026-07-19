import {
  AuthActionButton,
  AuthBrandHeader,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
  CurrencySelector,
  FormField,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import { useTRPC } from "@/trpc/client"
import type { OperatingCurrencyCode } from "@ewatrade/utils"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"

export default function SignUpRoute() {
  const router = useRouter()
  const trpc = useTRPC()
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [currencyCode, setCurrencyCode] = useState<OperatingCurrencyCode>("NGN")
  const [step, setStep] = useState<"account" | "business">("business")
  const [error, setError] = useState<string | null>(null)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedBusinessName = businessName.trim()
  const hasBusinessContact = !!addressLine1.trim() && !!city.trim() && phone.trim().length >= 7
  const canContinueWithGoogle = !!normalizedBusinessName && !!currencyCode && hasBusinessContact
  const canContinueWithEmail =
    !!name.trim() && !!normalizedBusinessName && !!normalizedEmail && hasBusinessContact
  const googleAuth = useMobileGoogleAuth({
    addressLine1: addressLine1.trim(),
    businessName: normalizedBusinessName,
    city: city.trim(),
    currencyCode,
    mode: "sign_up",
    name: name.trim() || undefined,
    phone: phone.trim(),
    onError: setError,
  })
  const requestOtpMutation = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onError(error) {
        setError(
          error.message ||
            "We could not send the verification code. Try again.",
        )
      },
      onSuccess() {
        setError(null)
        router.push({
          pathname: "/verify-email",
          params: {
            addressLine1: addressLine1.trim(),
            businessName: normalizedBusinessName,
            city: city.trim(),
            currencyCode,
            email: normalizedEmail,
            mode: "sign-up",
            name: name.trim(),
            phone: phone.trim(),
          },
        })
      },
    }),
  )

  const continueWithEmail = () => {
    if (!canContinueWithEmail) return

    requestOtpMutation.mutate({
      addressLine1: addressLine1.trim(),
      businessName: normalizedBusinessName,
      city: city.trim(),
      currencyCode,
      email: normalizedEmail,
      mode: "sign_up",
      name: name.trim(),
      phone: phone.trim(),
    })
  }

  const continueWithGoogle = () => {
    if (!canContinueWithGoogle) {
      setError("Enter your business name first, then continue with Google.")
      return
    }

    void googleAuth.startGoogleAuth()
  }

  const continueToAccount = () => {
    if (!canContinueWithGoogle) {
      setError("Add your business address and phone to continue.")
      return
    }
    setError(null)
    setStep("account")
  }

  return (
    <MobileScreen
      contentClassName="justify-center gap-7"
      keyboardBottomOffset={420}
    >
      <AuthBrandHeader
        subtitle={
          step === "business"
            ? "First, tell us where your business operates."
            : "Now choose how you want to sign in."
        }
        title={step === "business" ? "Create your business" : "Your account"}
      />

      {step === "business" ? (
        <View className="gap-3">
          <FormField
            helper="This is the name customers and your team will see."
            label="Business name"
            leadingIcon="Building2"
            onChangeText={setBusinessName}
            placeholder="Enter your business name"
            value={businessName}
            variant="auth"
          />
          <FormField
            label="Business address"
            leadingIcon="MapPin"
            onChangeText={setAddressLine1}
            placeholder="Street address"
            value={addressLine1}
            variant="auth"
          />
          <View className="flex-row gap-3">
            <FormField
              containerClassName="flex-1"
              label="City"
              onChangeText={setCity}
              placeholder="City"
              value={city}
              variant="auth"
            />
            <FormField
              containerClassName="flex-1"
              keyboardType="phone-pad"
              label="Phone"
              onChangeText={setPhone}
              placeholder="Phone"
              value={phone}
              variant="auth"
            />
          </View>
          <CurrencySelector onChange={setCurrencyCode} value={currencyCode} />
        </View>
      ) : (
        <View className="gap-3">
          <FormField
            label="Your name"
            leadingIcon="User"
            onChangeText={setName}
            placeholder="Enter your full name"
            textContentType="name"
            value={name}
            variant="auth"
          />
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
        </View>
      )}

      <View className="gap-4">
        {step === "business" ? (
          <AuthActionButton
            disabled={!canContinueWithGoogle}
            onPress={continueToAccount}
          >
            Continue
          </AuthActionButton>
        ) : (
          <AuthActionButton
            disabled={!canContinueWithEmail}
            isLoading={requestOtpMutation.isPending}
            loadingLabel="Sending code"
            onPress={continueWithEmail}
          >
            Send verification code
          </AuthActionButton>
        )}
        {error ? (
          <StatusBanner
            icon="TriangleAlert"
            message={error}
            title="Sign-up needs attention"
            tone="destructive"
          />
        ) : null}
        {step === "account" ? (
          <>
            <AuthDivider label="Or Continue With" />
            <AuthMethodButton
              brandIcon="google"
              disabled={googleAuth.isPending || !canContinueWithGoogle}
              label="Google"
              loadingLabel="Connecting to Google"
              onPress={continueWithGoogle}
              pending={googleAuth.isPending}
            />
            <Pressable
              className="min-h-11 items-center justify-center"
              haptic
              onPress={() => {
                setError(null)
                setStep("business")
              }}
            >
              <Text className="text-sm font-bold text-primary">
                Edit business details
              </Text>
            </Pressable>
          </>
        ) : null}
        <AuthFooterAction
          eyebrow="Already have an account?"
          href="/login"
          label="Sign in instead"
        />
      </View>
    </MobileScreen>
  )
}
