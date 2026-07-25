import type {
  BusinessOperatingModel,
  OperatingCurrencyCode,
} from "@ewatrade/utils"
import { Prisma } from "../../generated/prisma/client"
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
  city?: string | null
  countryCode?: string | null
  currencyCode: OperatingCurrencyCode
  operatingModel?: BusinessOperatingModel | null
  orderChannels?: string[] | null
  otherBusinessDescription?: string | null
  phone?: string | null
  teamSize?: string | null
  userId: string
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
  },
) {
  const baseSlug = toSlug(input.businessName) || "business"

  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    const existing = await db.tenant.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (existing) continue

    try {
      return await db.tenant.create({
        data: {
          currencyCode: input.currencyCode,
          enabledModes: ["STORE", "MERCHANT"],
          name: input.businessName,
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
  const tenant = await createUniqueTenant(db, {
    businessName: input.businessName,
    currencyCode: input.currencyCode,
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
    createdByUserId: input.userId,
    currencyCode: tenant.currencyCode,
    name: input.businessName,
    onboarding: {
      businessProfileKey: input.businessProfileKey,
      businessProfileVersion: input.businessProfileVersion,
      countryCode: input.countryCode,
      operatingModel: input.operatingModel,
      orderChannels: input.orderChannels,
      otherBusinessDescription: input.otherBusinessDescription,
      source,
      teamSize: input.teamSize,
    },
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
