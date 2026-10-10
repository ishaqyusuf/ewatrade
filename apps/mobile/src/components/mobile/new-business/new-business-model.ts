import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  BUSINESS_PROFILE_SCHEMA_VERSION,
  type BusinessOperatingModel,
  type BusinessOrderChannel,
  type BusinessTeamSize,
  type OperatingCurrencyCode,
  findBusinessProfile,
} from "@ewatrade/utils"
import { getCountry, toInternationalPhone } from "@ewatrade/utils/countries"

export const BUSINESS_SETUP_STEPS = ["Type", "Profile", "Details", "Review"]
export const BUSINESS_SETUP_TITLES = [
  "Choose a business type",
  "How this business works",
  "Business details",
  "Review and create",
]
export type NewBusinessDraft = {
  countryCode?: string
  /** The phone's own country when it differs; unset follows the business. */
  phoneCountryCode?: string
  businessName: string
  addressLine1: string
  city: string
  phone: string
  currencyCode: OperatingCurrencyCode
  businessProfileKey: string
  operatingModel: BusinessOperatingModel
  orderChannels: BusinessOrderChannel[]
  otherBusinessDescription: string
  teamSize: BusinessTeamSize
}
export function newBusinessDraft(): NewBusinessDraft {
  return {
    countryCode: "NG",
    businessName: "",
    addressLine1: "",
    city: "",
    phone: "",
    currencyCode: "NGN",
    businessProfileKey: "",
    operatingModel: "products",
    orderChannels: ["walk_in"],
    otherBusinessDescription: "",
    teamSize: "solo",
  }
}
export function businessProfileIssue(draft: NewBusinessDraft) {
  if (!findBusinessProfile(draft.businessProfileKey))
    return "Choose a business type."
  if (!draft.orderChannels.length)
    return "Choose at least one way customers order."
  if (
    draft.businessProfileKey === "other-mixed-business" &&
    draft.otherBusinessDescription.trim().length < 2
  )
    return "Tell us what this business does."
  if (draft.otherBusinessDescription.trim().length > 240)
    return "Keep the business description within 240 characters."
  return null
}
export function businessDetailsIssue(draft: NewBusinessDraft) {
  if (!draft.businessName.trim() || draft.businessName.trim().length > 120)
    return "Enter a business name within 120 characters."
  if (!draft.addressLine1.trim() || draft.addressLine1.trim().length > 200)
    return "Enter the street address within 200 characters."
  if (!draft.city.trim() || draft.city.trim().length > 120)
    return "Enter the city within 120 characters."
  if (draft.phone.trim().length < 7 || draft.phone.trim().length > 40)
    return "Enter a phone number between 7 and 40 characters."
  return null
}
export function newBusinessPhoneDialCode(draft: NewBusinessDraft) {
  return getCountry(draft.phoneCountryCode ?? draft.countryCode).dialCode
}
export function businessCreateInput(
  draft: NewBusinessDraft,
): RouterInputs["tenant"]["createBusiness"] {
  return {
    addressLine1: draft.addressLine1.trim(),
    businessName: draft.businessName.trim(),
    city: draft.city.trim(),
    countryCode: draft.countryCode ?? "NG",
    currencyCode: draft.currencyCode,
    supportPhone: toInternationalPhone(
      newBusinessPhoneDialCode(draft),
      draft.phone,
    ),
    onboarding: {
      businessProfileKey: draft.businessProfileKey,
      businessProfileVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
      operatingModel: draft.operatingModel,
      orderChannels: [...draft.orderChannels],
      otherBusinessDescription:
        draft.otherBusinessDescription.trim() || undefined,
      teamSize: draft.teamSize,
    },
  }
}
