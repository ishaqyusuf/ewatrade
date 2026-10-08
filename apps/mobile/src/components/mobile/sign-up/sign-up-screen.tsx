import {
  ClassicSignUpCategories,
  ClassicSignUpScreen,
} from "@/components/mobile/appearances/classic/sign-up-screen"
import {
  MarketDaySignUpCategories,
  MarketDaySignUpScreen,
} from "@/components/mobile/appearances/market-day/sign-up-screen"
import { AppleAuthButton } from "@/components/mobile/apple-auth-button"
import {
  AuthActionButton,
  AuthDivider,
  AuthFooterAction,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { CountrySelect } from "@/components/mobile/country-select"
import { CurrencySelector } from "@/components/mobile/currency-selector"
import { CurrentLocationCard } from "@/components/mobile/current-location-card"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useCurrentAddress } from "@/hooks/use-current-address"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMobileAppleAuth } from "@/hooks/use-mobile-apple-auth"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMobileGoogleAuth } from "@/hooks/use-mobile-google-auth"
import {
  createBusinessFixture,
  createFixtureIdentity,
} from "@/internal-tooling/fixture-recipes"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useTRPC } from "@/trpc/client"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZES,
  type BusinessOperatingModel,
  type BusinessOrderChannel,
  type BusinessProfile,
  type BusinessTeamSize,
  type OperatingCurrencyCode,
  findBusinessProfile,
  listBusinessProfiles,
  normalizeOperatingCurrencyCode,
} from "@ewatrade/utils"
import {
  currencyForCountry,
  findCountry,
  getCountry,
  toInternationalPhone,
  toLocalPhone,
} from "@ewatrade/utils/countries"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { Text as NativeText } from "react-native"
import type { ApprovedNativeOnboarding } from "../onboarding/onboarding-continuation-screen"
import { SignUpChoice } from "./sign-up-choice"
import type { SignUpStep } from "./sign-up-presentation"
import { SignupLegalChoices } from "./signup-legal-choices"

export function SignUpScreen({
  ageBand,
  continuation,
}: {
  ageBand: "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
  continuation?: ApprovedNativeOnboarding
}) {
  const largeTextLayout = useLargeTextLayout()
  const appearance = useMobileDesign("sign-up")
  const Screen =
    appearance === "market-day" ? MarketDaySignUpScreen : ClassicSignUpScreen
  const Categories =
    appearance === "market-day"
      ? MarketDaySignUpCategories
      : ClassicSignUpCategories
  const router = useRouter()
  const trpc = useTRPC()
  const [name, setName] = useState(continuation?.fullName ?? "")
  const [businessName, setBusinessName] = useState(
    continuation?.businessName ?? "",
  )
  const [businessProfileKey, setBusinessProfileKey] = useState(
    continuation?.draft.businessProfileKey ?? "",
  )
  const [profileQuery, setProfileQuery] = useState("")
  const [addressLine1, setAddressLine1] = useState(
    continuation?.draft.addressLine1 ?? "",
  )
  const [city, setCity] = useState(continuation?.draft.city ?? "")
  const [region, setRegion] = useState(continuation?.draft.region ?? "")
  const [countryCode, setCountryCode] = useState(
    () => getCountry(continuation?.draft.countryCode).code,
  )
  const dialCode = getCountry(countryCode).dialCode
  const [phone, setPhone] = useState(() =>
    toLocalPhone(
      getCountry(continuation?.draft.countryCode).dialCode,
      continuation?.draft.phone ?? continuation?.phone,
    ),
  )
  const fullPhone = toInternationalPhone(dialCode, phone)
  const [email, setEmail] = useState(continuation?.email ?? "")
  const [currencyCode, setCurrencyCode] = useState<OperatingCurrencyCode>(
    normalizeOperatingCurrencyCode(continuation?.draft.currencyCode),
  )
  const changeCountry = (code: string) => {
    setCountryCode(code)
    // The phone keeps its local digits; only the +code beside it changes.
    const currency = currencyForCountry(code)
    if (currency) setCurrencyCode(currency)
  }
  const currentAddress = useCurrentAddress()
  const fillFromLocation = async () => {
    const found = await currentAddress.locate()
    if (!found) return
    if (found.addressLine1) setAddressLine1(found.addressLine1)
    if (found.city) setCity(found.city)
    if (found.region) setRegion(found.region)
    if (findCountry(found.countryCode)) changeCountry(found.countryCode)
  }
  const [operatingModel, setOperatingModel] = useState<BusinessOperatingModel>(
    BUSINESS_OPERATING_MODELS.find(
      (value) => value.key === continuation?.draft.operatingModel,
    )?.key ?? "products",
  )
  const [orderChannels, setOrderChannels] = useState<BusinessOrderChannel[]>(
    continuation?.draft.orderChannels?.length
      ? BUSINESS_ORDER_CHANNELS.filter((value) =>
          continuation.draft.orderChannels?.includes(value.key),
        ).map((value) => value.key)
      : ["walk_in"],
  )
  const [otherBusinessDescription, setOtherBusinessDescription] = useState(
    continuation?.draft.otherBusinessDescription ?? "",
  )
  const [teamSize, setTeamSize] = useState<BusinessTeamSize>(
    BUSINESS_TEAM_SIZES.find(
      (value) => value.key === continuation?.draft.teamSize,
    )?.key ?? "solo",
  )
  const [step, setStep] = useState<SignUpStep>(
    continuation?.draft.step ?? "businessType",
  )
  const [error, setError] = useState<string | null>(null)
  const [legalChoices, setLegalChoices] = useState({
    version: "",
    acceptedTerms: false,
    acknowledgedPrivacyNotice: false,
  })
  const legalPublication = useQuery(
    trpc.auth.legalPublication.queryOptions(undefined, {
      enabled: step === "account",
      retry: false,
    }),
  )
  const quickFillSnapshot = useRef<{
    addressLine1: string
    businessName: string
    businessProfileKey: string
    city: string
    countryCode: string
    currencyCode: OperatingCurrencyCode
    region: string
    email: string
    name: string
    operatingModel: BusinessOperatingModel
    orderChannels: BusinessOrderChannel[]
    otherBusinessDescription: string
    phone: string
    teamSize: BusinessTeamSize
  } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedBusinessName = businessName.trim()
  const hasBusinessContact =
    !!addressLine1.trim() &&
    !!city.trim() &&
    phone.replace(/\D/g, "").length >= 7
  const selectedBusinessProfile = findBusinessProfile(businessProfileKey)
  const visibleBusinessProfiles = useMemo(
    () => listBusinessProfiles({ query: profileQuery }),
    [profileQuery],
  )
  const showProfileSearch = shouldShowListSearch(listBusinessProfiles().length)
  const hasBusinessType = !!selectedBusinessProfile
  const hasBusinessProfile =
    hasBusinessType &&
    orderChannels.length > 0 &&
    (businessProfileKey !== "other-mixed-business" ||
      otherBusinessDescription.trim().length >= 2)
  const legalVersion =
    legalPublication.data?.acceptanceRequired && legalPublication.data.effective
      ? legalPublication.data.version
      : null
  const acceptedTerms =
    legalChoices.version === legalVersion && legalChoices.acceptedTerms
  const acknowledgedPrivacyNotice =
    legalChoices.version === legalVersion &&
    legalChoices.acknowledgedPrivacyNotice
  const hasLegalPages = Boolean(publicLegalUrl("terms"))
  const legalReady =
    legalPublication.isSuccess &&
    legalPublication.data.signupAvailable &&
    (!legalPublication.data.acceptanceRequired ||
      !legalPublication.data.effective ||
      (hasLegalPages &&
        Boolean(legalVersion) &&
        acceptedTerms &&
        acknowledgedPrivacyNotice))
  const legalSignupInput = legalVersion
    ? {
        legalVersion,
        acceptedTerms: acceptedTerms ? (true as const) : undefined,
        acknowledgedPrivacyNotice: acknowledgedPrivacyNotice
          ? (true as const)
          : undefined,
      }
    : {}
  const canContinueWithGoogle =
    !!normalizedBusinessName &&
    !!currencyCode &&
    hasBusinessContact &&
    hasBusinessProfile &&
    legalReady
  const canContinueWithEmail =
    !!name.trim() &&
    !!normalizedBusinessName &&
    !!normalizedEmail &&
    hasBusinessContact &&
    hasBusinessProfile &&
    legalReady
  const saveDraft = useMutation(
    trpc.auth.saveMobileOnboardingDraft.mutationOptions({
      gcTime: 0,
      scope: { id: "onboarding-draft" },
      onError(error) {
        setError(error.message)
      },
    }),
  )
  const draftSnapshot = JSON.stringify({
    step,
    countryCode,
    region: region.trim(),
    phone: fullPhone,
    addressLine1,
    city,
    businessProfileKey,
    currencyCode,
    operatingModel,
    orderChannels,
    otherBusinessDescription,
    teamSize,
  })
  useEffect(() => {
    if (!continuation) return
    const timer = setTimeout(
      () =>
        saveDraft.mutate({
          token: continuation.accessToken,
          draft: JSON.parse(draftSnapshot),
        }),
      800,
    )
    return () => clearTimeout(timer)
  }, [continuation, draftSnapshot, saveDraft.mutate])

  const googleAuth = useMobileGoogleAuth({
    accessToken: continuation?.accessToken,
    ageBand,
    ...legalSignupInput,
    addressLine1: addressLine1.trim(),
    businessProfileKey,
    businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
    businessName: normalizedBusinessName,
    city: city.trim(),
    countryCode,
    currencyCode,
    region: region.trim() || undefined,
    mode: "sign_up",
    name: name.trim() || undefined,
    operatingModel,
    orderChannels,
    otherBusinessDescription: otherBusinessDescription.trim() || undefined,
    phone: fullPhone,
    teamSize,
    onError: setError,
  })
  const appleAuth = useMobileAppleAuth({
    accessToken: continuation?.accessToken,
    ageBand,
    ...legalSignupInput,
    addressLine1: addressLine1.trim(),
    businessProfileKey,
    businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
    businessName: normalizedBusinessName,
    city: city.trim(),
    countryCode,
    currencyCode,
    region: region.trim() || undefined,
    mode: "sign_up",
    name: name.trim() || undefined,
    operatingModel,
    orderChannels,
    otherBusinessDescription: otherBusinessDescription.trim() || undefined,
    phone: fullPhone,
    teamSize,
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
            ...(continuation ? { accessToken: continuation.accessToken } : {}),
            addressLine1: addressLine1.trim(),
            ageBand,
            businessProfileKey,
            businessProfileVersion: String(BUSINESS_PROFILE_SCHEMA_VERSION),
            businessName: normalizedBusinessName,
            city: city.trim(),
            countryCode,
            currencyCode,
            region: region.trim() || undefined,
            email: normalizedEmail,
            ...(legalVersion
              ? {
                  acceptedTerms: "true",
                  acknowledgedPrivacyNotice: "true",
                  legalVersion,
                }
              : {}),
            mode: "sign-up",
            name: name.trim(),
            operatingModel,
            orderChannels: orderChannels.join(","),
            ...(otherBusinessDescription.trim()
              ? {
                  otherBusinessDescription: otherBusinessDescription.trim(),
                }
              : {}),
            phone: fullPhone,
            teamSize,
          },
        })
      },
    }),
  )

  const continueWithEmail = () => {
    if (!canContinueWithEmail) return

    requestOtpMutation.mutate({
      accessToken: continuation?.accessToken,
      ageBand,
      ...legalSignupInput,
      addressLine1: addressLine1.trim(),
      businessProfileKey,
      businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
      businessName: normalizedBusinessName,
      city: city.trim(),
      countryCode,
      currencyCode,
      region: region.trim() || undefined,
      email: normalizedEmail,
      mode: "sign_up",
      name: name.trim(),
      operatingModel,
      orderChannels,
      otherBusinessDescription: otherBusinessDescription.trim() || undefined,
      phone: fullPhone,
      teamSize,
    })
  }

  const continueWithGoogle = () => {
    if (!canContinueWithGoogle) {
      setError(
        legalReady
          ? "Enter your business details first, then continue with Google."
          : "Review the current Terms and Privacy Notice before continuing.",
      )
      return
    }

    void googleAuth.startGoogleAuth()
  }

  const selectBusinessType = (profile: BusinessProfile) => {
    setError(null)
    setBusinessProfileKey(profile.key)
    setOperatingModel(
      profile.recommendedItemKinds.length === 1
        ? profile.recommendedItemKinds[0] === "service"
          ? "services"
          : "products"
        : "products_and_services",
    )
    setProfileQuery("")
    setStep("profile")
  }

  const continueToBusiness = () => {
    if (!hasBusinessProfile) {
      setError("Tell us what the business will manage and how customers order.")
      return
    }
    setError(null)
    setStep("business")
  }

  const continueToAccount = () => {
    if (!normalizedBusinessName || !hasBusinessContact) {
      setError("Add your business address and phone to continue.")
      return
    }
    setError(null)
    setStep("account")
  }

  const toggleOrderChannel = (channel: BusinessOrderChannel) => {
    setOrderChannels((current) =>
      current.includes(channel)
        ? current.filter((value) => value !== channel)
        : [...current, channel],
    )
  }

  const goBack = () => {
    setError(null)
    if (step === "account") {
      setStep("business")
    } else if (step === "business") {
      setStep("profile")
    } else if (step === "profile") {
      setStep("businessType")
    } else {
      router.replace("/login")
    }
  }

  const header =
    step === "businessType"
      ? {
          step: 1,
          subtitle: "Pick the closest match. You can fine-tune it next.",
          title: "What kind of business do you run?",
        }
      : step === "profile"
        ? {
            step: 2,
            subtitle: "What you sell and how customers order.",
            title: "How does your business work?",
          }
        : step === "business"
          ? {
              step: 3,
              subtitle: "Your team and customers will see these.",
              title: "Your business details",
            }
          : {
              step: 4,
              subtitle:
                [
                  normalizedBusinessName,
                  selectedBusinessProfile?.title.split(",")[0]?.trim(),
                  city.trim(),
                ]
                  .filter(Boolean)
                  .join(" · ") || "Choose your owner identity and sign in.",
              title: "Create your owner account",
            }

  const stepNumber = header.step
  const channelLabels: Record<BusinessOrderChannel, string> = {
    walk_in: "Walk-in",
    phone_whatsapp: "WhatsApp",
    delivery_pickup: "Delivery",
    online: "Online",
    sales_representatives: "Sales reps",
  }
  const previewChips = [
    stepNumber >= 2 && selectedBusinessProfile
      ? selectedBusinessProfile.title.split(",")[0]?.trim()
      : "",
    stepNumber >= 3 && orderChannels.length
      ? orderChannels
          .slice(0, 2)
          .map((channel) => channelLabels[channel])
          .join(" · ")
      : "",
    stepNumber >= 4 ? city.trim() : "",
  ].filter((chip): chip is string => Boolean(chip))
  const preview = {
    businessName: normalizedBusinessName,
    chips: previewChips,
    ownerLine:
      stepNumber >= 4
        ? {
            title: name.trim()
              ? `Owner · ${name.trim().split(/\s+/)[0]}`
              : "Owner account",
            subtitle:
              BUSINESS_TEAM_SIZES.find((size) => size.key === teamSize)
                ?.label ?? "Your team",
          }
        : undefined,
  }

  return (
    <Screen
      key={step}
      step={step}
      header={header}
      preview={preview}
      onBack={goBack}
      footer={
        step === "businessType" &&
        showProfileSearch &&
        appearance === "market-day" ? (
          <BottomSearchFooter
            accessibilityLabel="Search business categories"
            label="Business category"
            onChangeText={setProfileQuery}
            placeholder="Search categories"
            totalCount={listBusinessProfiles().length}
            value={profileQuery}
            variant={appearance === "market-day" ? "market-day" : "default"}
          />
        ) : null
      }
    >
      <QaQuickFillButton
        canUndo={canUndoQuickFill}
        formId="mobile.signup"
        isDirty={
          step === "businessType"
            ? Boolean(businessProfileKey)
            : step === "profile"
              ? operatingModel !== "products" ||
                orderChannels.join(",") !== "walk_in" ||
                Boolean(otherBusinessDescription) ||
                teamSize !== "solo"
              : step === "business"
                ? Boolean(businessName || addressLine1 || city || phone) ||
                  currencyCode !== "NGN"
                : Boolean(name || email)
        }
        onFill={(context, sequence) => {
          quickFillSnapshot.current = {
            addressLine1,
            businessName,
            businessProfileKey,
            city,
            countryCode,
            currencyCode,
            email,
            name,
            region,
            operatingModel,
            orderChannels,
            otherBusinessDescription,
            phone,
            teamSize,
          }
          if (step === "businessType" || step === "profile") {
            const profile = selectedBusinessProfile ?? listBusinessProfiles()[0]
            if (profile) {
              setBusinessProfileKey(profile.key)
              setOperatingModel(
                profile.recommendedItemKinds.length === 1
                  ? profile.recommendedItemKinds[0] === "service"
                    ? "services"
                    : "products"
                  : "products_and_services",
              )
            }
            setOrderChannels(["walk_in", "online"])
            setOtherBusinessDescription("")
            setTeamSize("2_5")
          } else if (step === "business") {
            const fixture = createBusinessFixture(context, sequence)
            setBusinessName(fixture.businessName)
            setAddressLine1(fixture.addressLine1)
            setCity(fixture.city)
            setCountryCode("NG")
            setRegion("Lagos")
            setPhone(toLocalPhone("1", fixture.phone))
            setCurrencyCode(fixture.currencyCode as OperatingCurrencyCode)
          } else {
            const fixture = createFixtureIdentity(context, {
              formId: "mobile.signup",
              sequence,
            })
            setName(fixture.fullName)
            setEmail(fixture.email)
          }
          setCanUndoQuickFill(true)
          setError(null)
        }}
        onUndo={() => {
          const snapshot = quickFillSnapshot.current
          if (!snapshot) return
          setAddressLine1(snapshot.addressLine1)
          setBusinessName(snapshot.businessName)
          setBusinessProfileKey(snapshot.businessProfileKey)
          setCity(snapshot.city)
          setCountryCode(snapshot.countryCode)
          setRegion(snapshot.region)
          setCurrencyCode(snapshot.currencyCode)
          setEmail(snapshot.email)
          setName(snapshot.name)
          setOperatingModel(snapshot.operatingModel)
          setOrderChannels(snapshot.orderChannels)
          setOtherBusinessDescription(snapshot.otherBusinessDescription)
          setPhone(snapshot.phone)
          setTeamSize(snapshot.teamSize)
          quickFillSnapshot.current = null
          setCanUndoQuickFill(false)
        }}
      />

      {step === "businessType" ? (
        <View className="gap-5">
          {appearance === "classic" && showProfileSearch ? (
            <FormField
              accessibilityLabel="Search business types"
              label="Search business types"
              autoCapitalize="none"
              onChangeText={setProfileQuery}
              placeholder="Search business types"
              value={profileQuery}
              variant="search"
            />
          ) : null}
          <Categories
            onSelect={selectBusinessType}
            profiles={visibleBusinessProfiles}
            selectedKey={businessProfileKey}
          />
          {visibleBusinessProfiles.length === 0 ? (
            <StatusBanner
              icon="Search"
              message="No business type matches that search. Try a broader term."
              tone="muted"
            />
          ) : null}
        </View>
      ) : step === "profile" ? (
        <View className="gap-5">
          {selectedBusinessProfile ? (
            appearance === "classic" ? (
              <SuggestionNote
                text={`${selectedBusinessProfile.title.split(",")[0]?.trim()} suggestions come first when you add items.`}
              />
            ) : (
              <StatusBanner
                icon="Briefcase"
                message={`${selectedBusinessProfile.title} suggestions will appear first when you add Products or Services.`}
                title="Selected business type"
                tone="primary"
              />
            )
          ) : null}
          {businessProfileKey === "other-mixed-business" ? (
            <FormField
              label="What does your business do?"
              onChangeText={setOtherBusinessDescription}
              placeholder="Describe your products or services"
              value={otherBusinessDescription}
              variant={appearance === "classic" ? "green-gate" : "auth"}
            />
          ) : null}

          <View className="gap-2">
            <Text
              className={
                appearance === "classic"
                  ? "text-[12.5px] font-extrabold [-rn-line-height:18] text-foreground"
                  : "text-sm font-bold text-foreground"
              }
            >
              What will you manage?
            </Text>
            <View
              className={largeTextLayout ? "gap-2" : "flex-row flex-wrap gap-2"}
            >
              {BUSINESS_OPERATING_MODELS.map((model) => (
                <SignUpChoice
                  appearance={appearance}
                  key={model.key}
                  label={model.label}
                  selected={operatingModel === model.key}
                  onPress={() => setOperatingModel(model.key)}
                />
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text
              className={
                appearance === "classic"
                  ? "text-[12.5px] font-extrabold [-rn-line-height:18] text-foreground"
                  : "text-sm font-bold text-foreground"
              }
            >
              How do customers order?
            </Text>
            <View
              className={largeTextLayout ? "gap-2" : "flex-row flex-wrap gap-2"}
            >
              {BUSINESS_ORDER_CHANNELS.map((channel) => (
                <SignUpChoice
                  appearance={appearance}
                  key={channel.key}
                  label={channel.label}
                  selected={orderChannels.includes(channel.key)}
                  onPress={() => toggleOrderChannel(channel.key)}
                  multiple
                />
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text
              className={
                appearance === "classic"
                  ? "text-[12.5px] font-extrabold [-rn-line-height:18] text-foreground"
                  : "text-sm font-bold text-foreground"
              }
            >
              Team size
            </Text>
            <View
              className={largeTextLayout ? "gap-2" : "flex-row flex-wrap gap-2"}
            >
              {BUSINESS_TEAM_SIZES.map((size) => (
                <SignUpChoice
                  appearance={appearance}
                  key={size.key}
                  label={
                    appearance === "classic"
                      ? size.label.replace(" people", "")
                      : size.label
                  }
                  selected={teamSize === size.key}
                  onPress={() => setTeamSize(size.key)}
                />
              ))}
            </View>
          </View>
        </View>
      ) : step === "business" ? (
        <View className="gap-3">
          <FormField
            helper={
              appearance === "classic"
                ? undefined
                : "This is the name customers and your team will see."
            }
            label="Business name"
            leadingIcon={appearance === "classic" ? undefined : "Building2"}
            onChangeText={setBusinessName}
            placeholder="Enter your business name"
            editable={!continuation}
            value={businessName}
            variant={appearance === "classic" ? "green-gate" : "auth"}
          />
          <CurrentLocationCard
            address={currentAddress.address}
            error={currentAddress.error}
            onClear={currentAddress.clear}
            onLocate={() => void fillFromLocation()}
            status={currentAddress.status}
          />
          <FormField
            label="Business address"
            leadingIcon={appearance === "classic" ? undefined : "MapPin"}
            onChangeText={setAddressLine1}
            placeholder="Street address"
            value={addressLine1}
            variant={appearance === "classic" ? "green-gate" : "auth"}
          />
          <View className={largeTextLayout ? "gap-3" : "flex-row gap-3"}>
            <View className={largeTextLayout ? undefined : "flex-1"}>
              <CountrySelect onChange={changeCountry} value={countryCode} />
            </View>
            <FormField
              containerClassName={largeTextLayout ? undefined : "flex-1"}
              label="State"
              onChangeText={setRegion}
              placeholder="State"
              textContentType="addressState"
              value={region}
              variant={appearance === "classic" ? "green-gate" : "auth"}
            />
          </View>
          <FormField
            label="City"
            onChangeText={setCity}
            placeholder="City"
            textContentType="addressCity"
            value={city}
            variant={appearance === "classic" ? "green-gate" : "auth"}
          />
          <FormField
            accessibilityLabel={`Phone, plus ${dialCode}`}
            keyboardType="phone-pad"
            label="Phone"
            leadingText={`+${dialCode}`}
            onChangeText={setPhone}
            placeholder="803 123 4567"
            textContentType="telephoneNumber"
            value={phone}
            variant={appearance === "classic" ? "green-gate" : "auth"}
          />
          <CurrencySelector
            appearance={appearance === "classic" ? "chips" : "classic"}
            label={appearance === "classic" ? "Currency" : undefined}
            onChange={setCurrencyCode}
            value={currencyCode}
          />
        </View>
      ) : (
        <View className="gap-3">
          <FormField
            label="Your name"
            leadingIcon={appearance === "classic" ? undefined : "User"}
            onChangeText={setName}
            placeholder="Enter your full name"
            textContentType="name"
            value={name}
            variant={appearance === "classic" ? "green-gate" : "auth"}
          />
          <FormField
            autoCapitalize="none"
            keyboardType="email-address"
            label={appearance === "classic" ? "Email" : "Email address"}
            leadingIcon={appearance === "classic" ? undefined : "Mail"}
            onChangeText={setEmail}
            placeholder="Enter your email address"
            textContentType="emailAddress"
            editable={!continuation}
            value={email}
            variant={appearance === "classic" ? "green-gate" : "auth"}
          />
          {legalPublication.isSuccess ? (
            legalPublication.data.acceptanceRequired ? (
              <SignupLegalChoices
                effective={legalPublication.data.effective}
                signupAvailable={legalPublication.data.signupAvailable}
                version={legalPublication.data.version}
                effectiveDate={legalPublication.data.effectiveDate}
                acceptedTerms={acceptedTerms}
                acknowledgedPrivacyNotice={acknowledgedPrivacyNotice}
                onAcceptedTermsChange={(accepted) => {
                  if (!legalVersion) return
                  setLegalChoices((current) => ({
                    version: legalVersion,
                    acceptedTerms: accepted,
                    acknowledgedPrivacyNotice:
                      current.version === legalVersion
                        ? current.acknowledgedPrivacyNotice
                        : false,
                  }))
                }}
                onAcknowledgedPrivacyNoticeChange={(acknowledged) => {
                  if (!legalVersion) return
                  setLegalChoices((current) => ({
                    version: legalVersion,
                    acceptedTerms:
                      current.version === legalVersion
                        ? current.acceptedTerms
                        : false,
                    acknowledgedPrivacyNotice: acknowledged,
                  }))
                }}
              />
            ) : null
          ) : legalPublication.error ? (
            <StatusBanner
              icon="TriangleAlert"
              message="We could not check the current Terms. Connect and try again."
              title="Policies unavailable"
              tone="destructive"
            />
          ) : null}
          {legalPublication.error ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center"
              onPress={() => void legalPublication.refetch()}
            >
              <Text className="font-semibold text-primary">
                Retry policy check
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View className="gap-4">
        {step === "profile" ? (
          <AuthActionButton
            appearance={appearance === "market-day" ? "market-day" : "default"}
            disabled={!hasBusinessProfile}
            onPress={continueToBusiness}
            trailingIcon="ArrowRight"
          >
            Continue
          </AuthActionButton>
        ) : step === "business" ? (
          <AuthActionButton
            appearance={appearance === "market-day" ? "market-day" : "default"}
            disabled={!normalizedBusinessName || !hasBusinessContact}
            onPress={continueToAccount}
            trailingIcon="ArrowRight"
          >
            Continue
          </AuthActionButton>
        ) : step === "account" ? (
          <AuthActionButton
            appearance={appearance === "market-day" ? "market-day" : "default"}
            disabled={!canContinueWithEmail}
            isLoading={requestOtpMutation.isPending}
            loadingLabel="Sending code"
            onPress={continueWithEmail}
            trailingIcon="ArrowRight"
          >
            Send verification code
          </AuthActionButton>
        ) : null}
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
            <AuthDivider
              label={appearance === "classic" ? "or" : "Or Continue With"}
              plain={appearance === "classic"}
            />
            <AppleAuthButton
              onPress={appleAuth.startAppleAuth}
              disabled={appleAuth.isPending || !canContinueWithGoogle}
            />
            <AuthMethodButton
              brandIcon="google"
              disabled={googleAuth.isPending || !canContinueWithGoogle}
              label={
                appearance === "classic" ? "Continue with Google" : "Google"
              }
              variant={appearance === "classic" ? "sso" : "default"}
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
        {step === "business" ? (
          <Pressable
            className="min-h-11 items-center justify-center"
            haptic
            onPress={() => {
              setError(null)
              setStep("profile")
            }}
          >
            <Text className="text-sm font-bold text-primary">
              Edit business setup
            </Text>
          </Pressable>
        ) : null}
        {step === "profile" ? (
          <Pressable
            className="min-h-11 items-center justify-center"
            haptic
            onPress={() => {
              setError(null)
              setStep("businessType")
            }}
          >
            <Text className="text-sm font-bold text-primary">
              Choose a different business type
            </Text>
          </Pressable>
        ) : null}
        <AuthFooterAction
          eyebrow="Already have an account?"
          href="/login"
          label="Sign in instead"
        />
      </View>
    </Screen>
  )
}

/** Green Till 03: one-line mint note about category suggestions. */
function SuggestionNote({ text }: { text: string }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.mint,
        borderRadius: 16,
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Icon
        className="size-[16px]"
        color={palette.mintForeground}
        name="WandSparkles"
      />
      <NativeText
        style={{
          color: palette.mintForeground,
          flex: 1,
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {text}
      </NativeText>
    </View>
  )
}
