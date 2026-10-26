import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import {
  findRetailOpsPlan,
  planHasFeature,
} from "./retail-ops-subscription-plans"
import {
  projectDurableReviewerAccess,
  projectDurableStoreAccess,
  resolveRetailOpsPlanId,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

/**
 * Site draft/release lifecycle repository. The single writer is the API storefront
 * command (apps/api/src/storefront/site-commands.ts): it opens one transaction with
 * `storefrontTransactionOptions()`, calls `lockStorefrontAuthorityInTransaction`
 * first and validates compositions against the registered manifest. Releases are
 * immutable; publication freezes a new release, rollback restores a retained release,
 * and both move Site.activeReleaseId with a compare-and-set and separate audit.
 */
export type SiteScope = { tenantId: string; storeId: string; siteId: string }
type Tx = Prisma.TransactionClient

export type SiteConflict = {
  ok: false
  reason: "draft-conflict" | "active-release-conflict" | "idempotency-conflict"
  current: {
    draftRevision: number
    activeReleaseId: string | null
    draftComposition: Prisma.JsonValue | null
    draftUpdatedAt: Date | null
    draftUpdatedById: string | null
  }
}

const siteSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  status: true,
  isPrimary: true,
  draftComposition: true,
  draftRevision: true,
  draftUpdatedAt: true,
  draftUpdatedById: true,
  activeReleaseId: true,
} satisfies Prisma.SiteSelect
type SiteRow = Prisma.SiteGetPayload<{ select: typeof siteSelect }>

const releaseSummarySelect = {
  id: true,
  baseReleaseId: true,
  draftRevision: true,
  contentHash: true,
  templateKey: true,
  templateVersion: true,
  runtimeVersion: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.SiteReleaseSelect

/** Fresh object per call: Prisma writes the tx id into the options it is given. */
export const storefrontTransactionOptions = () => ({
  maxWait: 10_000,
  timeout: 30_000,
})

/** Stable key order so the same composition always yields the same hash. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`
  return JSON.stringify(value)
}

export function siteContentHash(composition: unknown) {
  return createHash("sha256").update(stableJson(composition)).digest("hex")
}

export type StorefrontAuthority = {
  tenant: { id: string; slug: string; dataClassification: "LIVE" | "QA" }
  store: { id: string; name: string }
  plan: {
    id: string
    storefrontItems: number | null
    customerMessages: boolean
  }
}

/**
 * Fresh Owner/Admin authority for one explicit Store, rechecked inside the write
 * transaction. Membership and Store are share-locked until commit so a revocation,
 * Store deactivation or Tenant suspension cannot pass between decision and effect.
 * Tenant and actor come from the server session, never request input. Returns null
 * with a reason instead of throwing so the command maps errors once.
 */
export async function lockStorefrontAuthorityInTransaction(
  tx: Tx,
  input: { tenantId: string; actorUserId: string; storeId: string },
): Promise<
  | { ok: true; authority: StorefrontAuthority }
  | {
      ok: false
      reason: "forbidden" | "store-unavailable" | "plan-unavailable"
    }
> {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${input.tenantId} FOR SHARE`
  await tx.$queryRaw`SELECT "id" FROM "TenantSubscription" WHERE "tenantId" = ${input.tenantId} FOR SHARE`
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.actorUserId} FOR SHARE`
  await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${input.storeId} AND "tenantId" = ${input.tenantId} FOR SHARE`
  const membership = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: {
      tenant: {
        select: {
          id: true,
          slug: true,
          isActive: true,
          dataClassification: true,
          metadata: true,
          subscription: {
            select: {
              plan: { select: { key: true } },
              provider: true,
              status: true,
              billingSubscriptionId: true,
              currentPeriodEndsAt: true,
            },
          },
        },
      },
    },
  })
  const tenant = membership?.tenant
  if (!tenant?.isActive) return { ok: false, reason: "forbidden" }
  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
    select: { id: true, name: true },
  })
  if (!store) return { ok: false, reason: "store-unavailable" }
  // Same durable access projection the public storefront applies.
  if (
    tenant.subscription &&
    (projectDurableStoreAccess(tenant.subscription) === false ||
      projectDurableReviewerAccess(tenant.subscription) === false)
  )
    return { ok: false, reason: "plan-unavailable" }
  const plan = findRetailOpsPlan(
    resolveRetailOpsPlanId({
      metadata: tenant.metadata,
      subscription: tenant.subscription,
    }),
  )
  if (!plan) return { ok: false, reason: "plan-unavailable" }
  return {
    ok: true,
    authority: {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        dataClassification: tenant.dataClassification,
      },
      store,
      plan: {
        id: plan.id,
        storefrontItems: plan.limits.storefrontItems,
        customerMessages: planHasFeature(plan, "customerMessages"),
      },
    },
  }
}

/** Serializes primary-Site initialization per Tenant (no schema-level partial unique). */
export async function lockTenantSitesInTransaction(tx: Tx, tenantId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`
}

/** Row lock held to commit: one publish/rollback/edit decision per Site at a time. */
export async function lockSiteInTransaction(tx: Tx, scope: SiteScope) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Site" WHERE "id" = ${scope.siteId} AND "tenantId" = ${scope.tenantId} AND "storeId" = ${scope.storeId} FOR UPDATE`
  return rows.length === 1
}

export async function getPrimarySite(db: DbClient, tenantId: string) {
  const sites = await db.site.findMany({
    where: { tenantId, isPrimary: true },
    take: 2,
    select: siteSelect,
  })
  if (sites.length > 1)
    throw new Error("Multiple primary storefronts require review.")
  return sites[0] ?? null
}

export async function getScopedSite(db: DbClient, scope: SiteScope) {
  return db.site.findFirst({
    where: {
      id: scope.siteId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    },
    select: siteSelect,
  })
}

/**
 * Create the Tenant's primary Site on the explicitly selected Store with a validated
 * default draft. Caller holds `lockTenantSitesInTransaction` and has already checked
 * that no primary Site exists. Existing builder Sites/Pages are left untouched.
 */
export async function createPrimarySiteInTransaction(
  tx: Tx,
  input: {
    tenantId: string
    storeId: string
    name: string
    composition: Prisma.InputJsonValue
    actorId: string
  },
) {
  const taken = await tx.site.findMany({
    where: { storeId: input.storeId, slug: { startsWith: "storefront" } },
    select: { slug: true },
  })
  const slugs = new Set(taken.map((row) => row.slug))
  let slug = "storefront"
  for (let n = 2; slugs.has(slug); n++) slug = `storefront-${n}`
  return tx.site.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      slug,
      name: input.name,
      isPrimary: true,
      status: "DRAFT",
      draftComposition: input.composition,
      draftRevision: 1,
      draftUpdatedById: input.actorId,
      draftUpdatedAt: new Date(),
    },
    select: siteSelect,
  })
}

/** Compare-and-set on draftRevision: a stale editor never overwrites newer work. */
export async function saveSiteDraftInTransaction(
  tx: Tx,
  input: SiteScope & {
    expectedRevision: number
    composition: Prisma.InputJsonValue
    actorId: string
  },
) {
  const { count } = await tx.site.updateMany({
    where: {
      id: input.siteId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      draftRevision: input.expectedRevision,
    },
    data: {
      draftComposition: input.composition,
      draftRevision: { increment: 1 },
      draftUpdatedById: input.actorId,
      draftUpdatedAt: new Date(),
    },
  })
  const site = await getScopedSite(tx, input)
  if (!site) return null
  if (count === 0) return conflict("draft-conflict", site)
  return { ok: true as const, site }
}

export async function findSiteReleaseInTransaction(
  tx: Tx,
  scope: SiteScope,
  where: { id: string } | { idempotencyKey: string },
) {
  return tx.siteRelease.findFirst({
    where: {
      ...where,
      siteId: scope.siteId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    },
  })
}

/**
 * Freeze an exact composition as a new immutable release and activate it with the
 * Site publication state in one conditional update fenced on activeReleaseId (and on
 * draftRevision for draft publishes). Caller holds `lockSiteInTransaction`, has run
 * the idempotent-replay check and validated the composition. A failed fence returns
 * a conflict and the caller must abort the transaction so the release row rolls back.
 */
export async function activateSiteReleaseInTransaction(
  tx: Tx,
  input: SiteScope & {
    composition: Prisma.InputJsonValue
    draftRevision: number
    templateKey: string
    templateVersion: string
    runtimeVersion: number
    idempotencyKey: string
    expectedActiveReleaseId: string | null
    /** Draft publishes also fence on the exact draft revision; rollbacks do not. */
    expectedDraftRevision: number | null
    actorId: string
  },
) {
  const release = await tx.siteRelease.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId,
      storeId: input.storeId,
      draftRevision: input.draftRevision,
      contentHash: siteContentHash(input.composition),
      composition: input.composition,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      runtimeVersion: input.runtimeVersion,
      idempotencyKey: input.idempotencyKey,
      baseReleaseId: input.expectedActiveReleaseId,
      createdById: input.actorId,
    },
  })
  const { count } = await tx.site.updateMany({
    where: {
      id: input.siteId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      activeReleaseId: input.expectedActiveReleaseId,
      ...(input.expectedDraftRevision === null
        ? {}
        : { draftRevision: input.expectedDraftRevision }),
    },
    // Publication time is the active release's createdAt (Site has no publishedAt).
    data: { activeReleaseId: release.id, status: "PUBLISHED" },
  })
  return count === 1 ? { ok: true as const, release } : null
}

export async function listSiteReleases(
  db: DbClient,
  scope: SiteScope,
  take = 20,
) {
  const limit = Number.isSafeInteger(take) && take > 0 ? Math.min(take, 50) : 20
  return db.siteRelease.findMany({
    where: {
      siteId: scope.siteId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: releaseSummarySelect,
  })
}

/** Custom hostnames are reported separately from storefront readiness. */
export async function listTenantStorefrontHostnames(
  db: DbClient,
  tenantId: string,
) {
  return db.domainConnection.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 10,
    select: { hostname: true, status: true, siteId: true },
  })
}

/**
 * Live reader authority: the tenant's primary published Site and its active release
 * only. The relation checks the id alone, so release tenant/Store/Site are rechecked.
 */
export async function getLiveSiteRelease(db: DbClient, tenantId: string) {
  const sites = await db.site.findMany({
    take: 2,
    where: {
      tenantId,
      isPrimary: true,
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      status: true,
      store: { select: { status: true } },
      activeRelease: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          siteId: true,
          composition: true,
          contentHash: true,
          templateKey: true,
          templateVersion: true,
          runtimeVersion: true,
        },
      },
    },
  })
  const site = sites.length === 1 ? sites[0] : null
  const release = site?.activeRelease
  if (
    !site ||
    !release ||
    site.status !== "PUBLISHED" ||
    site.store.status !== "ACTIVE"
  )
    return null
  if (
    release.tenantId !== site.tenantId ||
    release.storeId !== site.storeId ||
    release.siteId !== site.id
  )
    return null
  return { siteId: site.id, storeId: site.storeId, release }
}

export function siteConflict(reason: SiteConflict["reason"], site: SiteRow) {
  return conflict(reason, site)
}

function conflict(reason: SiteConflict["reason"], site: SiteRow): SiteConflict {
  return {
    ok: false,
    reason,
    current: {
      draftRevision: site.draftRevision,
      activeReleaseId: site.activeReleaseId,
      draftComposition: site.draftComposition,
      draftUpdatedAt: site.draftUpdatedAt,
      draftUpdatedById: site.draftUpdatedById,
    },
  }
}

/** Restore a retained design by moving the pointer only; caller owns authority/audit. */
export async function restoreSiteReleaseInTransaction(
  tx: Tx,
  input: SiteScope & {
    releaseId: string
    expectedActiveReleaseId: string | null
  },
) {
  const { count } = await tx.site.updateMany({
    where: {
      id: input.siteId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: "PUBLISHED",
      activeReleaseId: input.expectedActiveReleaseId,
    },
    data: { activeReleaseId: input.releaseId },
  })
  return count === 1
}
