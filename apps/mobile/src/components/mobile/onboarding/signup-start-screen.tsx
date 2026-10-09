import {
  AuthActionButton,
  AuthBrandHeader,
  MobileScreen,
  StatusBanner,
} from "@/components/mobile"
import { FormField } from "@/components/mobile/form-field"
import { PhoneField } from "@/components/mobile/phone-field"
import { savePendingOnboarding } from "@/lib/onboarding-continuation-store"
import { startNativeSignup } from "@/lib/onboarding-web-client"
import { getCountry, toInternationalPhone } from "@ewatrade/utils/countries"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"

// First signup screen: create the setup session, then continue in
// /continue-onboarding, which waits for the emailed confirmation link.
export function SignupStartScreen() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [phone, setPhone] = useState("")
  const [countryCode, setCountryCode] = useState("NG")
  const start = useMutation({
    mutationFn: async () => {
      const result = await startNativeSignup({
        fullName: fullName.trim(),
        email: email.trim(),
        businessName: businessName.trim(),
        phone: toInternationalPhone(getCountry(countryCode).dialCode, phone),
      })
      await savePendingOnboarding({
        kind: "setup",
        token: result.accessToken,
        expiresAt: result.expiresAt,
      })
      return result
    },
    gcTime: 0,
    onSuccess() {
      router.replace("/continue-onboarding")
    },
  })
  return (
    <MobileScreen contentClassName="gap-5">
      <AuthBrandHeader
        title="Create your store"
        subtitle="Start free. We’ll email you a link to confirm it’s you, then you can set up your business."
      />
      <FormField
        label="Your full name"
        value={fullName}
        onChangeText={setFullName}
        autoComplete="name"
      />
      <FormField
        label="Business name"
        value={businessName}
        onChangeText={setBusinessName}
      />
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <PhoneField
        countryCode={countryCode}
        editable={!start.isPending}
        label="Phone (optional)"
        onChangeText={setPhone}
        onCountryChange={setCountryCode}
        value={phone}
      />
      {start.error ? (
        <StatusBanner tone="destructive" message={start.error.message} />
      ) : null}
      <AuthActionButton
        isLoading={start.isPending}
        loadingLabel="Starting…"
        disabled={
          fullName.trim().length < 2 ||
          businessName.trim().length < 2 ||
          !email.includes("@")
        }
        onPress={() => start.mutate()}
      >
        Continue
      </AuthActionButton>
      <AuthActionButton
        variant="secondary"
        onPress={() => router.push("/continue-onboarding")}
      >
        I already have a setup email
      </AuthActionButton>
      <AuthActionButton
        variant="secondary"
        onPress={() => router.replace("/login")}
      >
        I already have an account
      </AuthActionButton>
    </MobileScreen>
  )
}
