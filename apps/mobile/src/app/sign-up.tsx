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
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZES,
  type BusinessOperatingModel,
  type BusinessOrderChannel,
  type BusinessTeamSize,
  type OperatingCurrencyCode,
  findBusinessProfile,
  listBusinessProfiles,
} from "@ewatrade/utils"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { View } from "react-native"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"

export default function SignUpRoute() {
  const router = useRouter()
  const trpc = useTRPC()
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [businessProfileKey, setBusinessProfileKey] = useState("")
  const [profileQuery, setProfileQuery] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [currencyCode, setCurrencyCode] = useState<OperatingCurrencyCode>("NGN")
  const [operatingModel, setOperatingModel] =
    useState<BusinessOperatingModel>("products")
  const [orderChannels, setOrderChannels] = useState<BusinessOrderChannel[]>([
    "walk_in",
  ])
  const [otherBusinessDescription, setOtherBusinessDescription] = useState("")
  const [teamSize, setTeamSize] = useState<BusinessTeamSize>("solo")
  const [step, setStep] = useState<"account" | "business" | "profile">(
    "business",
  )
  const [error, setError] = useState<string | null>(null)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedBusinessName = businessName.trim()
  const hasBusinessContact = !!addressLine1.trim() && !!city.trim() && phone.trim().length >= 7
  const selectedBusinessProfile = findBusinessProfile(businessProfileKey)
  const visibleBusinessProfiles = useMemo(
    () => {
      if (selectedBusinessProfile && !profileQuery.trim()) {
        return [selectedBusinessProfile]
      }
      return listBusinessProfiles({ query: profileQuery })
    },
    [profileQuery, selectedBusinessProfile],
  )
  const hasBusinessProfile =
    !!selectedBusinessProfile &&
    orderChannels.length > 0 &&
    (businessProfileKey !== "other-mixed-business" ||
      otherBusinessDescription.trim().length >= 2)
  const canContinueWithGoogle =
    !!normalizedBusinessName &&
    !!currencyCode &&
    hasBusinessContact &&
    hasBusinessProfile
  const canContinueWithEmail =
    !!name.trim() && !!normalizedBusinessName && !!normalizedEmail && hasBusinessContact
  const googleAuth = useMobileGoogleAuth({
    addressLine1: addressLine1.trim(),
    businessProfileKey,
    businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
    businessName: normalizedBusinessName,
    city: city.trim(),
    currencyCode,
    mode: "sign_up",
    name: name.trim() || undefined,
    operatingModel,
    orderChannels,
    otherBusinessDescription: otherBusinessDescription.trim() || undefined,
    phone: phone.trim(),
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
            addressLine1: addressLine1.trim(),
            businessProfileKey,
            businessProfileVersion: String(BUSINESS_PROFILE_SCHEMA_VERSION),
            businessName: normalizedBusinessName,
            city: city.trim(),
            currencyCode,
            email: normalizedEmail,
            mode: "sign-up",
            name: name.trim(),
            operatingModel,
            orderChannels: orderChannels.join(","),
            otherBusinessDescription: otherBusinessDescription.trim(),
            phone: phone.trim(),
            teamSize,
          },
        })
      },
    }),
  )

  const continueWithEmail = () => {
    if (!canContinueWithEmail) return

    requestOtpMutation.mutate({
      addressLine1: addressLine1.trim(),
      businessProfileKey,
      businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
      businessName: normalizedBusinessName,
      city: city.trim(),
      currencyCode,
      email: normalizedEmail,
      mode: "sign_up",
      name: name.trim(),
      operatingModel,
      orderChannels,
      otherBusinessDescription: otherBusinessDescription.trim() || undefined,
      phone: phone.trim(),
      teamSize,
    })
  }

  const continueWithGoogle = () => {
    if (!canContinueWithGoogle) {
      setError("Enter your business name first, then continue with Google.")
      return
    }

    void googleAuth.startGoogleAuth()
  }

  const continueToProfile = () => {
    if (!normalizedBusinessName || !hasBusinessContact) {
      setError("Add your business address and phone to continue.")
      return
    }
    setError(null)
    setStep("profile")
  }

  const continueToAccount = () => {
    if (!hasBusinessProfile) {
      setError("Choose your business category and how customers order.")
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

  return (
    <MobileScreen
      contentClassName="justify-center gap-7"
      keyboardBottomOffset={420}
    >
      <AuthBrandHeader
        subtitle={
          step === "business"
            ? "First, tell us where your business operates."
            : step === "profile"
              ? "We’ll use this to recommend the right starting setup."
            : "Now choose how you want to sign in."
        }
        title={
          step === "business"
            ? "Create your business"
            : step === "profile"
              ? "Personalize your workspace"
              : "Your account"
        }
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
      ) : step === "profile" ? (
        <View className="gap-5">
          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            label="Business category"
            leadingIcon="Search"
            onChangeText={setProfileQuery}
            placeholder="Search categories"
            value={profileQuery}
            variant="auth"
          />
          <View className="overflow-hidden rounded-2xl border border-border">
            {visibleBusinessProfiles.map((profile) => {
              const selected = businessProfileKey === profile.key
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={
                    selected
                      ? "gap-1 border-b border-border bg-primary/10 px-4 py-4"
                      : "gap-1 border-b border-border px-4 py-4 active:bg-muted"
                  }
                  haptic
                  key={profile.key}
                  onPress={() => {
                    setBusinessProfileKey(profile.key)
                    setOperatingModel(
                      profile.recommendedItemKinds.length === 1
                        ? profile.recommendedItemKinds[0] === "service"
                          ? "services"
                          : "products"
                        : "products_and_services",
                    )
                    setProfileQuery("")
                  }}
                >
                  <Text className="font-bold text-foreground">
                    {profile.title}
                  </Text>
                  <Text className="text-xs leading-5 text-muted-foreground">
                    {profile.description}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          {selectedBusinessProfile ? (
            <StatusBanner
              icon="Briefcase"
              message={`${selectedBusinessProfile.title} suggestions will appear first when you add Products or Services.`}
              tone="primary"
            />
          ) : null}
          {businessProfileKey === "other-mixed-business" ? (
            <FormField
              label="What does your business do?"
              onChangeText={setOtherBusinessDescription}
              placeholder="Describe your products or services"
              value={otherBusinessDescription}
              variant="auth"
            />
          ) : null}

          <View className="gap-2">
            <Text className="text-sm font-bold text-foreground">
              What will you manage?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {BUSINESS_OPERATING_MODELS.map((model) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: operatingModel === model.key }}
                  className={
                    operatingModel === model.key
                      ? "min-h-11 justify-center rounded-full bg-primary px-4"
                      : "min-h-11 justify-center rounded-full bg-muted px-4"
                  }
                  haptic
                  key={model.key}
                  onPress={() => setOperatingModel(model.key)}
                >
                  <Text
                    className={
                      operatingModel === model.key
                        ? "text-sm font-bold text-primary-foreground"
                        : "text-sm font-bold text-foreground"
                    }
                  >
                    {model.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-bold text-foreground">
              How do customers order?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {BUSINESS_ORDER_CHANNELS.map((channel) => {
                const selected = orderChannels.includes(channel.key)
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    className={
                      selected
                        ? "min-h-11 justify-center rounded-full bg-primary px-4"
                        : "min-h-11 justify-center rounded-full bg-muted px-4"
                    }
                    haptic
                    key={channel.key}
                    onPress={() => toggleOrderChannel(channel.key)}
                  >
                    <Text
                      className={
                        selected
                          ? "text-sm font-bold text-primary-foreground"
                          : "text-sm font-bold text-foreground"
                      }
                    >
                      {channel.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-bold text-foreground">Team size</Text>
            <View className="flex-row flex-wrap gap-2">
              {BUSINESS_TEAM_SIZES.map((size) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: teamSize === size.key }}
                  className={
                    teamSize === size.key
                      ? "min-h-11 justify-center rounded-full bg-primary px-4"
                      : "min-h-11 justify-center rounded-full bg-muted px-4"
                  }
                  haptic
                  key={size.key}
                  onPress={() => setTeamSize(size.key)}
                >
                  <Text
                    className={
                      teamSize === size.key
                        ? "text-sm font-bold text-primary-foreground"
                        : "text-sm font-bold text-foreground"
                    }
                  >
                    {size.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
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
            disabled={!normalizedBusinessName || !hasBusinessContact}
            onPress={continueToProfile}
          >
            Continue
          </AuthActionButton>
        ) : step === "profile" ? (
          <AuthActionButton
            disabled={!hasBusinessProfile}
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
                setStep("profile")
              }}
            >
              <Text className="text-sm font-bold text-primary">
                Edit business profile
              </Text>
            </Pressable>
          </>
        ) : null}
        {step === "profile" ? (
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
