import { storefrontContentPrompt } from "@ewatrade/ai/storefront-content"
import {
  STOREFRONT_GENERATION_CONFIGURATION_KEY,
  isStorefrontDesignProviderConfigured,
  readStorefrontGenerationConfiguration,
} from "@ewatrade/ai/storefront-design"
import type { PrismaClient } from "@ewatrade/db"
import {
  cancelSiteDesignRunInTransaction,
  createSiteDesignRunInTransaction,
  findSiteDesignRequestInTransaction,
  findSiteDesignRunInTransaction,
  getScopedStorefrontDesignPreview,
  listSiteDesignRunsInTransaction,
  recordStorefrontActivity,
  siteContentHash,
  storefrontActivity,
} from "@ewatrade/db/queries"
import {
  STOREFRONT_CONTENT_PROMPT_VERSION,
  type StorefrontContentContext,
  storefrontContentBriefSchema,
  storefrontContentContextSchema,
  validateStorefrontContentOutput,
} from "@ewatrade/storefront-contracts/content"
import {
  createStorefrontContentBrief,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { TRPCError } from "@trpc/server"
import { requireAdultLiveAiForRequest } from "../assistant/live-ai-access"
import {
  storefrontContentGenerateSchema,
  storefrontContentIdSchema,
  storefrontContentSiteSchema,
} from "../schemas/storefront-content"
import {
  type StorefrontActor,
  assertExpectedSite,
  checkComposition,
  inTx,
  openPrimarySite,
  presentGeneration,
  requireSite,
} from "./site-command-context"

type Tx = Parameters<Parameters<typeof inTx>[1]>[0]
const isContent = (run: { promptVersion: string }) =>
  run.promptVersion === STOREFRONT_CONTENT_PROMPT_VERSION

async function publicContext(
  tx: Tx,
  scope: { tenantId: string; storeId: string },
): Promise<StorefrontContentContext> {
  const business = await getScopedStorefrontDesignPreview(tx, scope, {})
  if (!business)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The public business context is unavailable.",
    })
  const offerings: string[] = []
  for (const item of business.items) {
    if ([...offerings, item.name].join(", ").length > 2000) break
    offerings.push(item.name)
  }
  return storefrontContentContextSchema.parse({
    name: business.name,
    description: business.description?.slice(0, 2000) ?? "",
    location: "",
    offerings: offerings.join(", "),
  })
}
async function configuration(tx: Tx) {
  const setting = await tx.systemConfiguration.findUnique({
    where: { key: STOREFRONT_GENERATION_CONFIGURATION_KEY },
    select: { value: true },
  })
  return readStorefrontGenerationConfiguration(setting?.value)
}
function requireRevision(revision: number, expected: number) {
  if (revision !== expected)
    throw new TRPCError({
      code: "CONFLICT",
      message: "The saved draft changed. Reload before generating content.",
    })
}
function presentContent(
  run: Parameters<typeof presentGeneration>[0] & {
    promptVersion: string
    brief?: unknown
  },
) {
  if (!isContent(run))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That content draft is unavailable.",
    })
  const presented = presentGeneration(run)
  if (!presented.output || !run.brief) return { ...presented, output: null }
  try {
    const brief = storefrontContentBriefSchema.parse(run.brief)
    return {
      ...presented,
      output: validateStorefrontContentOutput(presented.output, brief),
    }
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "That content draft could not be validated. Generate a fresh draft.",
    })
  }
}

export function readStorefrontContentContext(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { expectedSiteId: string },
) {
  const input = storefrontContentSiteSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope, authority } = requireSite(
      await openPrimarySite(tx, actor, false),
    )
    assertExpectedSite(site.id, input.expectedSiteId)
    const [context, config] = await Promise.all([
      publicContext(tx, scope),
      configuration(tx),
    ])
    const available =
      authority.tenant.dataClassification === "LIVE" &&
      !!config &&
      isStorefrontDesignProviderConfigured(config)
    return {
      context,
      revision: site.draftRevision,
      available,
      unavailableReason: available
        ? null
        : authority.tenant.dataClassification !== "LIVE"
          ? "Live AI content generation is unavailable for QA data. You can still edit your storefront text by hand."
          : "AI content generation isn't configured yet. You can still edit your storefront text by hand.",
      runs: (await listSiteDesignRunsInTransaction(tx, scope, "content")).map(
        (run) => ({ ...presentGeneration(run), output: null }),
      ),
    }
  })
}

/** Explicit cost-bearing intent; uses the same current actor, locks and budget as design generation. */
export function requestStorefrontContent(
  db: PrismaClient,
  actor: StorefrontActor,
  request: unknown,
) {
  const input = storefrontContentGenerateSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope, authority } = requireSite(
      await openPrimarySite(tx, actor, true),
    )
    assertExpectedSite(site.id, input.expectedSiteId)
    const requestHash = siteContentHash({
      kind: "storefront-content",
      actor: actor.actorUserId,
      ...input,
    })
    const existing = await findSiteDesignRequestInTransaction(
      tx,
      { ...scope, actorUserId: actor.actorUserId },
      input.clientRequestId,
    )
    if (existing) {
      if (!isContent(existing) || existing.requestHash !== requestHash)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "That content request was already used for different inputs.",
        })
      return { replayed: true, run: presentContent(existing) }
    }
    requireRevision(site.draftRevision, input.expectedDraftRevision)
    if (authority.tenant.dataClassification !== "LIVE")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Live AI content generation is unavailable for QA data.",
      })
    await requireAdultLiveAiForRequest(tx, actor.actorUserId)
    const config = await configuration(tx)
    if (!config || !isStorefrontDesignProviderConfigured(config))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "AI content generation isn't configured yet.",
      })
    const checked = checkComposition(input.composition)
    if (!checked.ok)
      throw new TRPCError({ code: "BAD_REQUEST", message: checked.issue })
    const context = await publicContext(tx, scope)
    const supplied = input.context ?? context
    if (!supplied.description.trim() && !supplied.offerings.trim())
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Add a business description or products and services before generating content.",
      })
    let brief: ReturnType<typeof createStorefrontContentBrief>
    try {
      brief = createStorefrontContentBrief({
        composition: checked.composition,
        pageKey: input.pageKey,
        fieldIds: input.fieldIds,
        context: supplied,
        contextOrigin:
          JSON.stringify(supplied) === JSON.stringify(context)
            ? "business"
            : "merchant-draft",
        baseRevision: site.draftRevision,
        instructions: input.instructions,
        previous: input.previous,
      })
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "Choose valid content areas.",
      })
    }
    if (
      new TextEncoder().encode(storefrontContentPrompt(brief)).length >
      config.maxInputBytes
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Choose fewer content areas to fit the generation budget.",
      })
    const pins = [
      checked.composition.template,
      ...brief.fields.map((field) => field.profile),
    ]
    const manifests = templateRegistry
      .filter((entry) =>
        pins.some(
          (pin) =>
            entry.manifest.key === pin.key &&
            entry.manifest.version === pin.version,
        ),
      )
      .map((entry) => entry.manifest)
    const result = await createSiteDesignRunInTransaction(
      tx,
      { ...scope, actorUserId: actor.actorUserId },
      {
        clientRequestId: input.clientRequestId,
        requestHash,
        baseDraftRevision: site.draftRevision,
        brief,
        manifests,
        configuration: config,
        provider: config.provider,
        model: config.model,
        promptVersion: STOREFRONT_CONTENT_PROMPT_VERSION,
        budget: config,
      },
    )
    if (!result.ok)
      throw new TRPCError({
        code:
          result.reason === "budget-exhausted"
            ? "TOO_MANY_REQUESTS"
            : "CONFLICT",
        message:
          result.reason === "budget-exhausted"
            ? "The daily generation budget is used. You can still edit your draft manually."
            : "That content request already exists with different inputs.",
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
          { kind: "storefront-content", ...input },
        ),
      )
    return { replayed: result.replayed, run: presentContent(result.run) }
  })
}

export function readStorefrontContent(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { expectedSiteId: string; runId: string },
) {
  const input = storefrontContentIdSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, false))
    assertExpectedSite(site.id, input.expectedSiteId)
    const run = await findSiteDesignRunInTransaction(tx, scope, input.runId)
    if (!run || !isContent(run))
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That content draft is unavailable.",
      })
    return presentContent(run)
  })
}
export function cancelStorefrontContent(
  db: PrismaClient,
  actor: StorefrontActor,
  request: { expectedSiteId: string; runId: string },
) {
  const input = storefrontContentIdSchema.parse(request)
  return inTx(db, async (tx) => {
    const { site, scope } = requireSite(await openPrimarySite(tx, actor, true))
    assertExpectedSite(site.id, input.expectedSiteId)
    const prior = await findSiteDesignRunInTransaction(tx, scope, input.runId)
    if (!prior || !isContent(prior))
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That content draft is unavailable.",
      })
    const run = await cancelSiteDesignRunInTransaction(tx, scope, input.runId)
    if (!run)
      throw new TRPCError({
        code: "CONFLICT",
        message: "That content draft cannot be cancelled.",
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
          { kind: "storefront-content", ...input },
        ),
      )
    return presentContent(run)
  })
}
