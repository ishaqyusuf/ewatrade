import { isOperatingCurrencyCode, withQaWorkspaceSuffix } from "@ewatrade/utils"
import { readBusinessOnboardingFactsFromStoreMetadata } from "@ewatrade/utils/business-profiles"
import {
  defaultBusinessOffer,
  findBusinessType,
} from "@ewatrade/utils/business-types"
import {
  type OwnerSetupBusiness,
  type OwnerSetupDraft,
  ownerSignupLaunchPlan,
  readOwnerSignupDraft,
} from "@ewatrade/utils/owner-signup"
import type { Prisma } from "../../generated/prisma/client"
import {
  createOwnerSignupBusiness,
  requireEligibleOwnerAge,
} from "./owner-businesses"
import { configuredQaDomainForEmail } from "./qa-maintenance"
import { findRetailOpsPlan } from "./retail-ops-subscription-plans"
import { withOwnerSignupLaunchGrant } from "./retail-ops-subscriptions"
import { StoreLinkConflictError } from "./store-link-availability"
import type { DbClient } from "./types"

export class OwnerSignupSetupError extends Error {
  constructor(
    message: string,
    readonly businessId?: string,
    readonly reason: "BAD_REQUEST" | "CONFLICT" = "BAD_REQUEST",
  ) {
    super(message)
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Scope comes from the authenticated owner and a pending Store, never input IDs. */
export async function getPendingOwnerSignup(db: DbClient, userId: string) {
  const owner = await requireEligibleOwnerAge(db, userId)
  const membership = await db.membership.findFirst({
    where: {
      userId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: {
        isActive: true,
        stores: {
          some: {
            metadata: {
              path: ["retailOps", "onboarding", "setupStatus"],
              equals: "pending",
            },
            status: { not: "ARCHIVED" },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      tenantId: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          metadata: true,
          stores: {
            where: { status: { not: "ARCHIVED" } },
            orderBy: { createdAt: "asc" },
            select: { id: true, metadata: true },
          },
        },
      },
    },
  })
  return membership ? { ...membership, ownerEmail: owner.email } : null
}

export async function readOwnerSignupSetup(db: DbClient, userId: string) {
  const pending = await getPendingOwnerSignup(db, userId)
  if (!pending) return null
  const session = await db.onboardingSession.findFirst({
    where: { tenantId: pending.tenantId, userId },
    orderBy: { createdAt: "desc" },
    select: { formData: true },
  })
  return {
    tenantId: pending.tenantId,
    emailDomain: pending.ownerEmail?.split("@")[1]?.toLowerCase(),
    name: pending.tenant.name,
    slug: pending.tenant.slug,
    draft: readOwnerSignupDraft(record(session?.formData).ownerSignup, {
      allowIncomplete: true,
    }),
  }
}

export async function saveOwnerSignupDraft(
  db: DbClient,
  userId: string,
  draft: OwnerSetupDraft,
) {
  const pending = await getPendingOwnerSignup(db, userId)
  if (!pending) return { saved: true } // A late autosave must not overwrite completed setup.
  const session = await db.onboardingSession.findFirst({
    where: { tenantId: pending.tenantId, userId },
    orderBy: { createdAt: "desc" },
  })
  const formData = {
    ...record(session?.formData),
    ownerSignup: draft,
  } as Prisma.InputJsonObject
  if (session)
    await db.onboardingSession.update({
      where: { id: session.id },
      data: { formData, completed: false },
    })
  else
    await db.onboardingSession.create({
      data: {
        tenantId: pending.tenantId,
        userId,
        formData,
        expiresAt: new Date(Date.now() + 365 * 86400_000),
      },
    })
  return { saved: true }
}

export async function completeOwnerSignupSetup(
  db: DbClient,
  userId: string,
  rawInput: OwnerSetupDraft,
) {
  const input = readOwnerSignupDraft(rawInput)
  if (!input)
    throw new OwnerSignupSetupError(
      "Complete the business details before finishing.",
    )
  const pending = await getPendingOwnerSignup(db, userId)
  if (!pending) return { completed: true } // Retry after a committed response loss is harmless.
  // Serialize completion for this owner across requests and tabs.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner-signup:${userId}`}))`
  const current = await getPendingOwnerSignup(db, userId)
  if (!current) return { completed: true }
  const businesses = input.businesses.map((business, index) =>
    index === 0
      ? business
      : {
          ...business,
          slug: withQaWorkspaceSuffix(
            business.slug,
            Boolean(configuredQaDomainForEmail(current.ownerEmail)),
            40,
          ),
        },
  )
  if (new Set(businesses.map((b) => b.slug)).size !== businesses.length)
    throw new OwnerSignupSetupError("Each business needs its own store link.")
  const first = businesses[0]
  if (
    !first ||
    first.name !== current.tenant.name ||
    first.slug !== current.tenant.slug
  )
    throw new OwnerSignupSetupError(
      "Keep your first business name and store link unchanged.",
    )
  const chosenPlan = ownerSignupLaunchPlan(input.planId, businesses.length)
  const plan = findRetailOpsPlan(chosenPlan)
  if (!plan) throw new OwnerSignupSetupError("Choose a supported plan.")
  const owned = await db.membership.count({
    where: {
      userId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: { isActive: true },
    },
  })
  const available = Math.max(1, plan.limits.businesses - owned + 1)
  const setupNow = businesses.slice(0, available)
  const waiting = businesses.slice(available)
  const grantedPlan =
    setupNow.length <= 1 ? "starter" : setupNow.length <= 3 ? "growth" : "pro"
  if (
    setupNow.some(
      (business) =>
        !/^[A-Z]{2}$/.test(business.countryCode) ||
        !isOperatingCurrencyCode(business.currencyCode),
    )
  )
    throw new OwnerSignupSetupError(
      "Choose a country and currency for each business you are setting up now.",
    )
  const ready: { id: string; name: string; slug: string }[] = []
  const updateStore = async (
    storeId: string,
    tenantId: string,
    business: OwnerSetupBusiness,
  ) => {
    const store = await db.store.findFirst({
      where: { id: storeId, tenantId },
      select: { metadata: true },
    })
    if (!store) throw new OwnerSignupSetupError("Your Store is unavailable.")
    const metadata = record(store.metadata)
    const retailOps = record(metadata.retailOps)
    const onboarding = {
      ...record(retailOps.onboarding),
      businessTypeKeys: business.typeKeys,
      otherBusinessType: business.typeKeys.includes("other")
        ? (business.otherType?.trim() ?? null)
        : null,
      businessProfileKey:
        findBusinessType(business.typeKeys[0])?.businessProfileKey ??
        "other-mixed-business",
      businessProfileVersion: 1,
      operatingModel:
        business.operatingModel ?? defaultBusinessOffer(business.typeKeys),
      setupStatus: "complete",
      countryCode: business.countryCode,
      currencyCode: business.currencyCode,
    }
    await db.store.update({
      where: { id: storeId },
      data: {
        currencyCode: business.currencyCode,
        countryCode: business.countryCode,
        description: business.description?.trim() || null,
        addressLine1: business.addressLine1?.trim() || null,
        city: business.city?.trim() || null,
        region: business.region?.trim() || null,
        metadata: {
          ...metadata,
          retailOps: { ...retailOps, onboarding },
        } as Prisma.InputJsonObject,
      },
    })
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { metadata: true, subscription: { select: { id: true } } },
    })
    const tenantMetadata = record(tenant.metadata)
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        currencyCode: business.currencyCode,
        ...(tenant.subscription
          ? {}
          : {
              metadata: withOwnerSignupLaunchGrant(
                tenantMetadata,
                grantedPlan,
              ) as Prisma.InputJsonObject,
            }),
      },
    })
  }
  const firstStore = current.tenant.stores.find(
    (s) =>
      readBusinessOnboardingFactsFromStoreMetadata(s.metadata)?.setupStatus ===
      "pending",
  )
  if (!firstStore)
    throw new OwnerSignupSetupError("Your pending Store is unavailable.")
  await updateStore(firstStore.id, current.tenantId, first)
  ready.push({ id: current.tenantId, name: first.name, slug: first.slug })
  for (const business of setupNow.slice(1)) {
    if (!isOperatingCurrencyCode(business.currencyCode))
      throw new OwnerSignupSetupError("Choose a currency.")
    let created: Awaited<ReturnType<typeof createOwnerSignupBusiness>>
    try {
      created = await createOwnerSignupBusiness(db, {
        userId,
        businessName: business.name,
        requestedSlug: business.slug,
        currencyCode: business.currencyCode,
        setupStatus: "complete",
      })
    } catch (error) {
      if (error instanceof StoreLinkConflictError)
        throw new OwnerSignupSetupError(error.message, business.id, "CONFLICT")
      throw error
    }
    if (!created.storeId)
      throw new OwnerSignupSetupError("Unable to create the Store.")
    await updateStore(created.storeId, created.id, business)
    ready.push({ id: created.id, name: created.name, slug: created.slug })
  }
  const session = await db.onboardingSession.findFirst({
    where: { tenantId: current.tenantId, userId },
    orderBy: { createdAt: "desc" },
  })
  const formData = {
    ...record(session?.formData),
    ownerSignup: { ...input, planId: grantedPlan, businesses },
    readyBusinesses: ready,
    pendingBusinesses: waiting,
  } as Prisma.InputJsonObject
  if (session)
    await db.onboardingSession.update({
      where: { id: session.id },
      data: { completed: true, formData },
    })
  else
    await db.onboardingSession.create({
      data: {
        tenantId: current.tenantId,
        userId,
        completed: true,
        formData,
        expiresAt: new Date(Date.now() + 365 * 86400_000),
      },
    })
  return { completed: true }
}
