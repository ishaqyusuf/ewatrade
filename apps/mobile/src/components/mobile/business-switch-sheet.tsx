import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { type RetailOpsBusiness, useBusinessStore } from "@/store/businessStore"
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { forwardRef, useMemo, useState } from "react"
import { View } from "react-native"

type BusinessSwitchSheetProps = {
  onComplete?: () => void
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
  return (
    <Pressable
      className={cn(
        "gap-3 rounded-2xl border border-border bg-card p-4 active:bg-accent",
        selected && "border-primary bg-primary/10",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{business.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {business.type ?? "Retail"} - {business.currency ?? "NGN"}
          </Text>
        </View>
        <Icon
          className={cn(
            "size-base text-muted-foreground",
            selected && "text-primary",
          )}
          name={selected ? "CircleCheck" : "Building2"}
        />
      </View>
    </Pressable>
  )
}

export const BusinessSwitchSheet = forwardRef<
  BottomSheetModal,
  BusinessSwitchSheetProps
>(({ onComplete }, ref) => {
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

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Businesses"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Business workspace
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Switch between businesses or add another business under this
              account.
            </Text>
          </View>

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">
              Your businesses
            </Text>
            {businesses.length > BUSINESS_PREVIEW_LIMIT ? (
              <FormField
                label="Find business"
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
                <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
                  <Text className="font-semibold text-foreground">
                    No matching businesses
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Try another business, branch, currency, or category.
                  </Text>
                </View>
              )
            ) : (
              <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
                <Text className="font-semibold text-foreground">
                  No business yet
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Create a business to scope inventory, staff, and sales.
                </Text>
              </View>
            )}
          </View>

          <View className="gap-4">
            <Text className="text-base font-bold text-foreground">
              Add business
            </Text>
            <FormField
              label="Business name"
              onChangeText={setBusinessName}
              placeholder="Enter business or branch name"
              value={businessName}
            />
            <View className="flex-row gap-3">
              <FormField
                containerClassName="flex-1"
                label="Type"
                onChangeText={setType}
                placeholder="Enter business type"
                value={type}
              />
              <FormField
                containerClassName="flex-1"
                label="Currency"
                onChangeText={setCurrency}
                placeholder="Enter currency code"
                value={currency}
              />
            </View>
            <View className="flex-row gap-3">
              <FormField
                containerClassName="flex-1"
                label="Country"
                onChangeText={setCountry}
                placeholder="Enter country"
                value={country}
              />
              <FormField
                containerClassName="flex-1"
                label="Category"
                onChangeText={setCategory}
                placeholder="Enter product category"
                value={category}
              />
            </View>
            <FormField
              label="Sales method"
              onChangeText={setSalesMethod}
              placeholder="Enter sales method"
              value={salesMethod}
            />
          </View>

          {isAtBusinessLimit ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {plan.name} allows {plan.limits.businesses} business
                {plan.limits.businesses === 1 ? "" : "es"}. Upgrade before
                adding another business.
              </Text>
            </View>
          ) : null}

          <ActionButton disabled={!canCreate} onPress={submit}>
            Add business
          </ActionButton>
          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
})

BusinessSwitchSheet.displayName = "BusinessSwitchSheet"
