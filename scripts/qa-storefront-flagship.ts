/**
 * Commerce studio QA fixtures and publication for the local non-production database.
 *
 *   node scripts/with-workspace-env.mjs bun scripts/qa-storefront-flagship.ts <command>
 *
 * Commands
 *   fixtures            Create the isolated fixture businesses (idempotent by slug).
 *   publish <slug>      Publish commerce-studio for an existing QA business as its owner,
 *                       recording the prior state in the ledger.
 *   restore <slug>      Re-activate the business's original release (or remove a Site this
 *                       script created), using canonical rollback where one existed.
 *   dispose-fixtures    Delete every fixture business created by `fixtures`.
 *   enable-bookings <slug>
 *                       Turn on appointment booking (one resource, Mon–Sat open times)
 *                       for a fixture business's services, via canonical commands.
 *   status              Print ledger and fixture state.
 *
 * Guards: verified local profile only (DEV_PROFILE=local, APP_ENV=local, Neon local
 * branch), QA-classified tenants only. No provider, payment or message effect.
 */
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "@ewatrade/db"
import {
  createCatalogItem,
  createServiceCommerceBookingResource,
  createServiceRequestForm,
  getCatalogOfferingAvailability,
  reserveCatalogOfferingStock,
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceBookingConfiguration,
  updateServiceCommerceStoreProfile,
} from "@ewatrade/db/queries"
import {
  commerceStudioManifest,
  defaultComposition,
} from "@ewatrade/storefront-templates"
import {
  initializeStorefront,
  publishStorefront,
  readStorefrontDraft,
  rollbackStorefront,
  saveStorefrontDraft,
} from "../apps/api/src/storefront/site-commands"
import {
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
} from "../packages/db/generated/prisma/enums"

const FIXTURE_DOMAIN = "storefront-flagship.qa.test"
const LEDGER = join(process.cwd(), ".scratch/storefront-flagship/ledger.json")

export function guard() {
  const url = process.env.EWATRADE_DATABASE_URL ?? ""
  const host = url ? new URL(url).hostname : ""
  if (
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.DEV_PROFILE !== "local" ||
    (process.env.APP_ENV && process.env.APP_ENV !== "local") ||
    process.env.NODE_ENV === "production" ||
    !host.endsWith(".neon.tech")
  )
    throw new Error(
      "Refusing: this script only runs on the verified local QA database.",
    )
}

type Ledger = Record<
  string,
  {
    tenantId: string
    siteId: string
    createdSite: boolean
    originalActiveReleaseId: string | null
    originalTemplate: string | null
    publishedReleaseId?: string
    at: string
  }
>
const readLedger = (): Ledger =>
  existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger) : {}
const writeLedger = (ledger: Ledger) => {
  mkdirSync(join(process.cwd(), ".scratch/storefront-flagship"), {
    recursive: true,
  })
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`)
}

async function ownerOf(tenantId: string) {
  const owner = await prisma.membership.findFirst({
    where: { tenantId, role: "OWNER", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  })
  if (!owner) throw new Error("Tenant has no active owner.")
  return owner.userId
}

type HeaderSettings = Partial<{
  tagline: string
  location: string
  hours: string
  "offer-pickup": boolean
  "offer-delivery": boolean
  "delivery-note": string
}>

/** Commerce studio draft with merchant-entered header copy, via canonical CAS commands. */
export async function publishCommerceStudio(
  tenantId: string,
  header: HeaderSettings,
  theme?: Partial<{
    accent: string
    background: string
    font: "system" | "serif"
    radius: "none" | "small" | "rounded"
  }>,
  mutate?: (composition: ReturnType<typeof defaultComposition>) => void,
) {
  const actor = { tenantId, actorUserId: await ownerOf(tenantId) }
  const store = await prisma.store.findFirstOrThrow({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  const before = await prisma.site.findFirst({
    where: { tenantId, isPrimary: true },
    select: {
      id: true,
      activeReleaseId: true,
      activeRelease: { select: { templateKey: true, templateVersion: true } },
    },
  })
  const init = await initializeStorefront(prisma, actor, {
    storeId: before
      ? (
          await prisma.site.findUniqueOrThrow({
            where: { id: before.id },
            select: { storeId: true },
          })
        ).storeId
      : store.id,
    templateKey: commerceStudioManifest.key,
    templateVersion: commerceStudioManifest.version,
  })
  if (!init.ok) throw new Error(`Initialize refused: ${init.reason}`)
  const draft = await readStorefrontDraft(prisma, actor)
  if (!draft || !("site" in draft || "siteId" in draft))
    throw new Error("No draft.")
  const site = await prisma.site.findFirstOrThrow({
    where: { tenantId, isPrimary: true },
    select: { id: true, draftRevision: true, activeReleaseId: true },
  })
  const composition = defaultComposition(commerceStudioManifest)
  composition.theme = {
    font: "serif",
    accent: "#8b4b35",
    background: "#f7f5ef",
    radius: "small",
    ...theme,
  }
  for (const page of composition.pages)
    for (const section of page.sections)
      if (section.type === "commerce-studio-header")
        section.settings = { ...section.settings, ...header }
  mutate?.(composition)
  const saved = await saveStorefrontDraft(prisma, actor, {
    expectedSiteId: site.id,
    expectedRevision: site.draftRevision,
    composition,
  })
  if (!saved.ok)
    throw new Error(`Save refused: ${JSON.stringify(saved).slice(0, 300)}`)
  const current = await prisma.site.findUniqueOrThrow({
    where: { id: site.id },
    select: { draftRevision: true, activeReleaseId: true },
  })
  const published = await publishStorefront(prisma, actor, {
    expectedSiteId: site.id,
    expectedDraftRevision: current.draftRevision,
    expectedActiveReleaseId: current.activeReleaseId,
    idempotencyKey: `flagship-${randomUUID()}`,
    publicBrowsingConsent: true,
  })
  if (!(published as { ok?: boolean }).ok)
    throw new Error(
      `Publish refused: ${JSON.stringify(published).slice(0, 300)}`,
    )
  const after = await prisma.site.findUniqueOrThrow({
    where: { id: site.id },
    select: { activeReleaseId: true },
  })
  return {
    siteId: site.id,
    createdSite: !before,
    originalActiveReleaseId: before?.activeReleaseId ?? null,
    originalTemplate: before?.activeRelease
      ? `${before.activeRelease.templateKey}@${before.activeRelease.templateVersion}`
      : null,
    publishedReleaseId: after.activeReleaseId ?? undefined,
  }
}

// ---------------------------------------------------------------- Fixtures

type ProductSpec = {
  name: string
  description?: string
  unit: string
  scale?: number
  options: {
    name: string
    priceMinor: number | null
    stock?: string
    reserved?: string
  }[]
}
type ServiceSpec = {
  name: string
  description?: string
  options: { name: string; priceMinor: number | null; scale?: number }[]
}
export type FixtureSpec = {
  slug: string
  name: string
  description: string | null
  supportPhone: string | null
  products: ProductSpec[]
  services: ServiceSpec[]
  header: HeaderSettings
  represents: string
}

const fixtures: FixtureSpec[] = [
  {
    slug: "sf-flagship-single-loaf-qa",
    name: "Iya Basira Bakery",
    description: "Fresh agege bread baked every morning.",
    supportPhone: null,
    products: [
      {
        name: "Agege bread loaf",
        description: "Soft, slightly sweet loaf, baked before 7am.",
        unit: "loaf",
        options: [{ name: "Loaf", priceMinor: 150000, stock: "40" }],
      },
    ],
    services: [],
    header: {
      tagline: "Bread from the corner oven",
      location: "Ojota, Lagos",
      hours: "Mon–Sat, 6am–2pm",
    },
    represents: "Only one product",
  },
  {
    slug: "sf-flagship-tailor-qa",
    name: "Tola Stitches",
    description: "Ready-made aso-oke caps and made-to-measure alterations.",
    supportPhone: "+2348031112233",
    products: [
      {
        name: "Aso-oke fila",
        description: "Hand-woven cap. Size by head circumference.",
        unit: "cap",
        options: [
          { name: "Medium", priceMinor: 1200000, stock: "6" },
          { name: "Large", priceMinor: 1350000, stock: "2" },
        ],
      },
    ],
    services: [
      {
        name: "Alterations",
        description:
          "Hems, waist and sleeve adjustments. Bring the garment or ask us to collect.",
        options: [
          { name: "Trouser hem", priceMinor: 300000 },
          { name: "Agbada resize", priceMinor: null },
        ],
      },
    ],
    header: {
      tagline: "Tailoring in Yaba",
      location: "Yaba market, shop 14",
      hours: "Mon–Sat, 9am–6pm",
      "offer-delivery": true,
      "delivery-note": "Delivery within Lagos mainland",
    },
    represents:
      "One product and one service (multi-option, fixed + quote-required)",
  },
  {
    slug: "sf-flagship-cleaner-qa",
    name: "Bright Hands Cleaning",
    description: "Home deep cleaning by a two-person team.",
    supportPhone: "+2348049998877",
    products: [],
    services: [
      {
        name: "Home deep clean",
        description:
          "Kitchen, bathrooms, floors and windows. Supplies included.",
        options: [{ name: "Up to 3 rooms", priceMinor: 4500000 }],
      },
    ],
    header: {
      tagline: "Deep cleaning, Lekki to Ajah",
      location: "Lekki Phase 1",
      hours: "Daily, 8am–5pm",
    },
    represents: "Services-only with one service",
  },
  {
    slug: "sf-flagship-soldout-qa",
    name: "Kemi's Kitchen Jars",
    description: "Small-batch pepper sauce and chin-chin.",
    supportPhone: null,
    products: [
      {
        name: "Ata dindin pepper sauce",
        unit: "jar",
        options: [
          { name: "500ml jar", priceMinor: 450000, stock: "2", reserved: "2" },
        ],
      },
      {
        name: "Chin-chin",
        unit: "pack",
        options: [
          { name: "1kg pack", priceMinor: 600000, stock: "1", reserved: "1" },
        ],
      },
    ],
    services: [],
    header: { tagline: "Small batches, sold out often", location: "Surulere" },
    represents: "Every visible product unavailable (sold out)",
  },
  {
    slug: "sf-flagship-empty-qa",
    name: "New Leaf Store",
    description: null,
    supportPhone: null,
    products: [],
    services: [],
    header: {},
    represents: "Empty business, no publishable offerings",
  },
  {
    slug: "sf-flagship-plain-qa",
    name: "Adebayo & Sons General Merchandise and Household Supplies Limited",
    description: null,
    supportPhone: null,
    products: [
      {
        name: "Extra-large heavy-duty polypropylene storage container with lockable lid and wheels (120 litres)",
        description: "A very long description to check wrapping. "
          .repeat(12)
          .trim(),
        unit: "piece",
        options: [{ name: "Piece", priceMinor: 2599900, stock: "3" }],
      },
      {
        name: "Rice",
        unit: "kg",
        scale: 1,
        options: [{ name: "Per kg", priceMinor: 180000 }],
      },
      {
        name: "Custom shelving",
        unit: "set",
        options: [{ name: "Set", priceMinor: null }],
      },
    ],
    services: [],
    header: {},
    represents:
      "Incomplete branding, no contact, long text, unknown stock and decimal units",
  },
]

export async function createFixture(spec: FixtureSpec) {
  const existing = await prisma.tenant.findFirst({
    where: { slug: spec.slug },
    select: { id: true },
  })
  if (existing)
    return { slug: spec.slug, tenantId: existing.id, created: false }
  const now = new Date()
  const owner = await prisma.user.create({
    data: {
      ageBand: "ADULT",
      email: `owner+${spec.slug}@${FIXTURE_DOMAIN}`,
      emailVerified: true,
      name: `${spec.name} owner`,
    },
  })
  const tenant = await prisma.tenant.create({
    data: {
      dataClassification: "QA",
      qaSourceDomain: FIXTURE_DOMAIN,
      enabledModes: ["MERCHANT"],
      name: spec.name,
      slug: spec.slug,
      type: "MERCHANT",
      metadata: {
        retailOps: {
          subscription: {
            planId: "growth",
            source: "qa_storefront_flagship_fixture",
            grantedAt: now.toISOString(),
          },
        },
      },
      users: {
        create: {
          acceptedAt: now,
          role: "OWNER",
          status: "ACTIVE",
          userId: owner.id,
        },
      },
    },
  })
  const store = await prisma.store.create({
    data: {
      countryCode: "NG",
      currencyCode: "NGN",
      name: spec.name,
      slug: spec.slug,
      status: "ACTIVE",
      tenantId: tenant.id,
      description: spec.description,
      supportPhone: spec.supportPhone,
    },
  })
  const actorUserId = owner.id
  for (const product of spec.products) {
    const key = product.unit.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    await createCatalogItem(prisma, {
      actorUserId,
      clientOperationId: `fixture-${spec.slug}-${randomUUID()}`,
      kind: "product",
      name: product.name,
      ...(product.description ? { description: product.description } : {}),
      storeId: store.id,
      tenantId: tenant.id,
      unitConfiguration: {
        canonicalBalanceScale: 6,
        units: [
          {
            factor: "1",
            key,
            name: product.unit,
            stockBehavior: "canonical_shared",
            transactionScale: product.scale ?? 0,
          },
        ],
      },
      ...(product.options.length > 1
        ? {
            optionGroups: [
              {
                key: "option",
                name: "Option",
                values: product.options.map((option, index) => ({
                  key: `o${index}`,
                  label: option.name,
                })),
              },
            ],
          }
        : {}),
      variants: product.options.map((option, index) => ({
        isDefault: index === 0,
        key: `v${index}`,
        name: option.name,
        ...(product.options.length > 1
          ? { selections: [{ groupKey: "option", valueKey: `o${index}` }] }
          : {}),
        ...(option.stock !== undefined
          ? { openingStockQuantity: option.stock }
          : {}),
        offerings: [
          {
            key: `o${index}`,
            name: option.name,
            inventoryUnitKey: key,
            pricingPolicy: option.priceMinor === null ? "order_total" : "fixed",
            ...(option.priceMinor === null
              ? {}
              : { fixedPriceMinor: option.priceMinor }),
            storeAvailability: [{ isAvailable: true, storeId: store.id }],
          },
        ],
      })),
    } as Parameters<typeof createCatalogItem>[1])
  }
  // Sold-out case: real stock that is fully held by existing reservations (canonical command).
  for (const product of spec.products)
    for (const option of product.options) {
      if (!option.reserved) continue
      const offering = await prisma.sellableOffering.findFirstOrThrow({
        where: { tenantId: tenant.id, name: option.name, kind: "PRODUCT_UNIT" },
        select: { id: true },
      })
      const availability = await getCatalogOfferingAvailability(prisma, {
        offeringId: offering.id,
        storeId: store.id,
        tenantId: tenant.id,
      })
      await reserveCatalogOfferingStock(prisma, {
        clientReservationId: `fixture-hold-${offering.id}`,
        enteredQuantity: option.reserved,
        expectedConfigurationVersionId: availability.configurationVersionId,
        offeringId: offering.id,
        schemaVersion: 1,
        storeId: store.id,
        tenantId: tenant.id,
      })
    }
  const serviceOfferingIds: string[] = []
  if (spec.services.length) {
    await prisma.serviceCommercePolicyDecision.createMany({
      data: Object.values(ServiceCommercePolicyChannel).flatMap((channel) =>
        Object.values(ServiceCommercePolicySubject).map((subject) => ({
          approvalReference: `flagship-${spec.slug}`,
          channel,
          effectiveAt: new Date(now.getTime() - 60_000),
          evidenceReference: `flagship-${spec.slug}`,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          jurisdictionCode: "NG",
          outcome: ServiceCommercePolicyOutcome.ALLOWED,
          reason: "QA fixture policy for storefront flagship acceptance",
          reviewedByUserId: actorUserId,
          storeId: store.id,
          subject,
          tenantId: tenant.id,
          vertical: ServiceCommercePolicyVertical.SERVICE,
        })),
      ),
    })
    await updateServiceCommerceStoreProfile(prisma, {
      actorUserId,
      expectedRevision: 0,
      reason: "Storefront flagship QA fixture",
      settings: {
        capabilities: {
          attachments: false,
          booking: false,
          delivery: true,
          intake: true,
          payment: true,
          pickup: true,
          progressive_catalog: false,
          quote: true,
          service_completion: false,
          staff: true,
          web: true,
          whatsapp: false,
        },
        catalogAdoptionMode: "progressive",
        procureToOrderEnabled: false,
      },
      storeId: store.id,
      tenantId: tenant.id,
    } as Parameters<typeof updateServiceCommerceStoreProfile>[1])
    for (const service of spec.services) {
      const item = await createCatalogItem(prisma, {
        actorUserId,
        clientOperationId: `fixture-${spec.slug}-${randomUUID()}`,
        kind: "service",
        name: service.name,
        ...(service.description ? { description: service.description } : {}),
        storeId: store.id,
        tenantId: tenant.id,
        ...(service.options.length > 1
          ? {
              optionGroups: [
                {
                  key: "option",
                  name: "Option",
                  values: service.options.map((option, index) => ({
                    key: `o${index}`,
                    label: option.name,
                  })),
                },
              ],
            }
          : {}),
        variants: service.options.map((option, index) => ({
          isDefault: index === 0,
          key: `v${index}`,
          name: option.name,
          ...(service.options.length > 1
            ? { selections: [{ groupKey: "option", valueKey: `o${index}` }] }
            : {}),
          offerings: [
            {
              key: `o${index}`,
              name: option.name,
              pricingPolicy:
                option.priceMinor === null ? "quote_required" : "fixed",
              ...(option.priceMinor === null
                ? {}
                : { fixedPriceMinor: option.priceMinor }),
              quantityScale: option.scale ?? 0,
              storeAvailability: [{ isAvailable: true, storeId: store.id }],
            },
          ],
        })),
      } as Parameters<typeof createCatalogItem>[1])
      const offerings = await prisma.sellableOffering.findMany({
        where: { catalogItemId: (item as { id: string }).id },
        select: { id: true },
      })
      serviceOfferingIds.push(...offerings.map((offering) => offering.id))
    }
    await createServiceRequestForm(prisma, {
      actorUserId,
      label: "Storefront requests",
      offeringIds: serviceOfferingIds,
      storeId: store.id,
      tenantId: tenant.id,
    })
  }
  const published = await publishCommerceStudio(tenant.id, spec.header)
  return { slug: spec.slug, tenantId: tenant.id, created: true, ...published }
}

export async function disposeFixtures(only?: string) {
  const tenants = await prisma.tenant.findMany({
    where: {
      qaSourceDomain: FIXTURE_DOMAIN,
      dataClassification: "QA",
      slug: only ? only : { startsWith: "sf-flagship-" },
    },
    select: { id: true, slug: true, users: { select: { userId: true } } },
  })
  for (const tenant of tenants) {
    const tenantId = tenant.id
    await prisma.$transaction(
      async (tx) => {
        await tx.storefrontMerchantAlert.deleteMany({ where: { tenantId } })
        await tx.storefrontRequestMessage.deleteMany({ where: { tenantId } })
        await tx.storefrontServiceRequestContext.deleteMany({
          where: { tenantId },
        })
        await tx.storefrontOrderRequest.updateMany({
          where: { tenantId },
          data: { confirmedOrderId: null },
        })
        await tx.storefrontOrderRequest.deleteMany({ where: { tenantId } })
        await tx.storefrontCustomerSession.deleteMany({ where: { tenantId } })
        await tx.storefrontCustomerOtpChallenge.deleteMany({
          where: { tenantId },
        })
        await tx.storefrontCustomer.deleteMany({ where: { tenantId } })
        await tx.site.updateMany({
          where: { tenantId },
          data: { activeReleaseId: null },
        })
        await tx.businessActivityOutbox
          .deleteMany({ where: { event: { tenantId } } })
          .catch(() => undefined)
        await tx.businessActivityStoreScope
          .deleteMany({ where: { event: { tenantId } } })
          .catch(() => undefined)
        await tx.businessActivityEvent.deleteMany({ where: { tenantId } })
        await tx.siteRelease.deleteMany({ where: { tenantId } })
        await tx.site.deleteMany({ where: { tenantId } })
      },
      { maxWait: 10_000, timeout: 60_000 },
    )
    // Remaining commerce graph: reuse the canonical acceptance fixture cleanup order.
    const { disposeCommerceAcceptanceFixture } = await import(
      "../packages/db/src/queries/acceptance/service-commerce/commerce.fixture"
    )
    await disposeCommerceAcceptanceFixture({
      db: prisma,
      tenantId,
      cleanupUserIds: tenant.users.map((user) => user.userId),
    } as never)
    console.log(`disposed ${tenant.slug}`)
  }
}

/**
 * Turn on appointment booking for a fixture business through the canonical commands:
 * Service Commerce settings (bookings on), activation, one bookable resource and open
 * times (Mon–Sat 09:00–18:00 Lagos, 30-minute slots, no payment to book) for every
 * service offering. Idempotent: an offering that already has open times is kept.
 */
export async function enableFixtureBookings(tenantId: string) {
  const actorUserId = await ownerOf(tenantId)
  const store = await prisma.store.findFirstOrThrow({
    where: { tenantId, tenant: { qaSourceDomain: FIXTURE_DOMAIN } },
    select: { id: true },
  })
  const scope = { actorUserId, storeId: store.id, tenantId }
  const profile = await prisma.serviceCommerceStoreProfile.findUniqueOrThrow({
    where: { storeId: store.id },
    select: { revision: true, status: true, bookingEnabled: true },
  })
  let revision = profile.revision
  if (!profile.bookingEnabled) {
    await updateServiceCommerceStoreProfile(prisma, {
      ...scope,
      expectedRevision: revision,
      reason: "Storefront flagship appointment QA",
      settings: {
        capabilities: {
          attachments: false,
          booking: true,
          delivery: true,
          intake: true,
          payment: true,
          pickup: true,
          progressive_catalog: true,
          quote: true,
          service_completion: false,
          staff: true,
          web: true,
          whatsapp: false,
        },
        catalogAdoptionMode: "progressive",
        procureToOrderEnabled: false,
      },
    } as Parameters<typeof updateServiceCommerceStoreProfile>[1])
    revision = (
      await prisma.serviceCommerceStoreProfile.findUniqueOrThrow({
        where: { storeId: store.id },
        select: { revision: true },
      })
    ).revision
  }
  if (profile.status !== "ACTIVE")
    await setServiceCommerceStoreProfileActivation(prisma, {
      ...scope,
      active: true,
      expectedRevision: revision,
      reason: "Storefront flagship appointment QA",
    })
  const offerings = await prisma.sellableOffering.findMany({
    where: { tenantId, catalogItem: { kind: "SERVICE" } },
    select: { id: true, name: true },
    take: 20,
  })
  const configured = new Set(
    (
      await prisma.serviceBookingOfferingConfig.findMany({
        where: { tenantId, storeId: store.id },
        select: { offeringId: true },
      })
    ).map((row) => row.offeringId),
  )
  let resource: { id: string; label: string; capacity: number } | null = null
  for (const offering of offerings) {
    if (configured.has(offering.id)) continue
    if (!resource) {
      const created = await createServiceCommerceBookingResource(prisma, {
        ...scope,
        capacity: 1,
        clientOperationId: `flagship-resource-${tenantId}`,
        kind: "other",
        name: "Fitting table",
      })
      resource = {
        id: created.id,
        label: created.name,
        capacity: created.capacity,
      }
    }
    await updateServiceCommerceBookingConfiguration(prisma, {
      ...scope,
      clientOperationId: `flagship-booking-${offering.id}`,
      expectedRevision: 0,
      offeringId: offering.id,
      availabilityRules: [
        {
          id: `flagship-open-${offering.id}`,
          daysOfWeek: [1, 2, 3, 4, 5, 6],
          startLocalTime: "09:00",
          endLocalTime: "18:00",
        },
      ],
      exceptions: [],
      bookingHorizonMinutes: 30 * 24 * 60,
      cancellationPolicy: {
        allowedUntilMinutesBeforeStart: 0,
        refundPolicy: "none",
      },
      holdDurationMinutes: 10,
      leadTimeMinutes: 0,
      paymentPolicy: { depositMinor: null, requirement: "none" },
      reminderLeadMinutes: 0,
      resources: [resource],
      slotDurationMinutes: 30,
      timezone: "Africa/Lagos",
    })
  }
  return { storeId: store.id, offerings: offerings.length }
}

async function main() {
  guard()
  const [command, slug] = process.argv.slice(2)
  if (command === "fixtures") {
    for (const spec of fixtures) {
      const result = await createFixture(spec)
      console.log(JSON.stringify({ ...result, represents: spec.represents }))
    }
    return
  }
  if (command === "publish" && slug) {
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { slug, dataClassification: "QA" },
      select: { id: true, name: true },
    })
    const ledger = readLedger()
    const header: HeaderSettings = { location: "", hours: "" }
    const result = await publishCommerceStudio(tenant.id, header, {})
    ledger[slug] = {
      tenantId: tenant.id,
      siteId: result.siteId,
      createdSite: ledger[slug]?.createdSite ?? result.createdSite,
      originalActiveReleaseId:
        ledger[slug]?.originalActiveReleaseId ?? result.originalActiveReleaseId,
      originalTemplate:
        ledger[slug]?.originalTemplate ?? result.originalTemplate,
      publishedReleaseId: result.publishedReleaseId,
      at: new Date().toISOString(),
    }
    writeLedger(ledger)
    console.log(JSON.stringify(ledger[slug]))
    return
  }
  if (command === "restore" && slug) {
    const ledger = readLedger()
    const entry = ledger[slug]
    if (!entry) throw new Error("No ledger entry for that business.")
    const actor = {
      tenantId: entry.tenantId,
      actorUserId: await ownerOf(entry.tenantId),
    }
    const site = await prisma.site.findUniqueOrThrow({
      where: { id: entry.siteId },
      select: { activeReleaseId: true },
    })
    if (entry.originalActiveReleaseId) {
      const result = await rollbackStorefront(prisma, actor, {
        expectedSiteId: entry.siteId,
        releaseId: entry.originalActiveReleaseId,
        expectedActiveReleaseId: site.activeReleaseId,
        idempotencyKey: `flagship-restore-${randomUUID()}`,
      })
      console.log(
        JSON.stringify({
          restored: slug,
          to: entry.originalActiveReleaseId,
          result: (result as { ok?: boolean }).ok,
        }),
      )
    } else if (entry.createdSite) {
      await prisma.$transaction(async (tx) => {
        await tx.site.update({
          where: { id: entry.siteId },
          data: { activeReleaseId: null },
        })
        await tx.siteRelease.deleteMany({ where: { siteId: entry.siteId } })
        await tx.site.delete({ where: { id: entry.siteId } })
      })
      console.log(JSON.stringify({ restored: slug, removedSite: entry.siteId }))
    }
    delete ledger[slug]
    writeLedger(ledger)
    return
  }
  if (command === "enable-bookings" && slug) {
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { slug, qaSourceDomain: FIXTURE_DOMAIN },
      select: { id: true },
    })
    console.log(JSON.stringify(await enableFixtureBookings(tenant.id)))
    return
  }
  if (command === "restyle" && slug) {
    // Configuration coverage on an owned fixture: theme controls and section management.
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { slug, qaSourceDomain: FIXTURE_DOMAIN },
      select: { id: true },
    })
    const result = await publishCommerceStudio(
      tenant.id,
      {
        tagline: "Everything for the home",
        location: "Oshodi, Lagos",
        hours: "Mon–Sat 8am–6pm",
        "offer-delivery": true,
        "delivery-note": "Delivery within Lagos",
      },
      {
        font: "system",
        accent: "#1d5c4d",
        background: "#fbfbf8",
        radius: "rounded",
      },
      (composition) => {
        composition.theme.width = "narrow"
        composition.theme.density = "compact"
        const home = composition.pages.find((page) => page.key === "home")
        if (!home) return
        const faq = home.sections.find(
          (section) => section.type === "commerce-studio-faq",
        )
        const story = home.sections.find(
          (section) => section.type === "commerce-studio-story",
        )
        if (story) story.visible = false
        const hero = home.sections.find(
          (section) => section.type === "commerce-studio-hero",
        )
        if (hero)
          hero.settings = {
            ...hero.settings,
            headline: "Sturdy things for busy homes",
            description:
              "Storage, rice by the kilo and made-to-measure shelving.",
            "show-actions": true,
          }
        const featured = home.sections.find(
          (section) => section.type === "commerce-studio-featured",
        )
        if (featured)
          featured.settings = {
            ...featured.settings,
            heading: "Popular this week",
            lead: "price-low",
            count: "three",
          }
        if (faq) {
          faq.settings = {
            ...faq.settings,
            "question-three": "Can I collect today?",
            "answer-three": "Yes, once the shop confirms your request.",
          }
          const copy = structuredClone(faq)
          copy.id = "home-faq-copy"
          copy.settings = { ...copy.settings, heading: "Delivery questions" }
          home.sections.splice(home.sections.length - 1, 0, copy)
          // Move FAQ directly after the introduction.
          home.sections.splice(home.sections.indexOf(faq), 1)
          home.sections.splice(2, 0, faq)
        }
      },
    )
    console.log(JSON.stringify(result))
    return
  }
  if (command === "dispose-fixtures") {
    await disposeFixtures(slug)
    return
  }
  if (command === "status") {
    console.log(JSON.stringify({ ledger: readLedger() }, null, 2))
    const tenants = await prisma.tenant.findMany({
      where: { qaSourceDomain: FIXTURE_DOMAIN },
      select: { slug: true, id: true },
    })
    console.log(JSON.stringify({ fixtures: tenants }, null, 2))
    return
  }
  throw new Error(
    "Usage: fixtures | publish <slug> | restore <slug> | dispose-fixtures | status",
  )
}

if (import.meta.main) {
  try {
    await main()
  } finally {
    await prisma.$disconnect()
  }
}
