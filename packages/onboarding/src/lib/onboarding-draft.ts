import type { OnboardingDraft } from "@ewatrade/db/onboarding-continuation"
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_TEAM_SIZE_KEYS,
  OPERATING_CURRENCY_CODES,
} from "@ewatrade/utils"
import type { BusinessValues } from "./signup-schemas"

export function businessValuesFromOnboardingDraft(
  draft: OnboardingDraft,
): Partial<BusinessValues> {
  const values: Partial<BusinessValues> = {
    addressLine1: draft.addressLine1,
    city: draft.city,
    countryCode: draft.countryCode,
    region: draft.region,
    phone: draft.phone,
    businessProfileKey: draft.businessProfileKey,
    businessProfileVersion: 1,
    currencyCode:
      OPERATING_CURRENCY_CODES.find((value) => value === draft.currencyCode) ??
      "NGN",
    operatingModel:
      BUSINESS_OPERATING_MODEL_KEYS.find(
        (value) => value === draft.operatingModel,
      ) ?? "products",
    businessSize:
      BUSINESS_TEAM_SIZE_KEYS.find((value) => value === draft.teamSize) ??
      "solo",
    orderChannels: draft.orderChannels?.length
      ? BUSINESS_ORDER_CHANNEL_KEYS.filter((value) =>
          draft.orderChannels?.includes(value),
        )
      : ["walk_in"],
    otherBusinessDescription: draft.otherBusinessDescription,
  }
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<BusinessValues>
}

export function onboardingDraftFromBusinessValues(
  values: BusinessValues,
): OnboardingDraft {
  return {
    step: "account",
    addressLine1: values.addressLine1,
    city: values.city,
    countryCode: values.countryCode,
    region: values.region,
    phone: values.phone,
    businessProfileKey: values.businessProfileKey,
    currencyCode: values.currencyCode,
    operatingModel: values.operatingModel,
    teamSize: values.businessSize,
    orderChannels: values.orderChannels,
    otherBusinessDescription: values.otherBusinessDescription,
  }
}
