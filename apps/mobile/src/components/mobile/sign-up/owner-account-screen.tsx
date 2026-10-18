import { AppleAuthButton } from "@/components/mobile/apple-auth-button"
import {
  AuthActionButton,
  AuthDivider,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import { GreenTillAuthScreen } from "@/components/mobile/green-till/auth-screen"
import { SetupPreviewStage } from "@/components/mobile/green-till/auth-stage"
import { PhoneField } from "@/components/mobile/phone-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMobileAppleAuth } from "@/hooks/use-mobile-apple-auth"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import {
  createBusinessFixture,
  createFixtureIdentity,
} from "@/internal-tooling/fixture-recipes"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useTRPC } from "@/trpc/client"
import { getCountry, toInternationalPhone } from "@ewatrade/utils/countries"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import type { ApprovedNativeOnboarding } from "../onboarding/onboarding-continuation-screen"
import { SignupLegalChoices } from "./signup-legal-choices"
import { StoreLinkField } from "./store-link-field"

type Age = "UNDER_13" | "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
const ages: { key: Age; label: string }[] = [
  { key: "UNDER_13", label: "Under 13" },
  { key: "AGE_13_TO_15", label: "13–15" },
  { key: "AGE_16_TO_17", label: "16–17" },
  { key: "ADULT", label: "18+" },
]
export function OwnerAccountScreen({
  continuation,
  ageBand: initialAgeBand,
}: {
  ageBand?: Exclude<Age, "UNDER_13">
  continuation?: ApprovedNativeOnboarding
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const largeText = useLargeTextLayout()
  const [businessName, setBusinessName] = useState(
    continuation?.businessName ?? "",
  )
  const [slug, setSlug] = useState(
    normalizeStoreLink(continuation?.businessName ?? ""),
  )
  const [slugEdited, setSlugEdited] = useState(false)
  const [linkReady, setLinkReady] = useState(false)
  const [name, setName] = useState(continuation?.fullName ?? "")
  const [email, setEmail] = useState(continuation?.email ?? "")
  const [phone, setPhone] = useState("")
  const [phoneCountry, setPhoneCountry] = useState("NG")
  const [useWhatsApp, setUseWhatsApp] = useState(false)
  const [age, setAge] = useState<Age | null>(initialAgeBand ?? null)
  const [error, setError] = useState<string | null>(null)
  const [legal, setLegal] = useState({
    version: "",
    terms: false,
    privacy: false,
  })
  const publication = useQuery(
    trpc.auth.legalPublication.queryOptions(undefined, { retry: false }),
  )
  const whatsapp = useQuery(
    trpc.auth.phoneOtpAvailability.queryOptions(undefined, { retry: false }),
  )
  const version =
    publication.data?.acceptanceRequired && publication.data.effective
      ? publication.data.version
      : null
  const terms = legal.version === version && legal.terms
  const privacy = legal.version === version && legal.privacy
  const legalReady =
    publication.isSuccess &&
    publication.data.signupAvailable &&
    (!publication.data.acceptanceRequired ||
      !publication.data.effective ||
      (Boolean(publicLegalUrl("terms")) && terms && privacy))
  const ageBand = age && age !== "UNDER_13" ? age : undefined
  const common = {
    accessToken: continuation?.accessToken,
    ageBand,
    businessName: businessName.trim(),
    requestedSlug: slug,
    name: name.trim() || undefined,
    mode: "sign_up" as const,
    ...(version
      ? {
          legalVersion: version,
          acceptedTerms: terms ? (true as const) : undefined,
          acknowledgedPrivacyNotice: privacy ? (true as const) : undefined,
        }
      : {}),
  }
  const google = useMobileGoogleAuth({ ...common, onError: setError })
  const apple = useMobileAppleAuth({ ...common, onError: setError })
  const phoneValue = toInternationalPhone(
    getCountry(phoneCountry).dialCode,
    phone,
  )
  const sent = () =>
    router.push({
      pathname: "/verify-email",
      params: {
        mode: "sign-up",
        businessName: common.businessName,
        requestedSlug: slug,
        name,
        email: email.trim().toLowerCase(),
        phone: useWhatsApp ? phoneValue : undefined,
        channel: useWhatsApp ? "whatsapp" : "email",
        ageBand,
        accessToken: continuation?.accessToken,
        legalVersion: version ?? undefined,
        acceptedTerms: terms ? "true" : undefined,
        acknowledgedPrivacyNotice: privacy ? "true" : undefined,
      },
    })
  const request = useMutation(
    trpc.auth.requestMobileOwnerOtp.mutationOptions({
      onSuccess: sent,
      onError: (e) => setError(e.message),
    }),
  )
  const requestPhone = useMutation(
    trpc.auth.requestPhoneOtp.mutationOptions({
      onSuccess: sent,
      onError: (e) => setError(e.message),
    }),
  )
  const busy =
    request.isPending ||
    requestPhone.isPending ||
    google.isPending ||
    apple.isPending
  const ready = Boolean(
    common.businessName && linkReady && ageBand && legalReady && !busy,
  )
  const contactReady = useWhatsApp
    ? /^\+[1-9]\d{7,14}$/.test(phoneValue)
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  function sendCode() {
    if (!ready || !contactReady || !name.trim()) return
    setError(null)
    if (useWhatsApp) {
      const { accessToken: _token, ...profile } = common
      requestPhone.mutate({ ...profile, phone: phoneValue })
    } else request.mutate({ ...common, email: email.trim().toLowerCase() })
  }
  return (
    <GreenTillAuthScreen
      title="Start your business on ẸwáTrade"
      subtitle="Your business name and how you’ll sign in."
      progress={1}
      progressTotal={3}
      motionKey="account"
      backHref="/login"
      stage={
        <SetupPreviewStage
          businessName={businessName}
          ownerLine={
            name.trim() ? { title: name.trim(), subtitle: "Owner" } : undefined
          }
          chips={["Your store link", "One login"]}
        />
      }
      testID="green-gate-setup-account"
    >
      <QaQuickFillButton
        formId="mobile.signup.account"
        isDirty={Boolean(name || email || businessName)}
        onFill={(context, sequence) => {
          const b = createBusinessFixture(context, sequence)
          const person = createFixtureIdentity(context, {
            formId: "mobile.signup.account",
            sequence,
          })
          setBusinessName(b.businessName)
          setSlug(normalizeStoreLink(b.businessName))
          setSlugEdited(false)
          setName(person.fullName)
          setEmail(person.email)
          setError(null)
        }}
      />
      <FormField
        label="Business name"
        value={businessName}
        variant="green-gate"
        maxLength={120}
        editable={!busy && !continuation}
        onChangeText={(v) => {
          setBusinessName(v)
          if (!slugEdited) setSlug(normalizeStoreLink(v))
        }}
      />
      <StoreLinkField
        value={slug}
        email={email}
        onChange={(v) => {
          setSlugEdited(true)
          setSlug(v)
        }}
        onCanonicalize={setSlug}
        onAvailability={setLinkReady}
      />
      <FormField
        label="Your name"
        value={name}
        onChangeText={setName}
        maxLength={120}
        variant="green-gate"
        editable={!busy}
        textContentType="name"
      />
      {useWhatsApp ? (
        <PhoneField
          label="WhatsApp number"
          countryCode={phoneCountry}
          onCountryChange={setPhoneCountry}
          value={phone}
          onChangeText={setPhone}
          variant="green-gate"
          editable={!busy}
        />
      ) : (
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          variant="green-gate"
          editable={!busy && !continuation}
        />
      )}
      {!continuation && whatsapp.data?.enabled ? (
        <AuthMethodButton
          icon={useWhatsApp ? "Mail" : "WhatsApp"}
          label={useWhatsApp ? "Use email instead" : "Use WhatsApp instead"}
          disabled={busy}
          onPress={() => {
            setUseWhatsApp(!useWhatsApp)
            setError(null)
          }}
        />
      ) : null}
      <Text className="text-xs font-bold text-foreground">Your age</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Your age"
        className={largeText ? "gap-2" : "flex-row flex-wrap gap-2"}
      >
        {ages.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: age === item.key }}
            className={`min-h-11 justify-center rounded-full border px-3.5 ${age === item.key ? "border-primary bg-primary/10" : "border-border bg-card"}`}
            disabled={busy}
            onPress={() => setAge(item.key)}
          >
            <Text className="text-xs font-semibold text-foreground">
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {age === "UNDER_13" ? (
        <>
          <StatusBanner
            title="Not available under 13"
            message="ẸwáTrade is available from age 13. Nothing you typed has been saved."
            tone="warning"
            icon="Info"
          />
          <AuthActionButton onPress={() => router.replace("/login")}>
            Close setup
          </AuthActionButton>
        </>
      ) : null}
      {publication.data?.acceptanceRequired ? (
        <SignupLegalChoices
          effective={publication.data.effective}
          signupAvailable={publication.data.signupAvailable}
          version={publication.data.version}
          effectiveDate={publication.data.effectiveDate}
          acceptedTerms={terms}
          acknowledgedPrivacyNotice={privacy}
          onAcceptedTermsChange={(v) =>
            setLegal({ version: version ?? "", terms: v, privacy })
          }
          onAcknowledgedPrivacyNoticeChange={(v) =>
            setLegal({ version: version ?? "", terms, privacy: v })
          }
        />
      ) : null}
      {publication.isError ? (
        <>
          <StatusBanner
            title="Policies unavailable"
            message="Connect and try the policy check again."
            tone="destructive"
            icon="TriangleAlert"
          />
          <AuthMethodButton
            label="Retry policy check"
            onPress={() => void publication.refetch()}
          />
        </>
      ) : null}
      {error ? (
        <StatusBanner
          title="Review your details"
          message={error}
          tone="destructive"
          icon="TriangleAlert"
        />
      ) : null}
      <AuthActionButton
        disabled={!ready || !name.trim() || !contactReady}
        isLoading={request.isPending || requestPhone.isPending}
        onPress={sendCode}
      >
        {useWhatsApp ? "Send code on WhatsApp" : "Send code to email"}
      </AuthActionButton>
      <AuthDivider label="or" />
      <AuthMethodButton
        label="Continue with Google"
        brandIcon="google"
        onPress={() => void google.startGoogleAuth()}
        disabled={!ready}
        pending={google.isPending}
      />
      <AppleAuthButton
        onPress={() => void apple.startAppleAuth()}
        disabled={!ready}
      />
      <AuthMethodButton
        label="Already have an account? Sign in"
        onPress={() => router.replace("/login")}
      />
      <Text className="text-xs text-muted-foreground">
        Google and Apple still need your business name, store link and age
        above.
      </Text>
    </GreenTillAuthScreen>
  )
}
