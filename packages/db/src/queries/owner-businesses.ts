import type {
  BusinessOperatingModel,
  OperatingCurrencyCode,
} from "@ewatrade/utils"
import { withQaWorkspaceSuffix } from "@ewatrade/utils"
import { isClaimableStoreLink } from "@ewatrade/utils/store-link"
import { Prisma } from "../../generated/prisma/client"
import { AccountAgeBand } from "../../generated/prisma/enums"
import { configuredQaDomainForEmail } from "./qa-maintenance"
import {
  StoreLinkConflictError,
  storeLinkHostnames,
} from "./store-link-availability"
import { createTenantStore } from "./stores"
import type { DbClient } from "./types"

export type OwnerBusinessSummary = {
  currencyCode: string
  id: string
  name: string
  role: string
  slug: string
  status: string
  storeId: string | null
  storeName: string | null
}

export type CreateOwnerBusinessInput = {
  addressLine1?: string | null
  businessProfileKey?: string | null
  businessProfileVersion?: 1 | null
  businessName: string
  requestedSlug?: string
  setupStatus?: "pending" | "complete"
  city?: string | null
  countryCode?: string | null
  region?: string | null
  currencyCode: OperatingCurrencyCode
  operatingModel?: BusinessOperatingModel | null
  orderChannels?: string[] | null
  otherBusinessDescription?: string | null
  contactEmail?: string | null
  phone?: string | null
  teamSize?: string | null
  userId: string
}

export class OwnerBusinessAgeError extends Error {
  constructor() {
    super("Choose an eligible age range before creating a business.")
    this.name = "OwnerBusinessAgeError"
  }
}

export async function requireEligibleOwnerAge(db: DbClient, userId: string) {
  const owner = await db.user.findUnique({
    where: { id: userId },
    select: { ageBand: true, email: true },
  })
  if (!owner) throw new Error("Owner account not found.")
  if (
    owner.ageBand !== AccountAgeBand.AGE_13_TO_15 &&
    owner.ageBand !== AccountAgeBand.AGE_16_TO_17 &&
    owner.ageBand !== AccountAgeBand.ADULT
  ) {
    throw new OwnerBusinessAgeError()
  }
  return owner
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

async function createUniqueTenant(
  db: DbClient,
  input: {
    businessName: string
    currencyCode: OperatingCurrencyCode
    requestedSlug?: string
    qaSourceDomain?: string | null
  },
) {
  if (input.requestedSlug !== undefined) {
    const requestedSlug = withQaWorkspaceSuffix(
      input.requestedSlug,
      Boolean(input.qaSourceDomain),
      40,
    )
    if (!isClaimableStoreLink(requestedSlug, Boolean(input.qaSourceDomain)))
      throw new StoreLinkConflictError(
        "That store link is reserved or invalid. Choose another link.",
      )
    if (
      await db.tenant.findUnique({
        where: { slug: requestedSlug },
        select: { id: true },
      })
    )
      throw new StoreLinkConflictError()
    if (
      await db.tenantHostname.findFirst({
        where: { hostname: { in: storeLinkHostnames([requestedSlug]) } },
        select: { id: true },
      })
    )
      throw new StoreLinkConflictError()
    try {
      const tenant = await db.tenant.create({
        data: {
          name: input.businessName,
          slug: requestedSlug,
          currencyCode: input.currencyCode,
          enabledModes: ["STORE", "MERCHANT"],
          type: "MERCHANT",
          dataClassification: input.qaSourceDomain ? "QA" : "LIVE",
          qaSourceDomain: input.qaSourceDomain ?? null,
          qaMarkedAt: input.qaSourceDomain ? new Date() : null,
        },
        select: { currencyCode: true, id: true, name: true, slug: true },
      })
      await db.tenantHostname.create({
        data: {
          tenantId: tenant.id,
          hostname: `${requestedSlug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"}`,
          surface: "STOREFRONT",
          isPrimary: true,
          isCustom: false,
        },
      })
      return tenant
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new StoreLinkConflictError()
      throw error
    }
  }
  const baseSlug = withQaWorkspaceSuffix(
    toSlug(input.businessName) || "business",
    Boolean(input.qaSourceDomain),
    48,
  )

  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    if (!input.qaSourceDomain && slug.endsWith("-qa")) continue
    const existing = await db.tenant.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (existing) continue

    try {
      return await db.tenant.create({
        data: {
          currencyCode: input.currencyCode,
          dataClassification: input.qaSourceDomain ? "QA" : "LIVE",
          enabledModes: ["STORE", "MERCHANT"],
          name: input.businessName,
          qaMarkedAt: input.qaSourceDomain ? new Date() : null,
          qaSourceDomain: input.qaSourceDomain ?? null,
          slug,
          type: "MERCHANT",
        },
        select: {
          currencyCode: true,
          id: true,
          name: true,
          slug: true,
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue
      }

      throw error
    }
  }

  throw new Error("Unable to generate a unique business slug.")
}

async function createOwnerBusinessWithSource(
  db: DbClient,
  input: CreateOwnerBusinessInput,
  source: "mobile_owner_business_create" | "mobile_owner_signup",
): Promise<OwnerBusinessSummary> {
  const owner = await requireEligibleOwnerAge(db, input.userId)
  const qaSourceDomain = configuredQaDomainForEmail(owner.email)
  const tenant = await createUniqueTenant(db, {
    businessName: input.businessName,
    currencyCode: input.currencyCode,
    qaSourceDomain,
    requestedSlug: input.requestedSlug,
  })

  await db.membership.create({
    data: {
      acceptedAt: new Date(),
      role: "OWNER",
      status: "ACTIVE",
      tenantId: tenant.id,
      userId: input.userId,
    },
  })

  const store = await createTenantStore(db, {
    addressLine1: input.addressLine1,
    city: input.city,
    countryCode: input.countryCode,
    region: input.region,
    createdByUserId: input.userId,
    currencyCode: tenant.currencyCode,
    name: "Main store",
    onboarding: {
      businessProfileKey: input.businessProfileKey,
      businessProfileVersion: input.businessProfileVersion,
      countryCode: input.countryCode,
      operatingModel: input.operatingModel,
      orderChannels: input.orderChannels,
      otherBusinessDescription: input.otherBusinessDescription,
      source,
      setupStatus:
        input.setupStatus ?? (input.requestedSlug ? "pending" : undefined),
      teamSize: input.teamSize,
    },
    supportEmail: input.contactEmail,
    supportPhone: input.phone,
    tenantId: tenant.id,
  })

  return {
    currencyCode: store.currencyCode,
    id: tenant.id,
    name: tenant.name,
    role: "OWNER",
    slug: tenant.slug,
    status: "ACTIVE",
    storeId: store.id,
    storeName: store.name,
  }
}

export async function createOwnerBusiness(
  db: DbClient,
  input: CreateOwnerBusinessInput,
) {
  return createOwnerBusinessWithSource(
    db,
    input,
    "mobile_owner_business_create",
  )
}

export async function createOwnerSignupBusiness(
  db: DbClient,
  input: CreateOwnerBusinessInput,
) {
  return createOwnerBusinessWithSource(db, input, "mobile_owner_signup")
}
