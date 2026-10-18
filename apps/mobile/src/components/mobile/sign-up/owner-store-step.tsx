import { CountrySelect } from "@/components/mobile/country-select"
import { CurrencySelector } from "@/components/mobile/currency-selector"
import { CurrentLocationCard } from "@/components/mobile/current-location-card"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useCurrentAddress } from "@/hooks/use-current-address"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { OPERATING_CURRENCIES } from "@ewatrade/utils"
import type { BusinessOperatingModel } from "@ewatrade/utils/business-profiles"
import { findBusinessType } from "@ewatrade/utils/business-types"
import { currencyForCountry } from "@ewatrade/utils/countries"
import type {
  OwnerSetupBusiness,
  OwnerSetupDraft,
} from "@ewatrade/utils/owner-signup"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { ActivityIndicator, TextInput } from "react-native"
import { BusinessTypeAvatar } from "./business-type-avatar"
import { useOwnerSignupColors } from "./owner-signup-frame"

const offers: {
  key: BusinessOperatingModel
  label: string
  example: string
  icon: IconKeys
}[] = [
  {
    key: "products",
    label: "I sell",
    example: "Things customers buy, like eggs, phones or clothes",
    icon: "Package",
  },
  {
    key: "services",
    label: "I offer services",
    example: "Work I do for customers, like repairs, hair or cleaning",
    icon: "Users",
  },
  {
    key: "products_and_services",
    label: "I sell and offer services",
    example: "Both, like a salon that also sells hair products",
    icon: "Store",
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
  const colors = useOwnerSignupColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const largeText = useLargeTextLayout()
  const location = useCurrentAddress()
  const currency = useModal()
  const selectedCurrency = OPERATING_CURRENCIES.find(
    (item) => item.code === business.currencyCode,
  )
  const types = business.typeKeys
    .map((key) =>
      key === "other" ? business.otherType : findBusinessType(key)?.label,
    )
    .join(" + ")
  const input = {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    paddingHorizontal: 14,
  }
  const label = {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700" as const,
    color: colors.mutedForeground,
    marginBottom: 6,
  }
  function locate() {
    void location.locate().then((address) => {
      if (address)
        onChange({
          addressLine1: address.addressLine1,
          city: address.city,
          region: address.region,
          countryCode: address.countryCode ?? business.countryCode,
          currencyCode:
            currencyForCountry(address.countryCode ?? business.countryCode) ??
            business.currencyCode,
        })
    })
  }
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <BusinessTypeAvatar
          typeKey={business.typeKeys[0] ?? "other"}
          size={40}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "700",
              color: colors.foreground,
            }}
          >
            {types}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: colors.mutedForeground,
            }}
          >
            {business.slug}.ewatrade.com
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onChangeGrouping}
          hitSlop={8}
          style={{ minHeight: 32, justifyContent: "center" }}
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "800",
              color: colors.primary,
            }}
          >
            Change
          </Text>
        </Pressable>
      </View>
      <Text style={{ ...label, marginBottom: 8 }}>
        What does this business do?
        {!business.offerTouched ? (
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.mutedForeground,
            }}
          >
            {" "}
            · picked from its type
          </Text>
        ) : null}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="What does this business do?"
        style={{ gap: 8 }}
      >
        {offers.map((offer) => {
          const selected = business.operatingModel === offer.key
          return (
            <Pressable
              key={offer.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() =>
                onChange({ operatingModel: offer.key, offerTouched: true })
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 16,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: 1.5,
                borderColor: selected ? colors.primary : "transparent",
                backgroundColor: selected ? colors.accent : colors.background,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={offer.icon} size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 16,
                    lineHeight: 22,
                    fontWeight: "700",
                    color: colors.foreground,
                  }}
                >
                  {offer.label}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 14,
                    lineHeight: 20,
                    color: colors.mutedForeground,
                  }}
                >
                  {offer.example}
                </Text>
              </View>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selected ? (
                  <View
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 6,
                      backgroundColor: colors.primary,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          )
        })}
      </View>
      <Text style={{ ...label, marginTop: 18, marginBottom: 8 }}>
        Where you trade
      </Text>
      {location.address ? (
        <CurrentLocationCard
          address={location.address}
          status={location.status}
          error={location.error}
          onClear={() => {
            location.clear()
            onChange({ addressLine1: "", city: "", region: "" })
          }}
          onLocate={locate}
        />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={location.status === "busy"}
            onPress={locate}
            style={{
              minHeight: 46,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: colors.primary,
              backgroundColor: colors.accent,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {location.status === "busy" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Icon name="MapPin" size={18} color={colors.primary} />
            )}
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "800",
                color: colors.primary,
              }}
            >
              {location.status === "busy"
                ? "Finding you…"
                : "Use my current location"}
            </Text>
          </Pressable>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              lineHeight: 20,
              color: location.error
                ? colors.destructive
                : colors.mutedForeground,
            }}
          >
            {location.error ||
              (business.addressLine1
                ? [business.addressLine1, business.city, business.region]
                    .filter(Boolean)
                    .join(", ")
                : "Optional. Helps customers find you.")}
          </Text>
        </>
      )}
      <View
        style={{
          marginTop: 12,
          flexDirection: largeText ? "column" : "row",
          gap: 12,
        }}
      >
        <View style={{ flex: largeText ? undefined : 1 }}>
          <Text style={label}>Country</Text>
          <CountrySelect
            value={business.countryCode}
            onChange={(countryCode) =>
              onChange({
                countryCode,
                currencyCode:
                  currencyForCountry(countryCode) ?? business.currencyCode,
              })
            }
            renderTrigger={(country, open) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Country: ${business.countryCode ? country.name : "Choose country"}`}
                onPress={open}
                style={{
                  ...input,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text
                  numberOfLines={largeText ? undefined : 1}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    lineHeight: 22,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  {business.countryCode ? country.name : "Choose country"}
                </Text>
                <Icon
                  name="ChevronDown"
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            )}
          />
        </View>
        <View style={{ flex: largeText ? undefined : 1 }}>
          <Text style={label}>Currency</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Currency: ${business.currencyCode || "Choose currency"}`}
            onPress={() => currency.present()}
            style={{
              ...input,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                lineHeight: 22,
                fontWeight: "600",
                color: colors.foreground,
              }}
            >
              {selectedCurrency
                ? `${selectedCurrency.symbol} ${selectedCurrency.code}`
                : "Choose currency"}
            </Text>
            <Icon name="ChevronDown" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
      <View style={{ marginTop: 18 }}>
        <Text style={label}>About this store · optional</Text>
        <TextInput
          accessibilityLabel="About this store"
          multiline
          maxLength={280}
          value={business.description ?? ""}
          onChangeText={(description) => onChange({ description })}
          placeholder="A line or two about what you offer. Shown on your store page."
          placeholderTextColor={colors.mutedForeground}
          style={{
            ...input,
            minHeight: 104,
            paddingVertical: 12,
            fontSize: 16,
            lineHeight: 22,
            color: colors.foreground,
            textAlignVertical: "top",
          }}
        />
        <Text
          style={{
            marginTop: 6,
            fontSize: 14,
            lineHeight: 20,
            color: colors.mutedForeground,
          }}
        >
          Shown on your store page. Skip it now if you like.
        </Text>
      </View>
      <View
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: 18,
          backgroundColor: plan === "starter" ? palette.amber : palette.mint,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Icon
            name="Link"
            size={16}
            color={
              plan === "starter"
                ? palette.amberForeground
                : palette.mintForeground
            }
          />
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "700",
              color:
                plan === "starter"
                  ? palette.amberForeground
                  : palette.mintForeground,
            }}
          >
            Your free store link
          </Text>
        </View>
        <Text
          style={{
            fontSize: 16,
            lineHeight: 22,
            fontWeight: "800",
            color:
              plan === "starter"
                ? palette.amberForeground
                : palette.mintForeground,
          }}
        >
          {business.slug}.ewatrade.com
        </Text>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color:
              plan === "starter"
                ? palette.amberForeground
                : palette.mintForeground,
          }}
        >
          {plan === "starter"
            ? "Your first 3 items show here. Upgrade to list everything and let customers message you about prices and stock."
            : "Lists everything you offer. Customer messages are included once your store chat is set up."}
        </Text>
        {plan === "starter" ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
            {[1, 2, 3, 4].map((number) => (
              <View
                key={number}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: number < 4 ? colors.card : "transparent",
                  borderWidth: number === 4 ? 1.5 : 0,
                  borderStyle: "dashed",
                  borderColor: palette.amberForeground,
                }}
              >
                {number < 4 ? (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: colors.mutedForeground,
                    }}
                  >
                    {number}
                  </Text>
                ) : (
                  <Icon name="Lock" size={14} color={palette.amberForeground} />
                )}
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Modal ref={currency.ref} title="Currency" snapPoints={["55%"]}>
        <BottomSheetScrollView contentContainerStyle={{ padding: 18, gap: 8 }}>
          <CurrencySelector
            value={business.currencyCode}
            label="Choose currency"
            onChange={(currencyCode) => {
              onChange({ currencyCode })
              currency.dismiss()
            }}
          />
        </BottomSheetScrollView>
      </Modal>
    </View>
  )
}
