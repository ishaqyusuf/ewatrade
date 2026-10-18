import {
  BUSINESS_OPERATING_MODEL_KEYS,
  type BusinessOperatingModel,
} from "./business-profiles"
import { defaultBusinessOffer, isBusinessTypeKey } from "./business-types"
import { type OperatingCurrencyCode, isOperatingCurrencyCode } from "./currency"
import { isValidStoreLink } from "./store-link"

export type OwnerSetupBusiness = {
  id?: string
  offerTouched?: boolean
  name: string
  slug: string
  typeKeys: string[]
  otherType?: string
  operatingModel: BusinessOperatingModel
  countryCode: string
  currencyCode: OperatingCurrencyCode | ""
  description?: string
  addressLine1?: string
  city?: string
  region?: string
}
export type OwnerSetupDraft = {
  step?: "type" | "group" | "store"
  storeIndex?: number
  groupedFor?: string
  selectedTypeKeys?: string[]
  otherType?: string
  planId: "starter" | "growth" | "pro"
  businesses: OwnerSetupBusiness[]
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}
/** Stored JSON is descriptive draft data and never an authority or a plan grant. */
export function readOwnerSignupDraft(
  value: unknown,
  { allowIncomplete = false }: { allowIncomplete?: boolean } = {},
): OwnerSetupDraft | null {
  if (
    !record(value) ||
    !["starter", "growth", "pro"].includes(String(value.planId)) ||
    !Array.isArray(value.businesses) ||
    (!allowIncomplete && !value.businesses.length) ||
    value.businesses.length > 42
  )
    return null
  const businesses: OwnerSetupBusiness[] = []
  for (const b of value.businesses) {
    if (
      !record(b) ||
      typeof b.name !== "string" ||
      (!allowIncomplete && !b.name.trim()) ||
      b.name.length > 120 ||
      typeof b.slug !== "string" ||
      b.slug.length > 40 ||
      (!allowIncomplete && !isValidStoreLink(b.slug)) ||
      !Array.isArray(b.typeKeys) ||
      (!allowIncomplete && !b.typeKeys.length) ||
      !b.typeKeys.every(isBusinessTypeKey) ||
      typeof b.countryCode !== "string" ||
      (!(b.countryCode === "") && !/^[A-Z]{2}$/.test(b.countryCode)) ||
      typeof b.currencyCode !== "string" ||
      (!(b.currencyCode === "") && !isOperatingCurrencyCode(b.currencyCode)) ||
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
      !allowIncomplete &&
      b.typeKeys.includes("other") &&
      (!optional.otherType || optional.otherType.length < 2)
    )
      return null
    if (
      b.id !== undefined &&
      (typeof b.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(b.id))
    )
      return null
    if (b.offerTouched !== undefined && typeof b.offerTouched !== "boolean")
      return null
    businesses.push({
      id: typeof b.id === "string" ? b.id : `business-${businesses.length}`,
      ...(b.offerTouched !== undefined ? { offerTouched: b.offerTouched } : {}),
      name: b.name.trim(),
      slug: b.slug,
      typeKeys: [...new Set(b.typeKeys)],
      countryCode: b.countryCode,
      currencyCode: b.currencyCode,
      operatingModel: b.operatingModel as BusinessOperatingModel,
      ...optional,
    })
  }
  if (new Set(businesses.map((b) => b.id)).size !== businesses.length)
    return null
  if (!allowIncomplete) {
    const types = businesses.flatMap((b) => b.typeKeys)
    if (
      new Set(types).size !== types.length ||
      new Set(businesses.map((b) => b.slug)).size !== businesses.length
    )
      return null
  }
  const navigation: Partial<OwnerSetupDraft> = {}
  if (value.step !== undefined) {
    if (!["type", "group", "store"].includes(String(value.step))) return null
    navigation.step = value.step as OwnerSetupDraft["step"]
  }
  if (value.storeIndex !== undefined) {
    if (
      !Number.isInteger(value.storeIndex) ||
      Number(value.storeIndex) < 0 ||
      Number(value.storeIndex) > 41
    )
      return null
    navigation.storeIndex = Number(value.storeIndex)
  }
  if (value.groupedFor !== undefined) {
    if (typeof value.groupedFor !== "string" || value.groupedFor.length > 2000)
      return null
    navigation.groupedFor = value.groupedFor
  }
  if (value.selectedTypeKeys !== undefined) {
    if (
      !Array.isArray(value.selectedTypeKeys) ||
      value.selectedTypeKeys.length > 42 ||
      !value.selectedTypeKeys.every(isBusinessTypeKey)
    )
      return null
    navigation.selectedTypeKeys = [...new Set(value.selectedTypeKeys)]
  }
  if (value.otherType !== undefined) {
    if (typeof value.otherType !== "string" || value.otherType.length > 60)
      return null
    navigation.otherType = value.otherType
  }
  return {
    ...navigation,
    planId: value.planId as OwnerSetupDraft["planId"],
    businesses,
  }
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
  if (target === "new") {
    let id = 0
    while (next.some((b) => b.id === `business-${id}`)) id++
    next.push({
      ...source,
      id: `business-${id}`,
      offerTouched: false,
      name: "",
      slug: "",
      typeKeys: [key],
      description: "",
    })
  } else if (next[target]) next[target].typeKeys.push(key)
  return next
    .filter((b, i) => i === 0 || b.typeKeys.length > 0)
    .map((b) => ({
      ...b,
      operatingModel: b.offerTouched
        ? b.operatingModel
        : defaultBusinessOffer(b.typeKeys),
    }))
}
