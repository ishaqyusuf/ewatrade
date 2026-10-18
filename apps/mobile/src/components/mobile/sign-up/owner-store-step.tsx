import { CountrySelect } from "@/components/mobile/country-select"
import { CurrencySelector } from "@/components/mobile/currency-selector"
import { CurrentLocationCard } from "@/components/mobile/current-location-card"
import { FormField } from "@/components/mobile/form-field"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useCurrentAddress } from "@/hooks/use-current-address"
import { createBusinessFixture } from "@/internal-tooling/fixture-recipes"
import type { BusinessOperatingModel } from "@ewatrade/utils/business-profiles"
import { findBusinessType } from "@ewatrade/utils/business-types"
import { currencyForCountry } from "@ewatrade/utils/countries"
import type {
  OwnerSetupBusiness,
  OwnerSetupDraft,
} from "@ewatrade/utils/owner-signup"
import { BusinessTypeAvatar } from "./business-type-avatar"

const offers: {
  key: BusinessOperatingModel
  label: string
  example: string
}[] = [
  {
    key: "products",
    label: "I sell",
    example: "Products, food, stock or supplies",
  },
  {
    key: "services",
    label: "I offer services",
    example: "Work, repairs, appointments or deliveries",
  },
  {
    key: "products_and_services",
    label: "I sell and offer services",
    example: "Products alongside work or services",
  },
]
export function OwnerStoreStep({
  business,
  plan,
  onChange,
  onChangeGrouping,
}: {
  business: OwnerSetupBusiness
  plan: OwnerSetupDraft["planId"]
  onChangeGrouping: () => void
  onChange: (patch: Partial<OwnerSetupBusiness>) => void
}) {
  const location = useCurrentAddress()
  return (
    <View className="gap-4">
      <QaQuickFillButton
        formId="mobile.signup.store"
        isDirty={Boolean(business.description || business.addressLine1)}
        onFill={(context, sequence) => {
          const fixture = createBusinessFixture(context, sequence)
          onChange({
            countryCode: "NG",
            currencyCode:
              fixture.currencyCode as OwnerSetupBusiness["currencyCode"],
            addressLine1: fixture.addressLine1,
            city: fixture.city,
          })
        }}
      />
      <View className="gap-3 rounded-[20px] bg-card p-3.5">
        <View className="flex-row items-center gap-3">
          <BusinessTypeAvatar typeKey={business.typeKeys[0] ?? "other"} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-foreground">
              {business.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {business.typeKeys
                .map((key) =>
                  key === "other"
                    ? business.otherType
                    : findBusinessType(key)?.label,
                )
                .join(" · ")}
            </Text>
          </View>
        </View>
        <Text className="text-xs text-primary">
          {business.slug}.ewatrade.com
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onChangeGrouping}
        className="min-h-11 justify-center"
      >
        <Text className="text-xs font-bold text-primary">
          Change business types or grouping
        </Text>
      </Pressable>
      <Text className="text-sm font-bold text-foreground">
        What does this business do?
      </Text>
      <Text className="text-xs text-muted-foreground">
        Picked from its type. You can change it.
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="What does this business do?"
        className="overflow-hidden rounded-[20px] bg-card"
      >
        {offers.map((offer, index) => (
          <Pressable
            key={offer.key}
            accessibilityRole="radio"
            accessibilityState={{
              checked: business.operatingModel === offer.key,
            }}
            className="min-h-[72px] flex-row items-center gap-3 px-3.5 py-3"
            onPress={() =>
              onChange({ operatingModel: offer.key, offerTouched: true })
            }
          >
            <View className="flex-1 gap-1">
              <Text className="text-sm font-bold text-foreground">
                {offer.label}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {offer.example}
              </Text>
            </View>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {business.operatingModel === offer.key ? (
                <Icon name="CircleCheck" className="size-5 text-primary" />
              ) : (
                <View className="size-5 rounded-full border border-border" />
              )}
            </View>
            {index < offers.length - 1 ? <RowDivider /> : null}
          </Pressable>
        ))}
      </View>
      <Text className="text-sm font-bold text-foreground">
        Where you trade · optional
      </Text>
      <CurrentLocationCard
        address={location.address}
        error={location.error}
        status={location.status}
        onClear={() => {
          location.clear()
          onChange({ addressLine1: "", city: "", region: "" })
        }}
        onLocate={() =>
          void location.locate().then((address) => {
            if (address)
              onChange({
                addressLine1: address.addressLine1,
                city: address.city,
                region: address.region,
                countryCode: address.countryCode ?? business.countryCode,
                currencyCode:
                  currencyForCountry(
                    address.countryCode ?? business.countryCode,
                  ) ?? business.currencyCode,
              })
          })
        }
      />
      {business.addressLine1 && !location.address ? (
        <Text className="text-xs text-muted-foreground">
          {business.addressLine1}
          {business.city ? `, ${business.city}` : ""}
        </Text>
      ) : null}
      <CountrySelect
        value={business.countryCode}
        renderTrigger={(country, open) => (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center rounded-xl border border-border bg-card px-3.5"
            onPress={open}
          >
            <Text className="text-sm text-foreground">
              {business.countryCode ? country.name : "Choose country"}
            </Text>
          </Pressable>
        )}
        onChange={(countryCode) =>
          onChange({
            countryCode,
            currencyCode:
              currencyForCountry(countryCode) ?? business.currencyCode,
          })
        }
      />
      <CurrencySelector
        value={business.currencyCode}
        onChange={(currencyCode) => onChange({ currencyCode })}
      />
      <FormField
        label="About this store · optional"
        placeholder="A short introduction for customers"
        value={business.description ?? ""}
        onChangeText={(description) => onChange({ description })}
        maxLength={280}
        multiline
        numberOfLines={3}
        variant="green-gate"
        helper={`${business.description?.length ?? 0}/280`}
      />
      <View className="gap-2 rounded-[20px] bg-card p-3.5">
        <Text className="text-sm font-bold text-foreground">
          Your store link
        </Text>
        <Text className="text-sm text-primary">
          {business.slug}.ewatrade.com
        </Text>
        <Text className="text-xs text-muted-foreground">
          {plan === "starter"
            ? "Your first 3 items show here. Upgrade to list everything and let customers message you about prices and stock."
            : "Lists everything you offer. Customer messages are included once your store chat is set up."}
        </Text>
      </View>
    </View>
  )
}
