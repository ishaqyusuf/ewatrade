import { ActionButton } from "@/components/mobile/action-button"
import { Input } from "@/components/ui/input-2"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"

export type MobileDomainRegistrant = {
  addressLine1: string
  addressLine2: string | null
  city: string
  companyName: string | null
  consentVersion: "2026-07-24"
  countryCode: string
  email: string
  firstName: string
  lastName: string
  phoneCountryCode: string
  phoneNumber: string
  postalCode: string | null
  region: string
}

export function DomainOwnerForm({
  businessName,
  email,
  fullName,
  isSaving,
  onBack,
  onSave,
}: {
  businessName?: string | null
  email?: string | null
  fullName?: string | null
  isSaving: boolean
  onBack: () => void
  onSave: (value: MobileDomainRegistrant) => void
}) {
  const [firstName = "", ...remainingNames] =
    fullName?.trim().split(/\s+/) ?? []
  const [form, setForm] = useState<MobileDomainRegistrant>({
    addressLine1: "",
    addressLine2: null,
    city: "",
    companyName: businessName ?? null,
    consentVersion: "2026-07-24",
    countryCode: "NG",
    email: email ?? "",
    firstName,
    lastName: remainingNames.join(" "),
    phoneCountryCode: "234",
    phoneNumber: "",
    postalCode: null,
    region: "",
  })

  function field(
    key: keyof MobileDomainRegistrant,
    placeholder: string,
    options?: { keyboardType?: "email-address" | "phone-pad" },
  ) {
    return (
      <Input
        autoCapitalize={key === "email" ? "none" : "words"}
        keyboardType={options?.keyboardType}
        onChangeText={(value) =>
          setForm((current) => ({ ...current, [key]: value }))
        }
        placeholder={placeholder}
        value={String(form[key] ?? "")}
      />
    )
  }

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-lg font-extrabold text-foreground">
          Legal domain owner
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Registrars require the real person or business that owns the domain.
          We encrypt these details.
        </Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">{field("firstName", "First name")}</View>
        <View className="flex-1">{field("lastName", "Last name")}</View>
      </View>
      {field("companyName", "Business name")}
      {field("email", "Owner email", { keyboardType: "email-address" })}
      <View className="flex-row gap-3">
        <View className="w-24">
          {field("phoneCountryCode", "234", { keyboardType: "phone-pad" })}
        </View>
        <View className="flex-1">
          {field("phoneNumber", "Phone number", {
            keyboardType: "phone-pad",
          })}
        </View>
      </View>
      {field("addressLine1", "Street address")}
      {field("addressLine2", "Address line 2 (optional)")}
      <View className="flex-row gap-3">
        <View className="flex-1">{field("city", "City")}</View>
        <View className="flex-1">{field("region", "State")}</View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">{field("countryCode", "Country code")}</View>
        <View className="flex-1">
          {field("postalCode", "Postal code (optional)")}
        </View>
      </View>
      <View className="mt-2 flex-row gap-3">
        <ActionButton className="flex-1" onPress={onBack} variant="outline">
          Back
        </ActionButton>
        <ActionButton
          className="flex-1"
          disabled={
            !form.firstName.trim() ||
            !form.lastName.trim() ||
            !form.email.trim() ||
            !form.phoneNumber.trim() ||
            !form.addressLine1.trim() ||
            !form.city.trim() ||
            !form.region.trim()
          }
          isLoading={isSaving}
          loadingLabel="Saving"
          onPress={() => onSave(form)}
        >
          Continue
        </ActionButton>
      </View>
    </View>
  )
}
