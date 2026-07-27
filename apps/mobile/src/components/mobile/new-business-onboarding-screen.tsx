import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { CurrencySelector } from "@/components/mobile/currency-selector"
import { FormField } from "@/components/mobile/form-field"
import {
  SetupChoicePill,
  SetupFlowHeader,
  SetupInlineNotice,
  SetupSection,
  SetupSummaryRow,
} from "@/components/mobile/setup-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { isLocalSessionToken } from "@/lib/session-store"
import { switchMobileBusinessSession } from "@/lib/workspace-feature-availability"
import { useBusinessStore } from "@/store/businessStore"
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
} from "@ewatrade/utils"
import { useMutation } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

const STEPS = ["Type", "Profile", "Details", "Review"]

export function NewBusinessOnboardingScreen() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const createLocalBusiness = useBusinessStore((state) => state.createBusiness)
  const [step, setStep] = useState(1)
  const [businessName, setBusinessName] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [city, setCity] = useState("")
  const [phone, setPhone] = useState("")
  const [currencyCode, setCurrencyCode] = useState<OperatingCurrencyCode>("NGN")
  const [businessProfileKey, setBusinessProfileKey] = useState("")
  const [profileQuery, setProfileQuery] = useState("")
  const [operatingModel, setOperatingModel] =
    useState<BusinessOperatingModel>("products")
  const [orderChannels, setOrderChannels] = useState<BusinessOrderChannel[]>([
    "walk_in",
  ])
  const [otherBusinessDescription, setOtherBusinessDescription] = useState("")
  const [teamSize, setTeamSize] = useState<BusinessTeamSize>("solo")
  const [error, setError] = useState<string | null>(null)
  const selectedBusinessProfile = findBusinessProfile(businessProfileKey)
  const isLocalSession = isLocalSessionToken(auth.token)
  const visibleBusinessProfiles = useMemo(
    () => listBusinessProfiles({ query: profileQuery }),
    [profileQuery],
  )
  const showProfileSearch = shouldShowListSearch(listBusinessProfiles().length)
  const hasDetails =
    businessName.trim().length > 0 &&
    addressLine1.trim().length > 0 &&
    city.trim().length > 0 &&
    phone.trim().length >= 7
  const hasProfile =
    !!selectedBusinessProfile &&
    orderChannels.length > 0 &&
    (businessProfileKey !== "other-mixed-business" ||
      otherBusinessDescription.trim().length >= 2)
  const createBusinessMutation = useMutation(
    trpc.tenant.createBusiness.mutationOptions({
      onError(mutationError) {
        setError(
          mutationError.message ||
            "We could not create this business. Check your connection and try again.",
        )
      },
      onSuccess(business) {
        if (!auth.session) return

        auth.applyAuthenticatedSession(
          switchMobileBusinessSession(auth.session, {
            createdAt: "",
            currency: business.currencyCode,
            id: business.id,
            name: business.name,
            role: business.role,
            slug: business.slug,
          }),
          "/dashboard",
        )
      },
    }),
  )

  const toggleOrderChannel = (channel: BusinessOrderChannel) => {
    setOrderChannels((current) =>
      current.includes(channel)
        ? current.filter((value) => value !== channel)
        : [...current, channel],
    )
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
    setStep(2)
  }

  const continueFlow = () => {
    if (step === 2 && !hasProfile) {
      setError("Tell us what the business will manage and how customers order.")
      return
    }
    if (step === 3 && !hasDetails) {
      setError("Add the business name, address, city, and phone to continue.")
      return
    }

    setError(null)
    setStep((current) => Math.min(current + 1, STEPS.length))
  }

  const goBack = () => {
    setError(null)
    setStep((current) => Math.max(current - 1, 1))
  }

  const submit = () => {
    if (!hasDetails || !hasProfile || !selectedBusinessProfile) return

    setError(null)
    if (isLocalSession) {
      const business = createLocalBusiness({
        category: selectedBusinessProfile.title,
        currency: currencyCode,
        name: businessName.trim(),
        salesMethod: orderChannels
          .map(
            (channel) =>
              BUSINESS_ORDER_CHANNELS.find((item) => item.key === channel)
                ?.label,
          )
          .filter(Boolean)
          .join(", "),
        teamSize:
          BUSINESS_TEAM_SIZES.find((size) => size.key === teamSize)?.label ??
          teamSize,
        type:
          BUSINESS_OPERATING_MODELS.find(
            (model) => model.key === operatingModel,
          )?.label ?? operatingModel,
      })

      if (auth.session) {
        auth.applyAuthenticatedSession(
          switchMobileBusinessSession(auth.session, business),
          "/dashboard",
        )
      }
      return
    }

    createBusinessMutation.mutate({
      addressLine1: addressLine1.trim(),
      businessName: businessName.trim(),
      city: city.trim(),
      currencyCode,
      onboarding: {
        businessProfileKey,
        businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
        operatingModel,
        orderChannels,
        otherBusinessDescription: otherBusinessDescription.trim() || undefined,
        teamSize,
      },
      supportPhone: phone.trim(),
    })
  }

  return (
    <View className="flex-1">
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={180}
        contentContainerStyle={{
          gap: 28,
          paddingBottom: step === 1 && showProfileSearch ? 120 : 48,
          paddingHorizontal: 16,
        }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <SetupFlowHeader
          badgeLabel="New business"
          badgeIcon="Building2"
          currentStep={step}
          description="Set up a separate workspace with its own catalog, customers, staff, and reports."
          steps={STEPS}
          title={
            step === 1
              ? "Choose a business type"
              : step === 2
                ? "How this business works"
                : step === 3
                  ? "Business details"
                  : "Review and create"
          }
        />

        {error ? (
          <StatusBanner
            icon="AlertCircle"
            message={error}
            title="Business setup needs attention"
            tone="destructive"
          />
        ) : null}

        {step === 1 ? (
          <SetupSection
            description="The type personalizes recommendations. It does not restrict what this business can sell."
            title="Business type"
          >
            <View className="-mx-2">
              {visibleBusinessProfiles.map((profile) => {
                const selected = businessProfileKey === profile.key

                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={
                      selected
                        ? "gap-1 border-b border-border bg-primary/10 px-2 py-4"
                        : "gap-1 border-b border-border px-2 py-4 active:bg-muted"
                    }
                    haptic
                    key={profile.key}
                    onPress={() => selectBusinessType(profile)}
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
            {visibleBusinessProfiles.length === 0 ? (
              <SetupInlineNotice
                icon="Search"
                text="No business type matches that search. Try a broader term."
              />
            ) : null}
          </SetupSection>
        ) : null}

        {step === 2 ? (
          <View className="gap-7">
            <SetupSection title="Selected business type">
              <SetupInlineNotice
                icon="Briefcase"
                text={`${selectedBusinessProfile?.title ?? "Your selection"} suggestions will appear first when you add Products or Services.`}
                tone="primary"
              />
              {businessProfileKey === "other-mixed-business" ? (
                <FormField
                  label="What does this business do?"
                  onChangeText={setOtherBusinessDescription}
                  placeholder="Describe the products or services"
                  value={otherBusinessDescription}
                  variant="auth"
                />
              ) : null}
            </SetupSection>

            <SetupSection title="What will you manage?">
              <View className="flex-row flex-wrap gap-2">
                {BUSINESS_OPERATING_MODELS.map((model) => (
                  <SetupChoicePill
                    key={model.key}
                    onPress={() => setOperatingModel(model.key)}
                    selected={operatingModel === model.key}
                  >
                    {model.label}
                  </SetupChoicePill>
                ))}
              </View>
            </SetupSection>

            <SetupSection title="How do customers order?">
              <View className="flex-row flex-wrap gap-2">
                {BUSINESS_ORDER_CHANNELS.map((channel) => (
                  <SetupChoicePill
                    key={channel.key}
                    onPress={() => toggleOrderChannel(channel.key)}
                    selected={orderChannels.includes(channel.key)}
                  >
                    {channel.label}
                  </SetupChoicePill>
                ))}
              </View>
            </SetupSection>

            <SetupSection title="Team size">
              <View className="flex-row flex-wrap gap-2">
                {BUSINESS_TEAM_SIZES.map((size) => (
                  <SetupChoicePill
                    key={size.key}
                    onPress={() => setTeamSize(size.key)}
                    selected={teamSize === size.key}
                  >
                    {size.label}
                  </SetupChoicePill>
                ))}
              </View>
            </SetupSection>
          </View>
        ) : null}

        {step === 3 ? (
          <SetupSection
            description="This information belongs only to the new business."
            title="Identity and location"
          >
            <FormField
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
              placeholder="Enter the street address"
              value={addressLine1}
              variant="auth"
            />
            <View className="flex-row gap-3">
              <FormField
                containerClassName="flex-1"
                label="City"
                onChangeText={setCity}
                placeholder="Enter the city"
                value={city}
                variant="auth"
              />
              <FormField
                containerClassName="flex-1"
                keyboardType="phone-pad"
                label="Phone"
                onChangeText={setPhone}
                placeholder="Enter phone"
                value={phone}
                variant="auth"
              />
            </View>
            <CurrencySelector onChange={setCurrencyCode} value={currencyCode} />
          </SetupSection>
        ) : null}

        {step === 4 ? (
          <View className="gap-6">
            <SetupSection
              description="A new isolated workspace will be created and opened automatically."
              title="Business summary"
            >
              <View>
                <SetupSummaryRow label="Business" value={businessName.trim()} />
                <SetupSummaryRow
                  label="Location"
                  value={`${addressLine1.trim()}, ${city.trim()}`}
                />
                <SetupSummaryRow label="Currency" value={currencyCode} />
                <SetupSummaryRow
                  label="Category"
                  value={selectedBusinessProfile?.title ?? "Not selected"}
                />
                <SetupSummaryRow
                  label="Operations"
                  value={
                    BUSINESS_OPERATING_MODELS.find(
                      (model) => model.key === operatingModel,
                    )?.label ?? operatingModel
                  }
                />
                <SetupSummaryRow
                  label="Team"
                  value={
                    BUSINESS_TEAM_SIZES.find((size) => size.key === teamSize)
                      ?.label ?? teamSize
                  }
                />
              </View>
            </SetupSection>
            <SetupInlineNotice
              icon="ShieldCheck"
              text="The new business keeps its inventory, sales, customers, staff, and settings separate from your other businesses."
              tone="primary"
            />
          </View>
        ) : null}

        <View className="gap-3">
          {step === 1 ? null : step < STEPS.length ? (
            <ActionButton onPress={continueFlow} trailingIcon="ArrowRight">
              Continue
            </ActionButton>
          ) : (
            <ActionButton
              icon="Plus"
              isLoading={createBusinessMutation.isPending}
              loadingLabel="Creating business"
              onPress={submit}
            >
              Create and open business
            </ActionButton>
          )}
          {step > 1 ? (
            <ActionButton onPress={goBack} variant="outline">
              {step === 2 ? "Choose a different business type" : "Back"}
            </ActionButton>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
      {step === 1 && showProfileSearch ? (
        <BottomSearchFooter
          accessibilityLabel="Search business types"
          label="Business type"
          onChangeText={setProfileQuery}
          placeholder="Search business types"
          totalCount={listBusinessProfiles().length}
          value={profileQuery}
        />
      ) : null}
    </View>
  )
}
