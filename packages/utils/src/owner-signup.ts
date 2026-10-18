import {
  BUSINESS_OPERATING_MODEL_KEYS,
  type BusinessOperatingModel,
} from "./business-profiles"
import { isBusinessTypeKey } from "./business-types"
import { type OperatingCurrencyCode, isOperatingCurrencyCode } from "./currency"
import { isValidStoreLink } from "./store-link"

export type OwnerSetupBusiness = {
  name: string
  slug: string
  typeKeys: string[]
  otherType?: string
  operatingModel: BusinessOperatingModel
  countryCode: string
  currencyCode: OperatingCurrencyCode
  description?: string
  addressLine1?: string
  city?: string
  region?: string
}
export type OwnerSetupDraft = {
  planId: "starter" | "growth" | "pro"
  businesses: OwnerSetupBusiness[]
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}
/** Stored JSON is descriptive draft data and never an authority or a plan grant. */
export function readOwnerSignupDraft(value: unknown): OwnerSetupDraft | null {
  if (
    !record(value) ||
    !["starter", "growth", "pro"].includes(String(value.planId)) ||
    !Array.isArray(value.businesses) ||
    !value.businesses.length ||
    value.businesses.length > 42
  )
    return null
  const businesses: OwnerSetupBusiness[] = []
  for (const b of value.businesses) {
    if (
      !record(b) ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 120 ||
      typeof b.slug !== "string" ||
      !isValidStoreLink(b.slug) ||
      !Array.isArray(b.typeKeys) ||
      !b.typeKeys.length ||
      !b.typeKeys.every(isBusinessTypeKey) ||
      typeof b.countryCode !== "string" ||
      !/^[A-Z]{2}$/.test(b.countryCode) ||
      typeof b.currencyCode !== "string" ||
      !isOperatingCurrencyCode(b.currencyCode) ||
      !BUSINESS_OPERATING_MODEL_KEYS.some((k) => k === b.operatingModel)
    )
      return null
    const optional: Record<string, string> = {}
    for (const [key, max] of [
      ["otherType", 60],
      ["description", 280],
      ["addressLine1", 200],
      ["city", 120],
      ["region", 120],
    ] as const) {
      const v = b[key]
      if (v !== undefined) {
        if (typeof v !== "string" || v.length > max) return null
        optional[key] = v.trim()
      }
    }
    if (
      b.typeKeys.includes("other") &&
      (!optional.otherType || optional.otherType.length < 2)
    )
      return null
    businesses.push({
      name: b.name.trim(),
      slug: b.slug,
      typeKeys: [...new Set(b.typeKeys)],
      countryCode: b.countryCode,
      currencyCode: b.currencyCode,
      operatingModel: b.operatingModel as BusinessOperatingModel,
      ...optional,
    })
  }
  return { planId: value.planId as OwnerSetupDraft["planId"], businesses }
}
export function moveOwnerBusinessType(
  businesses: OwnerSetupBusiness[],
  key: string,
  target: number | "new",
): OwnerSetupBusiness[] {
  const source = businesses.find((b) => b.typeKeys.includes(key))
  if (!source) return businesses
  const next = businesses.map((b) => ({
    ...b,
    typeKeys: b.typeKeys.filter((t) => t !== key),
  }))
  if (target === "new")
    next.push({
      ...source,
      name: "",
      slug: "",
      typeKeys: [key],
      description: "",
    })
  else if (next[target]) next[target].typeKeys.push(key)
  return next.filter((b, i) => i === 0 || b.typeKeys.length > 0)
}
