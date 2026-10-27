import {
  STOREFRONT_DESIGN_PROMPT_VERSION,
  STOREFRONT_GENERATION_CONFIGURATION_KEY,
  isStorefrontDesignProviderConfigured,
  readStorefrontGenerationConfiguration,
  storefrontDesignPrompt,
} from "@ewatrade/ai/storefront-design"
import type { Prisma, PrismaClient } from "@ewatrade/db"
import {
  type SiteScope,
  type StorefrontAuthority,
  activateSiteReleaseInTransaction,
  cancelSiteDesignRunInTransaction,
  createPrimarySiteInTransaction,
  createSiteDesignRunInTransaction,
  findSiteDesignRequestInTransaction,
  findSiteDesignRunInTransaction,
  findSiteReleaseInTransaction,
  findStorefrontReplay,
  getPrimarySite,
  getScopedSite,
  getScopedStorefrontDesignPreview,
  listSiteDesignRunsInTransaction,
  listSiteReleases,
  listTenantStorefrontHostnames,
  lockSiteDesignRunInTransaction,
  lockSiteInTransaction,
  lockStorefrontAuthorityInTransaction,
  lockTenantSitesInTransaction,
  markSiteDesignAcceptedInTransaction,
  recordStorefrontActivity,
  restoreSiteReleaseInTransaction,
  saveSiteDraftInTransaction,
  siteConflict,
  siteContentHash,
  storefrontActivity,
  storefrontTransactionOptions,
} from "@ewatrade/db/queries"
import {
  type VersionIntent,
  versionAvailable,
} from "@ewatrade/storefront-contracts/availability"
import {
  createStorefrontDesignBrief,
  storefrontDesignBriefSchema,
  validateStorefrontDesignOutput,
} from "@ewatrade/storefront-contracts/design"
import {
  STOREFRONT_RUNTIME_VERSION,
  type StorefrontComposition,
  type TemplateManifest,
  assertCompositionSources,
  validateComposition,
} from "@ewatrade/storefront-contracts/manifest"
import { catalogQuerySchema } from "@ewatrade/storefront-contracts/resources"
import { validateDesignAssets } from "@ewatrade/storefront-runtime/design-assets"
import { publicStorefrontResources } from "@ewatrade/storefront-runtime/projection"
import {
  type StorefrontClientSnapshot,
  loadStorefront,
} from "@ewatrade/storefront-runtime/server"
import {
  defaultComposition,
  listSelectableTemplates,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { TRPCError } from "@trpc/server"
import {
  storefrontAcceptDesignSchema,
  storefrontDesignBriefRequestSchema,
  storefrontGenerateSchema,
  storefrontGenerationIdSchema,
  storefrontInitializeSchema,
  storefrontPreviewSchema,
  storefrontPublishSchema,
  storefrontRollbackSchema,
  storefrontSaveDraftSchema,
} from "../schemas/storefront"
import {
  createStorefrontPreviewSession,
  verifyStorefrontPreviewSession,
} from "./preview-session"

/**
 * Canonical storefront draft/release commands: the only writer of Site drafts,
 * releases and the active pointer. Tenant and actor always come from the server
 * session; every command rechecks Owner/Admin membership, Store and plan inside
 * its own write transaction, so a cached router role is never the authority.
 */
export type StorefrontActor = { tenantId: string; actorUserId: string }
type Tx = Prisma.TransactionClient

const DEFAULT_TEMPLATE_KEY = "catalog-v4"

/** Only runtime-registered, qualified templates on the current runtime are usable. */
function usableTemplate(
  key: string,
  version?: string,
  intent: VersionIntent = "inspect",
) {
  const entry = (
    version === undefined ? listSelectableTemplates() : templateRegistry
  ).find(
    ({ manifest }) =>
      manifest.key === key &&
      (version === undefined || manifest.version === version),
  )
  if (
    !entry ||
    entry.status.registration !== "runtime-registered" ||
    entry.status.qualification !== "qualified" ||
    !versionAvailable(entry, intent) ||
    entry.manifest.runtimeVersion !== STOREFRONT_RUNTIME_VERSION
  )
    return null
  return entry.manifest
}

/** Validates against the registered manifest the composition names. */
function checkComposition(
  input: unknown,
  intent: VersionIntent = "inspect",
):
  | { ok: true; composition: StorefrontComposition; manifest: TemplateManifest }
  | { ok: false; issue: string } {
  const template = (
    input as { template?: { key?: unknown; version?: unknown } } | null
  )?.template
  const manifest =
    typeof template?.key === "string" && typeof template.version === "string"
      ? usableTemplate(template.key, template.version, intent)
      : null
  if (!manifest)
    return {
      ok: false,
      issue: "This storefront design version isn't available.",
    }
  try {
    const composition = validateComposition(input, manifest)
    assertCompositionSources(composition, (pin) =>
      usableTemplate(pin.key, pin.version, intent),
    )
    validateDesignAssets(composition, manifest)
    return {
      ok: true,
      composition,
      manifest,
    }
  } catch (error) {
    const issue =
      error instanceof Error && !error.message.startsWith("[")
        ? error.message
        : "The storefront draft has invalid settings."
    return { ok: false, issue }
  }
}

function publishBlockers(input: unknown, intent: VersionIntent = "new-use") {
  const checked = checkComposition(input, intent)
  if (!checked.ok) return { checked, blockers: [checked.issue] }
  return {
    checked,
    blockers: [],
  }
}

function requireCompatibleRelease(
  release: NonNullable<
    Awaited<ReturnType<typeof findSiteReleaseInTransaction>>
  >,
) {
  const { checked, blockers } = publishBlockers(release.composition, "rollback")
  if (
    !checked.ok ||
    blockers.length ||
    release.runtimeVersion !== STOREFRONT_RUNTIME_VERSION ||
    checked.manifest.key !== release.templateKey ||
    checked.manifest.version !== release.templateVersion ||
    release.contentHash !== siteContentHash(release.composition)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "That storefront version is no longer compatible and can't be activated.",
    })
}

async function authorize(tx: Tx, actor: StorefrontActor, storeId: string) {
  const result = await lockStorefrontAuthorityInTransaction(tx, {
    ...actor,
    storeId,
  })
  if (result.ok) return result.authority
  if (result.reason === "forbidden")
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only active business Owners and Admins can manage the storefront.",
    })
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      result.reason === "store-unavailable"
        ? "The storefront's Store is not active."
        : "The business plan doesn't currently allow a public storefront.",
  })
}

/** Primary Site plus fresh authority for its own Store; null when not initialized. */
async function openPrimarySite(tx: Tx, actor: StorefrontActor, lock: boolean) {
  const primary = await getPrimarySite(tx, actor.tenantId)
  if (!primary) return null
  const authority = await authorize(tx, actor, primary.storeId)
  const scope: SiteScope = {
    tenantId: actor.tenantId,
    storeId: primary.storeId,
    siteId: primary.id,
  }
  if (lock && !(await lockSiteInTransaction(tx, scope))) return null
  const site = lock ? await getScopedSite(tx, scope) : primary
  return site ? { site, scope, authority } : null
}

function requireSite<T>(value: T | null): T {
  if (!value)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Set up the storefront first.",
    })
  return value
}

function inTx<T>(db: PrismaClient, run: (tx: Tx) => Promise<T>) {
  return db.$transaction(run, storefrontTransactionOptions())
}

function presentDraft(
  site: NonNullable<Awaited<ReturnType<typeof getScopedSite>>>,
) {
  return {
    siteId: site.id,
    storeId: site.storeId,
    status: site.status,
    activeReleaseId: site.activeReleaseId,
    draft: {
      revision: site.draftRevision,
      composition: site.draftComposition,
      updatedAt: site.draftUpdatedAt,
      updatedById: site.draftUpdatedById,
    },
  }
}

/** Current draft and publication pointer; null before initialization. */
export function readStorefrontDraft(db: PrismaClient, actor: StorefrontActor) {
  return inTx(db, (tx) => readStorefrontDraftInTransaction(tx, actor))
}

export async function readStorefrontDraftInTransaction(
  tx: Tx,
  actor: StorefrontActor,
) {
  const opened = await openPrimarySite(tx, actor, false)
  return opened ? presentDraft(opened.site) : null
}

/** Authenticated draft session only; same runtime, no anonymous draft/tenant selector. */
export function previewStorefrontDraft(
  db: PrismaClient,
  actor: StorefrontActor,
  input: unknown,
) {
  const parsedInput = storefrontPreviewSchema.parse(input)
  const parsed = catalogQuerySchema.parse(parsedInput.query)
  return inTx(db, async (tx) => {
    const { site, scope, authority } = requireSite(
      await openPrimarySite(tx, actor, false),
    )
    const session = await verifyStorefrontPreviewSession(
      parsedInput.session,
      actor,
    )
    if (
      session.siteId !== site.id ||
      session.storeId !== site.storeId ||
      session.draftRevision !== site.draftRevision
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "The draft changed. Open a fresh preview.",
      })
    const store = await getScopedStorefrontDesignPreview(tx, scope, parsed)
    if (!store)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "The preview catalog is unavailable.",
      })
    const projected = publicStorefrontResources(store)
    // Load once from existing scoped queries, then independently filter each design.
    const renderPreview = (composition: unknown) =>
      loadStorefront(
        {
          registry: templateRegistry,
          resolveSite: async () => ({
            scope: {
              ...scope,
              releaseId: `draft-${site.draftRevision}`,
              mode: "preview" as const,
              currencyCode: store.currencyCode,
              locale: "en-NG",
            },
            composition,
          }),
          loadResources: async () => {
            // A renderer cannot accidentally expose live customer destinations in a draft.
            return {
              ...projected,
              resources: {
                ...projected.resources,
                contact: { chatToken: null, whatsAppPhone: null },
              },
            }
          },
        },
        parsed,
      )
    const load = await renderPreview(site.draftComposition)
    if (load.status !== "ready")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This draft cannot be previewed yet.",
      })
    const designSnapshots: StorefrontClientSnapshot[] = []
    for (const input of parsedInput.designs ?? []) {
      const checked = checkComposition(input, "new-use")
      if (!checked.ok)
        throw new TRPCError({ code: "BAD_REQUEST", message: checked.issue })
      const candidate = await renderPreview(checked.composition)
      if (candidate.status !== "ready")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A proposed design can't be previewed.",
        })
      designSnapshots.push(candidate.snapshot)
    }
    return {
      snapshot: load.snapshot,
      designSnapshots,
      expiresAt: Number(session.exp) * 1000,
      draftRevision: site.draftRevision,
      store: { id: scope.storeId, name: authority.store.name },
      cacheControl: load.cacheControl,
      robots: load.robots,
    }
  })
}

export function startStorefrontPreview(
  db: PrismaClient,
  actor: StorefrontActor,
) {
  return inTx(db, async (tx) => {
    const { site } = requireSite(await openPrimarySite(tx, actor, false))
    return createStorefrontPreviewSession(actor, {
      siteId: site.id,
      storeId: site.storeId,
      draftRevision: site.draftRevision,
    })
  })
}

/** Read-only generation input. No provider call or authority-bearing IDs in the brief. */
export function readStorefrontDesignBrief(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { desiredJourney: "browse" | "request" },
) {
  const input = storefrontDesignBriefRequestSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, false))
    const checked = checkComposition(site.draftComposition)
    if (!checked.ok)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: checked.issue,
      })
    const store = await getScopedStorefrontDesignPreview(tx, scope, {})
    if (!store)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "The public catalog is unavailable for a design brief.",
      })
    const { resources, capabilities } = publicStorefrontResources(store)
    return createStorefrontDesignBrief({
      resources,
      capabilities,
      composition: checked.composition,
      baseRevision: site.draftRevision,
      desiredJourney: input.desiredJourney,
    })
  })
}

/**
 * Create at most one primary Site per Tenant on the explicitly selected Store with
 * the template's validated default draft. Never publishes and never rebinds a
 * primary Site that already belongs to another Store.
 */
export function initializeStorefront(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { storeId: string; templateKey?: string; templateVersion?: string },
) {
  const input = storefrontInitializeSchema.parse(request)
  return inTx(db, async (tx) => {
    await lockTenantSitesInTransaction(tx, actor.tenantId)
    const authority = await authorize(tx, actor, input.storeId)
    const existing = await getPrimarySite(tx, actor.tenantId)
    if (existing) {
      if (existing.storeId !== input.storeId)
        return {
          ok: false as const,
          reason: "primary-site-on-other-store" as const,
          storeId: existing.storeId,
        }
      return { ok: true as const, created: false, ...presentDraft(existing) }
    }
    const manifest = usableTemplate(
      input.templateKey ?? DEFAULT_TEMPLATE_KEY,
      input.templateVersion,
      "new-use",
    )
    if (!manifest)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This storefront design isn't available.",
      })
    const site = await createPrimarySiteInTransaction(tx, {
      tenantId: actor.tenantId,
      storeId: authority.store.id,
      name: authority.store.name,
      composition: defaultComposition(manifest) as Prisma.InputJsonValue,
      actorId: actor.actorUserId,
    })
    await recordStorefrontActivity(
      tx,
      storefrontActivity(
        actor,
        { tenantId: actor.tenantId, storeId: site.storeId, siteId: site.id },
        `draft:${site.draftRevision}`,
        {
          action: "initialized",
          draftRevision: site.draftRevision,
          releaseId: null,
          baseReleaseId: null,
        },
        { composition: site.draftComposition },
      ),
    )
    return { ok: true as const, created: true, ...presentDraft(site) }
  })
}

/** Exact-revision draft edit; a stale editor receives the current draft to recover. */
export function saveStorefrontDraft(
  db: PrismaClient,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    expectedRevision: number
    composition: unknown
  },
) {
  const input = storefrontSaveDraftSchema.parse(request)
  const checked = checkComposition(input.composition)
  if (!checked.ok)
    throw new TRPCError({ code: "BAD_REQUEST", message: checked.issue })
  return inTx(db, async (tx) => {
    const { scope, site } = requireSite(await openPrimarySite(tx, actor, false))
    assertExpectedSite(scope.siteId, input.expectedSiteId)
    const previous = (
      site.draftComposition as {
        template?: { key?: unknown; version?: unknown }
      } | null
    )?.template
    if (
      (previous?.key !== checked.manifest.key ||
        previous?.version !== checked.manifest.version) &&
      !usableTemplate(checked.manifest.key, checked.manifest.version, "new-use")
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "This storefront version cannot be selected for a new draft. Choose an active version.",
      })
    const result = requireSite(
      await saveSiteDraftInTransaction(tx, {
        ...scope,
        expectedRevision: input.expectedRevision,
        composition: checked.composition as Prisma.InputJsonValue,
        actorId: actor.actorUserId,
      }),
    )
    if (!result.ok) return result
    await recordStorefrontActivity(
      tx,
      storefrontActivity(
        actor,
        scope,
        `draft:${result.site.draftRevision}`,
        {
          action: "saved",
          draftRevision: result.site.draftRevision,
          releaseId: result.site.activeReleaseId,
          baseReleaseId: result.site.activeReleaseId,
        },
        {
          expectedRevision: input.expectedRevision,
          composition: checked.composition,
        },
      ),
    )
    return { ok: true as const, ...presentDraft(result.site) }
  })
}

/** Separate facts: draft/template validity, assets, Store/plan and hostnames. */
export function readStorefrontReadiness(
  db: PrismaClient,
  actor: StorefrontActor,
) {
  return inTx(db, async (tx) => {
    const { site, authority } = requireSite(
      await openPrimarySite(tx, actor, false),
    )
    const { checked, blockers } = publishBlockers(site.draftComposition)
    const active = site.activeReleaseId
      ? await findSiteReleaseInTransaction(
          tx,
          { tenantId: actor.tenantId, storeId: site.storeId, siteId: site.id },
          { id: site.activeReleaseId },
        )
      : null
    const hostnames = await listTenantStorefrontHostnames(tx, actor.tenantId)
    const check = await tx.businessActivityOutbox.findFirst({
      where: {
        tenantId: actor.tenantId,
        consumer: "storefront_release",
        event: {
          sourceKind: "storefront_site",
          sourceId: site.id,
          storeId: site.storeId,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        status: true,
        failureCode: true,
        completedAt: true,
        event: { select: { payload: true } },
      },
    })
    return {
      draftRevision: site.draftRevision,
      activeReleaseId: site.activeReleaseId,
      canPublish: blockers.length === 0,
      blockers,
      template: checked.ok
        ? {
            key: checked.manifest.key,
            version: checked.manifest.version,
            runtimeVersion: checked.manifest.runtimeVersion,
          }
        : null,
      store: {
        id: authority.store.id,
        name: authority.store.name,
        active: true,
      },
      plan: planFacts(authority),
      // Domain status is separate from the storefront; neither implies live traffic.
      hostnames: {
        tenantSlug: authority.tenant.slug,
        customDomains: hostnames.map((row) => ({
          hostname: row.hostname,
          status: row.status,
          linkedToSite: row.siteId === site.id,
        })),
      },
      publication: {
        status: site.status,
        activeRelease: active
          ? {
              id: active.id,
              draftRevision: active.draftRevision,
              templateKey: active.templateKey,
              templateVersion: active.templateVersion,
              publishedAt: active.createdAt,
            }
          : null,
      },
      sourceCheck: check
        ? {
            releaseId:
              check.event.payload &&
              typeof check.event.payload === "object" &&
              !Array.isArray(check.event.payload) &&
              typeof check.event.payload.releaseId === "string"
                ? check.event.payload.releaseId
                : null,
            status: check.status,
            result: check.failureCode,
            checkedAt: check.completedAt,
          }
        : null,
      // A successful source check does not establish deployed host/TLS delivery.
      delivery: { status: "unverified" as const },
    }
  })
}

function planFacts(authority: StorefrontAuthority) {
  return {
    id: authority.plan.id,
    /** null means every eligible item is listed; Free lists the first three. */
    storefrontItems: authority.plan.storefrontItems,
    customerMessages: authority.plan.customerMessages,
    privateQaOnly: authority.tenant.dataClassification === "QA",
  }
}

export function listStorefrontHistory(
  db: PrismaClient,
  actor: StorefrontActor,
  take: number,
) {
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, false))
    const releases = await listSiteReleases(tx, scope, take)
    return {
      activeReleaseId: site.activeReleaseId,
      releases: releases.map((release) => ({
        ...release,
        active: release.id === site.activeReleaseId,
      })),
    }
  })
}

/** Thrown to abort the transaction so a created release never survives a lost fence. */
function lostFence(): never {
  throw new TRPCError({
    code: "CONFLICT",
    message: "The storefront changed while publishing. Reload and try again.",
  })
}

function assertExpectedSite(siteId: string, expectedSiteId: string) {
  if (siteId !== expectedSiteId)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The storefront workspace changed. Reload before saving or publishing.",
    })
}

/**
 * Freeze the exact expected draft revision and activate it with explicit public
 * browsing consent. Authority, scope and the Site row lock come before any replay;
 * a reused key for another base, revision or actor is a conflict.
 */
export function publishStorefront(
  db: PrismaClient,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    expectedDraftRevision: number
    expectedActiveReleaseId: string | null
    idempotencyKey: string
    publicBrowsingConsent: true
  },
) {
  const input = storefrontPublishSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, true))
    assertExpectedSite(site.id, input.expectedSiteId)
    const intent = storefrontActivity(
      actor,
      scope,
      `release:${input.idempotencyKey}`,
      {
        action: "published",
        draftRevision: input.expectedDraftRevision,
        releaseId: null,
        baseReleaseId: input.expectedActiveReleaseId,
      },
      { action: "publish", ...input },
    )
    const replay = await findStorefrontReplay(tx, intent)
    if (replay) {
      if (!replay.ok || !replay.releaseId)
        return siteConflict("idempotency-conflict", site)
      requireCompatibleRelease(
        requireSite(
          await findSiteReleaseInTransaction(tx, scope, {
            id: replay.releaseId,
          }),
        ),
      )
      return {
        ok: true as const,
        replayed: true,
        releaseId: replay.releaseId,
        activeReleaseId: site.activeReleaseId,
      }
    }
    const existing = await findSiteReleaseInTransaction(tx, scope, {
      idempotencyKey: input.idempotencyKey,
    })
    if (existing) {
      requireCompatibleRelease(existing)
      const same =
        existing.baseReleaseId === input.expectedActiveReleaseId &&
        existing.createdById === actor.actorUserId &&
        existing.draftRevision === input.expectedDraftRevision
      return same
        ? {
            ok: true as const,
            replayed: true,
            releaseId: existing.id,
            activeReleaseId: site.activeReleaseId,
          }
        : siteConflict("idempotency-conflict", site)
    }
    if (site.draftRevision !== input.expectedDraftRevision)
      return siteConflict("draft-conflict", site)
    if (site.activeReleaseId !== input.expectedActiveReleaseId)
      return siteConflict("active-release-conflict", site)
    const { checked, blockers } = publishBlockers(site.draftComposition)
    if (!checked.ok || blockers.length)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: blockers[0] })
    const activated = await activateSiteReleaseInTransaction(tx, {
      ...scope,
      composition: checked.composition as Prisma.InputJsonValue,
      draftRevision: site.draftRevision,
      templateKey: checked.manifest.key,
      templateVersion: checked.manifest.version,
      runtimeVersion: checked.manifest.runtimeVersion,
      idempotencyKey: input.idempotencyKey,
      expectedActiveReleaseId: input.expectedActiveReleaseId,
      expectedDraftRevision: input.expectedDraftRevision,
      actorId: actor.actorUserId,
    })
    if (!activated) lostFence()
    await recordStorefrontActivity(
      tx,
      {
        ...intent,
        payload: { ...intent.payload, releaseId: activated.release.id },
      },
      true,
    )
    return {
      ok: true as const,
      replayed: false,
      releaseId: activated.release.id,
      activeReleaseId: activated.release.id,
    }
  })
}

/**
 * Reactivate a retained immutable release by moving the pointer only, recording
 * this actor separately in the audit. Rechecks template/runtime, assets and
 * eligibility; never changes the draft, Catalog, prices, stock or permissions.
 */
export function rollbackStorefront(
  db: PrismaClient,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    releaseId: string
    expectedActiveReleaseId: string | null
    idempotencyKey: string
  },
) {
  const input = storefrontRollbackSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, true))
    assertExpectedSite(site.id, input.expectedSiteId)
    const source = await findSiteReleaseInTransaction(tx, scope, {
      id: input.releaseId,
    })
    if (!source)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That storefront version isn't available.",
      })
    requireCompatibleRelease(source)
    const intent = storefrontActivity(
      actor,
      scope,
      `release:${input.idempotencyKey}`,
      {
        action: "rolled_back",
        draftRevision: source.draftRevision,
        releaseId: source.id,
        baseReleaseId: input.expectedActiveReleaseId,
      },
      { action: "rollback", ...input },
    )
    const replay = await findStorefrontReplay(tx, intent)
    if (replay)
      return replay.ok
        ? {
            ok: true as const,
            replayed: true,
            releaseId: replay.releaseId,
            activeReleaseId: site.activeReleaseId,
          }
        : siteConflict("idempotency-conflict", site)
    // A publish made with this key must never be mistaken for a rollback.
    if (
      await findSiteReleaseInTransaction(tx, scope, {
        idempotencyKey: input.idempotencyKey,
      })
    )
      return siteConflict("idempotency-conflict", site)
    if (site.activeReleaseId !== input.expectedActiveReleaseId)
      return siteConflict("active-release-conflict", site)
    const restored = await restoreSiteReleaseInTransaction(tx, {
      ...scope,
      releaseId: source.id,
      expectedActiveReleaseId: input.expectedActiveReleaseId,
    })
    if (!restored) lostFence()
    await recordStorefrontActivity(tx, intent, true)
    return {
      ok: true as const,
      replayed: false,
      releaseId: source.id,
      activeReleaseId: source.id,
    }
  })
}

function presentGeneration(
  run: Awaited<ReturnType<typeof listSiteDesignRunsInTransaction>>[number] & {
    output?: Prisma.JsonValue
  },
) {
  return {
    id: run.id,
    status: run.status,
    baseRevision: run.baseDraftRevision,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    errorCode: run.errorCode,
    needsReconciliation:
      !!run.providerStartedAt &&
      !run.usageSettledAt &&
      (run.status === "FAILED" ||
        run.status === "CANCELLED" ||
        run.status === "READY"),
    output:
      run.status === "READY" &&
      run.output &&
      run.outputHash === siteContentHash(run.output)
        ? run.output
        : null,
    acceptedDirectionId: run.acceptedDirectionId,
    acceptedDraftRevision: run.acceptedDraftRevision,
  }
}

/** Explicit intent only. Fresh Site/actor/plan, frozen public brief, atomic daily reservation and durable queue row. */
export function requestStorefrontGeneration(
  db: PrismaClient,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    expectedDraftRevision: number
    clientRequestId: string
    desiredJourney: "browse" | "request"
    refinement?: string
  },
) {
  return inTx(db, (tx) =>
    requestStorefrontGenerationInTransaction(tx, actor, request),
  )
}

export async function requestStorefrontGenerationInTransaction(
  tx: Tx,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    expectedDraftRevision: number
    clientRequestId: string
    desiredJourney: "browse" | "request"
    refinement?: string
  },
) {
  const input = storefrontGenerateSchema.parse(request)

  const { site, scope, authority } = requireSite(
    await openPrimarySite(tx, actor, true),
  )
  assertExpectedSite(site.id, input.expectedSiteId)
  const requestHash = siteContentHash({ actor: actor.actorUserId, ...input })
  const existing = await findSiteDesignRequestInTransaction(
    tx,
    { ...scope, actorUserId: actor.actorUserId },
    input.clientRequestId,
  )
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new TRPCError({
        code: "CONFLICT",
        message: "That design request was already used for different inputs.",
      })
    return { replayed: true, run: presentGeneration(existing) }
  }
  if (authority.tenant.dataClassification !== "LIVE")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Design generation is unavailable for this business.",
    })
  if (site.draftRevision !== input.expectedDraftRevision)
    throw new TRPCError({
      code: "CONFLICT",
      message: "The draft changed. Reload before generating designs.",
    })
  const setting = await tx.systemConfiguration.findUnique({
    where: { key: STOREFRONT_GENERATION_CONFIGURATION_KEY },
    select: { value: true },
  })
  const configuration = readStorefrontGenerationConfiguration(setting?.value)
  if (!configuration || !isStorefrontDesignProviderConfigured(configuration))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Design generation isn't available yet.",
    })
  const checked = checkComposition(site.draftComposition)
  if (!checked.ok)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: checked.issue,
    })
  const store = await getScopedStorefrontDesignPreview(tx, scope, {})
  if (!store)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The catalog is unavailable for this design request.",
    })
  const publicLoad = publicStorefrontResources(store)
  const brief = createStorefrontDesignBrief({
    ...publicLoad,
    composition: checked.composition,
    baseRevision: site.draftRevision,
    desiredJourney: input.desiredJourney,
    refinement: input.refinement,
  })
  const manifests = listSelectableTemplates().map((entry) => entry.manifest)
  if (
    new TextEncoder().encode(storefrontDesignPrompt(brief, manifests)).length >
    configuration.maxInputBytes
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This catalog is too large for the current design budget.",
    })
  const result = await createSiteDesignRunInTransaction(
    tx,
    { ...scope, actorUserId: actor.actorUserId },
    {
      clientRequestId: input.clientRequestId,
      requestHash,
      baseDraftRevision: site.draftRevision,
      brief,
      manifests,
      configuration,
      provider: configuration.provider,
      model: configuration.model,
      promptVersion: STOREFRONT_DESIGN_PROMPT_VERSION,
      budget: configuration,
    },
  )
  if (!result.ok)
    throw new TRPCError({
      code:
        result.reason === "budget-exhausted" ? "TOO_MANY_REQUESTS" : "CONFLICT",
      message:
        result.reason === "budget-exhausted"
          ? "The daily design budget is used. You can still edit your draft manually."
          : "That design request already exists with different inputs.",
    })
  if (!result.replayed)
    await recordStorefrontActivity(
      tx,
      storefrontActivity(
        actor,
        scope,
        `generation:${result.run.id}`,
        {
          action: "generation_requested",
          draftRevision: site.draftRevision,
          releaseId: null,
          baseReleaseId: site.activeReleaseId,
        },
        input,
      ),
    )
  return { replayed: result.replayed, run: presentGeneration(result.run) }
}

export function readStorefrontGenerations(
  db: PrismaClient,
  actor: StorefrontActor,
) {
  return inTx(db, async (tx) => {
    const { scope, authority } = requireSite(
      await openPrimarySite(tx, actor, false),
    )
    const setting = await tx.systemConfiguration.findUnique({
      where: { key: STOREFRONT_GENERATION_CONFIGURATION_KEY },
      select: { value: true },
    })
    const configuration = readStorefrontGenerationConfiguration(setting?.value)
    return {
      available:
        authority.tenant.dataClassification === "LIVE" &&
        !!configuration &&
        isStorefrontDesignProviderConfigured(configuration),
      runs: (await listSiteDesignRunsInTransaction(tx, scope)).map(
        presentGeneration,
      ),
    }
  })
}

export function cancelStorefrontGeneration(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { expectedSiteId: string; runId: string },
) {
  const input = storefrontGenerationIdSchema.parse(request)
  return inTx(db, async (tx) => {
    const { scope, site } = requireSite(await openPrimarySite(tx, actor, true))
    assertExpectedSite(site.id, input.expectedSiteId)
    const prior = await findSiteDesignRunInTransaction(tx, scope, input.runId)
    if (!prior)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That design run is unavailable.",
      })
    const run = await cancelSiteDesignRunInTransaction(tx, scope, input.runId)
    if (!run)
      throw new TRPCError({
        code: "CONFLICT",
        message: "An accepted design run can't be cancelled.",
      })
    if (prior.status !== "CANCELLED")
      await recordStorefrontActivity(
        tx,
        storefrontActivity(
          actor,
          scope,
          `generation-cancel:${run.id}`,
          {
            action: "generation_cancelled",
            draftRevision: site.draftRevision,
            releaseId: null,
            baseReleaseId: site.activeReleaseId,
          },
          input,
        ),
      )
    return presentGeneration(run)
  })
}

export function readStorefrontGeneration(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { expectedSiteId: string; runId: string },
) {
  const input = storefrontGenerationIdSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, false))
    assertExpectedSite(site.id, input.expectedSiteId)
    const run = await findSiteDesignRunInTransaction(tx, scope, input.runId)
    if (!run)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That design run is unavailable.",
      })
    return presentGeneration(run)
  })
}

/** An exact, once-only ordinary draft save. No publication, provider call or generated code execution. */
export function acceptStorefrontDesign(
  db: PrismaClient,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    runId: string
    expectedRevision: number
    directionId: "01" | "02" | "03"
  },
) {
  return inTx(db, (tx) =>
    acceptStorefrontDesignInTransaction(tx, actor, request),
  )
}

export async function acceptStorefrontDesignInTransaction(
  tx: Tx,
  actor: StorefrontActor,
  request: {
    expectedSiteId: string
    runId: string
    expectedRevision: number
    directionId: "01" | "02" | "03"
  },
) {
  const input = storefrontAcceptDesignSchema.parse(request)

  const { site, scope } = requireSite(await openPrimarySite(tx, actor, true))
  assertExpectedSite(site.id, input.expectedSiteId)
  const run = await lockSiteDesignRunInTransaction(tx, scope, input.runId)
  if (!run)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That design run is unavailable.",
    })
  if (run.baseDraftRevision !== input.expectedRevision)
    return siteConflict("draft-conflict", site)
  if (run.acceptedAt) {
    if (
      run.acceptedDirectionId !== input.directionId ||
      run.acceptedById !== actor.actorUserId
    )
      return siteConflict("idempotency-conflict", site)
    return {
      ok: true as const,
      replayed: true,
      acceptedRevision: run.acceptedDraftRevision,
      ...presentDraft(site),
    }
  }
  if (site.draftRevision !== input.expectedRevision)
    return siteConflict("draft-conflict", site)
  if (
    run.status !== "READY" ||
    !run.output ||
    run.outputHash !== siteContentHash(run.output)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "That design run has no valid proposals to accept.",
    })
  const checked = checkComposition(site.draftComposition)
  if (!checked.ok)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: checked.issue,
    })
  const store = await getScopedStorefrontDesignPreview(tx, scope, {})
  if (!store)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The public catalog is unavailable. Try again before accepting a design.",
    })
  // Recheck source facts and assets now: generation may have completed before catalog edits.
  let composition: StorefrontComposition
  try {
    const brief = createStorefrontDesignBrief({
      ...publicStorefrontResources(store),
      composition: checked.composition,
      baseRevision: site.draftRevision,
      desiredJourney: storefrontDesignBriefSchema.parse(run.brief)
        .desiredJourney,
    })
    const manifests = listSelectableTemplates().map((entry) => entry.manifest)
    const output = validateStorefrontDesignOutput(run.output, brief, manifests)
    const candidate = output.directions.find(
      (entry) => entry.id === input.directionId,
    )
    if (!candidate) throw new Error("Missing direction")
    const design = checkComposition(candidate.composition, "new-use")
    if (!design.ok) throw new Error(design.issue)
    composition = design.composition
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "These proposals no longer match the available design versions, assets or public facts. Generate fresh designs.",
    })
  }
  const result = requireSite(
    await saveSiteDraftInTransaction(tx, {
      ...scope,
      expectedRevision: input.expectedRevision,
      composition: composition as Prisma.InputJsonValue,
      actorId: actor.actorUserId,
    }),
  )
  if (!result.ok) return result
  await markSiteDesignAcceptedInTransaction(
    tx,
    { ...scope, actorUserId: actor.actorUserId },
    {
      runId: run.id,
      directionId: input.directionId,
      draftRevision: result.site.draftRevision,
    },
  )
  await recordStorefrontActivity(
    tx,
    storefrontActivity(
      actor,
      scope,
      `design-accept:${run.id}`,
      {
        action: "design_accepted",
        draftRevision: result.site.draftRevision,
        releaseId: site.activeReleaseId,
        baseReleaseId: site.activeReleaseId,
      },
      { ...input, outputHash: run.outputHash },
    ),
  )
  return {
    ok: true as const,
    replayed: false,
    acceptedRevision: result.site.draftRevision,
    ...presentDraft(result.site),
  }
}
