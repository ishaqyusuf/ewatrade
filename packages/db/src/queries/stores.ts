import {
  BUSINESS_PROFILE_SCHEMA_VERSION,
  isOperatingCurrencyCode,
  isBusinessProfileKey,
  normalizeOperatingCurrencyCode,
} from "@ewatrade/utils"
import { Prisma } from "../../generated/prisma/client"
import { assertRetailOpsEntitlementAvailable } from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

export type CreateTenantStoreInput = {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  countryCode?: string | null
  createdByUserId?: string | null
  tenantId: string
  name: string
  currencyCode?: string
  supportEmail?: string | null
  supportPhone?: string | null
  onboarding?: CreateTenantStoreOnboardingInput | null
  postalCode?: string | null
  region?: string | null
}

export type CreateTenantStoreOnboardingInput = {
  businessProfileKey?: string | null
  businessProfileVersion?: number | null
  countryCode?: string | null
  operatingModel?: string | null
  orderChannels?: string[] | null
  otherBusinessDescription?: string | null
  salesMethod?: string | null
  staffInvolvement?: string | null
  source?: string | null
  teamSize?: string | null
}

export type CreatedTenantStore = {
  currencyCode: string
  id: string
  slug: string
  name: string
  status: string
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim()
  return text ? text : null
}

function cleanTextArray(value: string[] | null | undefined) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    const text = cleanText(entry)

    return text ? [text] : []
  })
}

function buildOnboardingMetadata(
  onboarding: CreateTenantStoreOnboardingInput | null | undefined,
  currencyCode: string,
  capturedAt: Date,
) {
  if (!onboarding) return null

  const onboardingMetadata: Record<string, Prisma.InputJsonValue> = {
    capturedAt: capturedAt.toISOString(),
    currencyCode,
    source: cleanText(onboarding.source) ?? "store_setup",
  }
  const businessProfileKey = cleanText(onboarding.businessProfileKey)
  if (businessProfileKey && !isBusinessProfileKey(businessProfileKey)) {
    throw new Error("Unsupported business category.")
  }
  if (
    onboarding.businessProfileVersion != null &&
    onboarding.businessProfileVersion !== BUSINESS_PROFILE_SCHEMA_VERSION
  ) {
    throw new Error("Unsupported business profile version.")
  }

  const fields = [
    ["countryCode", onboarding.countryCode],
    ["operatingModel", onboarding.operatingModel],
    ["otherBusinessDescription", onboarding.otherBusinessDescription],
    ["salesMethod", onboarding.salesMethod],
    ["staffInvolvement", onboarding.staffInvolvement],
    ["teamSize", onboarding.teamSize],
  ] as const

  for (const [key, value] of fields) {
    const text = cleanText(value)
    if (!text) continue
    onboardingMetadata[key] = text
  }

  if (businessProfileKey) {
    onboardingMetadata.businessProfileKey = businessProfileKey
    onboardingMetadata.businessProfileVersion = BUSINESS_PROFILE_SCHEMA_VERSION
  }

  const orderChannels = cleanTextArray(onboarding.orderChannels)

  if (orderChannels.length > 0) onboardingMetadata.orderChannels = orderChannels

  return onboardingMetadata as Prisma.InputJsonObject
}

function buildStoreMetadata(onboardingMetadata: Prisma.InputJsonObject | null) {
  if (!onboardingMetadata) return undefined

  return {
    retailOps: {
      onboarding: onboardingMetadata,
    },
  } satisfies Prisma.InputJsonObject
}

function buildOnboardingSessionFormData({
  currencyCode,
  input,
  onboardingMetadata,
  store,
}: {
  currencyCode: string
  input: CreateTenantStoreInput
  onboardingMetadata: Prisma.InputJsonObject
  store: CreatedTenantStore
}) {
  const formData: Record<string, Prisma.InputJsonValue> = {
    currencyCode,
    flow: "retail_ops_store_setup",
    onboarding: onboardingMetadata,
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
    },
  }
  const supportEmail = cleanText(input.supportEmail)
  const supportPhone = cleanText(input.supportPhone)

  if (supportEmail) formData.supportEmail = supportEmail
  if (supportPhone) formData.supportPhone = supportPhone

  return formData as Prisma.InputJsonObject
}

function getOnboardingSessionExpiresAt(capturedAt: Date) {
  const expiresAt = new Date(capturedAt)
  expiresAt.setDate(expiresAt.getDate() + 90)

  return expiresAt
}

async function createCompletedStoreOnboardingSession({
  capturedAt,
  currencyCode,
  db,
  input,
  onboardingMetadata,
  store,
}: {
  capturedAt: Date
  currencyCode: string
  db: DbClient
  input: CreateTenantStoreInput
  onboardingMetadata: Prisma.InputJsonObject | null
  store: CreatedTenantStore
}) {
  if (!onboardingMetadata) return

  await db.onboardingSession.create({
    data: {
      completed: true,
      expiresAt: getOnboardingSessionExpiresAt(capturedAt),
      formData: buildOnboardingSessionFormData({
        currencyCode,
        input,
        onboardingMetadata,
        store,
      }),
      step: 1,
      tenantId: input.tenantId,
      userId: cleanText(input.createdByUserId),
    },
  })
}

export async function createTenantStore(
  db: DbClient,
  input: CreateTenantStoreInput,
): Promise<CreatedTenantStore> {
  await assertRetailOpsEntitlementAvailable(db, {
    key: "businesses",
    tenantId: input.tenantId,
  })

  const name = cleanText(input.name) ?? "Store"
  const supportEmail = cleanText(input.supportEmail)
  const supportPhone = cleanText(input.supportPhone)
  const baseSlug = toSlug(name) || "store"
  const requestedCurrencyCode = cleanText(input.currencyCode)?.toUpperCase()
  if (
    requestedCurrencyCode &&
    !isOperatingCurrencyCode(requestedCurrencyCode)
  ) {
    throw new Error("Unsupported operating currency.")
  }
  const currencyCode = normalizeOperatingCurrencyCode(requestedCurrencyCode)
  const capturedAt = new Date()
  const onboardingMetadata = buildOnboardingMetadata(
    input.onboarding,
    currencyCode,
    capturedAt,
  )
  const metadata = buildStoreMetadata(onboardingMetadata)

  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    const existing = await db.store.findUnique({
      where: { tenantId_slug: { tenantId: input.tenantId, slug } },
      select: { id: true },
    })

    if (existing) continue

    try {
      const store = await db.store.create({
        data: {
          addressLine1: cleanText(input.addressLine1),
          addressLine2: cleanText(input.addressLine2),
          city: cleanText(input.city),
          countryCode: cleanText(input.countryCode)?.toUpperCase(),
          tenantId: input.tenantId,
          slug,
          name,
          postalCode: cleanText(input.postalCode),
          region: cleanText(input.region),
          currencyCode,
          supportEmail,
          supportPhone,
          status: "ACTIVE",
          ...(metadata ? { metadata } : {}),
        },
        select: {
          currencyCode: true,
          id: true,
          slug: true,
          name: true,
          status: true,
        },
      })

      await createCompletedStoreOnboardingSession({
        capturedAt,
        currencyCode,
        db,
        input,
        onboardingMetadata,
        store,
      })

      return store
    } catch (error) {
      if (isUniqueConstraintError(error)) continue
      throw error
    }
  }

  throw new Error("Unable to generate a unique store slug.")
}
