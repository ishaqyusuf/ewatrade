import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { type RetailOpsBusiness, useBusinessStore } from "@/store/businessStore"
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { forwardRef, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type BusinessSwitchSheetProps = {
  onComplete?: () => void
}

type BusinessSwitchContentProps = BusinessSwitchSheetProps & {
  presentation?: "screen" | "sheet"
}

const BUSINESS_PREVIEW_LIMIT = 8

function BusinessRow({
  business,
  onPress,
  selected,
}: {
  business: RetailOpsBusiness
  onPress: () => void
  selected: boolean
}) {
  const metadata = [business.category, business.country, business.salesMethod]
    .filter(Boolean)
    .join(" - ")

  return (
    <SecondaryOperationalRow
      detail={`${business.type ?? "Retail"} - ${business.currency ?? "NGN"}`}
      icon="Building2"
      metadata={metadata}
      onPress={onPress}
      selected={selected}
      title={business.name}
      trailing={
        <StatusBadge
          icon={selected ? "CircleCheck" : "Building2"}
          label={selected ? "Active" : (business.currency ?? "NGN")}
          tone={selected ? "primary" : "muted"}
        />
      }
    >
      {selected ? (
        <StatusBadge label="Current workspace" tone="success" />
      ) : null}
    </SecondaryOperationalRow>
  )
}

export function BusinessSwitchContent({
  onComplete,
  presentation = "sheet",
}: BusinessSwitchContentProps) {
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const businesses = useBusinessStore((state) => state.businesses)
  const createBusiness = useBusinessStore((state) => state.createBusiness)
  const setActiveBusiness = useBusinessStore((state) => state.setActiveBusiness)
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const [businessName, setBusinessName] = useState("")
  const [businessQuery, setBusinessQuery] = useState("")
  const [category, setCategory] = useState("")
  const [country, setCountry] = useState("Nigeria")
  const [currency, setCurrency] = useState("NGN")
  const [salesMethod, setSalesMethod] = useState("In-store sales")
  const [type, setType] = useState("Retail")
  const subscription = getBusinessSubscription(subscriptions, activeBusinessId)
  const plan = getPlan(subscription.planId)
  const filteredBusinesses = useMemo(() => {
    const normalizedQuery = businessQuery.trim().toLowerCase()

    if (!normalizedQuery) return businesses

    return businesses.filter((business) =>
      [
        business.name,
        business.type,
        business.currency,
        business.country,
        business.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [businessQuery, businesses])
  const visibleBusinesses = useMemo(
    () => filteredBusinesses.slice(0, BUSINESS_PREVIEW_LIMIT),
    [filteredBusinesses],
  )
  const isAtBusinessLimit = businesses.length >= plan.limits.businesses
  const canCreate = !isAtBusinessLimit && !!businessName.trim()

  const submit = () => {
    if (!canCreate) return

    createBusiness({
      category,
      country,
      currency,
      name: businessName,
      salesMethod,
      type,
    })
    setBusinessName("")
    setCategory("")
    setCountry("Nigeria")
    setCurrency("NGN")
    setSalesMethod("In-store sales")
    setType("Retail")
  }

  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <SecondarySheetHeader
        description="Switch between businesses or add another business under this account."
        icon="Building2"
        title="Business workspace"
      />

      <View className="gap-3">
        <Text className="text-base font-bold text-foreground">
          Your businesses
        </Text>
        {businesses.length > BUSINESS_PREVIEW_LIMIT ? (
          <FormField
            label="Find business"
            leadingIcon="Search"
            onChangeText={setBusinessQuery}
            placeholder="Search businesses"
            value={businessQuery}
          />
        ) : null}
        {businesses.length > 0 ? (
          visibleBusinesses.length > 0 ? (
            <>
              {visibleBusinesses.map((business) => (
                <BusinessRow
                  business={business}
                  key={business.id}
                  onPress={() => setActiveBusiness(business.id)}
                  selected={activeBusinessId === business.id}
                />
              ))}
              {filteredBusinesses.length > visibleBusinesses.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Showing first {visibleBusinesses.length} of{" "}
                  {filteredBusinesses.length} matching businesses.
                </Text>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="Search"
              message="Try another business, branch, currency, or category."
              title="No matching businesses"
            />
          )
        ) : (
          <EmptyState
            icon="Building2"
            message="Create a business to scope inventory, staff, and sales."
            title="No business yet"
          />
        )}
      </View>

      <View className="gap-4">
        <Text className="text-base font-bold text-foreground">
          Add business
        </Text>
        <FormField
          label="Business name"
          leadingIcon="Building2"
          onChangeText={setBusinessName}
          placeholder="Enter business or branch name"
          value={businessName}
        />
        <View className="flex-row gap-3">
          <FormField
            containerClassName="flex-1"
            label="Type"
            leadingIcon="FileText"
            onChangeText={setType}
            placeholder="Enter business type"
            value={type}
          />
          <FormField
            containerClassName="flex-1"
            label="Currency"
            leadingIcon="CircleDollarSign"
            onChangeText={setCurrency}
            placeholder="Enter currency code"
            value={currency}
          />
        </View>
        <View className="flex-row gap-3">
          <FormField
            containerClassName="flex-1"
            label="Country"
            leadingIcon="MapPin"
            onChangeText={setCountry}
            placeholder="Enter country"
            value={country}
          />
          <FormField
            containerClassName="flex-1"
            label="Category"
            leadingIcon="List"
            onChangeText={setCategory}
            placeholder="Enter product category"
            value={category}
          />
        </View>
        <FormField
          label="Sales method"
          leadingIcon="Wallet"
          onChangeText={setSalesMethod}
          placeholder="Enter sales method"
          value={salesMethod}
        />
      </View>

      {isAtBusinessLimit ? (
        <StatusBanner
          icon="TriangleAlert"
          message={`${plan.name} allows ${plan.limits.businesses} business${plan.limits.businesses === 1 ? "" : "es"}. Upgrade before adding another business.`}
          title="Business limit reached"
          tone="destructive"
        />
      ) : null}

      <ActionButton disabled={!canCreate} onPress={submit}>
        Add business
      </ActionButton>
      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={320}
      contentContainerStyle={{ paddingBottom: 240 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const BusinessSwitchSheet = forwardRef<
  BottomSheetModal,
  BusinessSwitchSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Businesses"
    >
      <BusinessSwitchContent {...props} presentation="sheet" />
    </Modal>
  )
})

BusinessSwitchSheet.displayName = "BusinessSwitchSheet"
