import profileFile from "./business-profiles.json"
import {
  type CatalogSetupHelper,
  type CatalogSetupHelperKind,
  findCatalogSetupHelper,
} from "./catalog-setup-helpers"

export type BusinessOperatingModel =
  | "products"
  | "services"
  | "products_and_services"

export type BusinessProfile = {
  description: string
  key: string
  recommendedHelperKeys: string[]
  recommendedItemKinds: CatalogSetupHelperKind[]
  tags: string[]
  title: string
}

type BusinessProfileFile = {
  profiles: BusinessProfile[]
  schemaVersion: 1
}

export const BUSINESS_OPERATING_MODEL_KEYS = [
  "products",
  "services",
  "products_and_services",
] as const

export const BUSINESS_OPERATING_MODELS = [
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "products_and_services", label: "Products and services" },
] as const satisfies ReadonlyArray<{
  key: BusinessOperatingModel
  label: string
}>

export const BUSINESS_ORDER_CHANNEL_KEYS = [
  "walk_in",
  "phone_whatsapp",
  "delivery_pickup",
  "online",
  "sales_representatives",
] as const
export type BusinessOrderChannel = (typeof BUSINESS_ORDER_CHANNEL_KEYS)[number]

export const BUSINESS_ORDER_CHANNELS = [
  { key: "walk_in", label: "Walk-in" },
  { key: "phone_whatsapp", label: "Phone or WhatsApp" },
  { key: "delivery_pickup", label: "Delivery or pickup" },
  { key: "online", label: "Online" },
  { key: "sales_representatives", label: "Sales representatives" },
] as const

export const BUSINESS_TEAM_SIZE_KEYS = [
  "solo",
  "2_5",
  "6_10",
  "11_plus",
] as const
export type BusinessTeamSize = (typeof BUSINESS_TEAM_SIZE_KEYS)[number]

export const BUSINESS_TEAM_SIZES = [
  { key: "solo", label: "Just me" },
  { key: "2_5", label: "2–5 people" },
  { key: "6_10", label: "6–10 people" },
  { key: "11_plus", label: "11+ people" },
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function assertStringArray(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(`${label} must be a non-empty string array.`)
  }
}

function assertBusinessProfileFile(
  value: unknown,
): asserts value is BusinessProfileFile {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.profiles)
  ) {
    throw new Error("Business profile file must use schema version 1.")
  }

  const keys = new Set<string>()
  for (const profile of value.profiles) {
    if (
      !isRecord(profile) ||
      typeof profile.key !== "string" ||
      !profile.key.trim() ||
      typeof profile.title !== "string" ||
      !profile.title.trim() ||
      typeof profile.description !== "string" ||
      !profile.description.trim()
    ) {
      throw new Error("Business profile entries require identity and copy.")
    }
    if (keys.has(profile.key)) {
      throw new Error(`Business profile key ${profile.key} is duplicated.`)
    }
    keys.add(profile.key)

    assertStringArray(profile.tags, `${profile.key} tags`)
    assertStringArray(
      profile.recommendedItemKinds,
      `${profile.key} recommended item kinds`,
    )
    assertStringArray(
      profile.recommendedHelperKeys,
      `${profile.key} recommended helpers`,
    )

    for (const kind of profile.recommendedItemKinds) {
      if (kind !== "product" && kind !== "service") {
        throw new Error(`${profile.key} has an invalid recommended item kind.`)
      }
    }

    for (const helperKey of profile.recommendedHelperKeys) {
      const helper = findCatalogSetupHelper(helperKey)
      if (!helper) {
        throw new Error(
          `${profile.key} references unknown Catalog helper ${helperKey}.`,
        )
      }
      if (!profile.recommendedItemKinds.includes(helper.kind)) {
        throw new Error(
          `${profile.key} recommends ${helperKey} without recommending ${helper.kind}.`,
        )
      }
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry)
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry)
  }
  return Object.freeze(value)
}

assertBusinessProfileFile(profileFile)

export const BUSINESS_PROFILE_SCHEMA_VERSION = profileFile.schemaVersion
export const BUSINESS_PROFILES: readonly BusinessProfile[] = deepFreeze(
  profileFile.profiles,
)

export function findBusinessProfile(key: string | null | undefined) {
  if (!key) return undefined
  return BUSINESS_PROFILES.find((profile) => profile.key === key)
}

export function isBusinessProfileKey(
  value: string | null | undefined,
): value is string {
  return Boolean(findBusinessProfile(value))
}

export function listBusinessProfiles({ query }: { query?: string } = {}) {
  const normalizedQuery = query?.trim().toLowerCase()
  if (!normalizedQuery) return [...BUSINESS_PROFILES]

  return BUSINESS_PROFILES.filter((profile) =>
    [profile.title, profile.description, ...profile.tags].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    ),
  )
}

export function getRecommendedCatalogSetupHelperKeys({
  kind,
  profileKey,
}: {
  kind: CatalogSetupHelperKind
  profileKey: string | null | undefined
}) {
  const profile = findBusinessProfile(profileKey)
  if (!profile) return []

  return profile.recommendedHelperKeys.filter(
    (helperKey) => findCatalogSetupHelper(helperKey)?.kind === kind,
  )
}

export function rankCatalogSetupHelpersForBusinessProfile<
  T extends CatalogSetupHelper,
>(helpers: readonly T[], profileKey: string | null | undefined): T[] {
  const profile = findBusinessProfile(profileKey)
  const rank = new Map(
    profile?.recommendedHelperKeys.map((helperKey, index) => [
      helperKey,
      index,
    ]) ?? [],
  )

  return [...helpers].sort((left, right) => {
    const leftRank = rank.get(left.key)
    const rightRank = rank.get(right.key)
    if (leftRank !== undefined || rightRank !== undefined) {
      return (
        (leftRank ?? Number.MAX_SAFE_INTEGER) -
        (rightRank ?? Number.MAX_SAFE_INTEGER)
      )
    }
    return (
      Number(Boolean(right.recommended)) -
      Number(Boolean(left.recommended))
    )
  })
}

export function readBusinessProfileKeyFromStoreMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return null
  const retailOps = metadata.retailOps
  if (!isRecord(retailOps)) return null
  const onboarding = retailOps.onboarding
  if (!isRecord(onboarding)) return null
  const profileKey = onboarding.businessProfileKey

  return typeof profileKey === "string" && isBusinessProfileKey(profileKey)
    ? profileKey
    : null
}
