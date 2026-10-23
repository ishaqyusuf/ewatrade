import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  findSiteDesignRunInTransaction,
  siteContentHash,
} from "@ewatrade/db/queries"
import {
  storefrontDesignChanges,
  storefrontDesignOutputSchema,
} from "@ewatrade/storefront-contracts/design"
import { validateComposition } from "@ewatrade/storefront-contracts/manifest"
import {
  getTemplateManifest,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { TRPCError } from "@trpc/server"
import {
  acceptStorefrontDesignInTransaction,
  readStorefrontDraftInTransaction,
  requestStorefrontGenerationInTransaction,
} from "../storefront/site-commands"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type Generate = Extract<GeneralAction, { action: "storefront_design_generate" }>
type Accept = Extract<GeneralAction, { action: "storefront_design_accept" }>
const defaults = {
  read: readStorefrontDraftInTransaction,
  generate: requestStorefrontGenerationInTransaction,
  accept: acceptStorefrontDesignInTransaction,
  run: findSiteDesignRunInTransaction,
}

/** GENERAL approval and canonical draft mutation share the same transaction. No provider call in the adapter. */
export function createStorefrontDesignAdapters(commands = defaults) {
  const target = async (
    ctx: GeneralTransactionContext,
    payload: Generate | Accept,
  ) => {
    const scope = requireGeneralScope(ctx)
    const actor = { tenantId: scope.tenantId, actorUserId: scope.userId }
    const site = await commands.read(ctx.db, actor)
    if (
      !site ||
      site.siteId !== payload.expectedSiteId ||
      site.storeId !== scope.storeId
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Open the Store that owns this storefront before reviewing designs.",
      })
    if (site.draft.revision !== payload.expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The storefront draft changed. Read and review its current revision.",
      })
    return { scope, actor, site }
  }
  const generationReview = async (
    ctx: GeneralTransactionContext,
    payload: Generate,
  ) => {
    const current = await target(ctx, payload)
    return {
      ...current,
      target: {
        id: current.site.siteId,
        revision: siteContentHash({
          revision: current.site.draft.revision,
          composition: current.site.draft.composition,
        }),
      },
      lines: [
        `Generate three design proposals from saved draft rev ${payload.expectedRevision}.`,
        `Focus: ${payload.desiredJourney === "request" ? "services and requests" : "browsing the collection"}.`,
        ...(payload.refinement
          ? [`Styling guidance: ${payload.refinement}`]
          : []),
        "Uses the business's separate daily design allowance. Availability and allowance are rechecked on confirmation.",
        "Only current public business facts and approved assets go into the design brief.",
        "No draft or live release changes. Review generated designs in Storefront studio before accepting one.",
      ],
    }
  }
  const acceptanceReview = async (
    ctx: GeneralTransactionContext,
    payload: Accept,
  ) => {
    const current = await target(ctx, payload)
    const run = await commands.run(
      ctx.db,
      {
        tenantId: current.scope.tenantId,
        storeId: current.scope.storeId,
        siteId: current.site.siteId,
      },
      payload.runId,
    )
    if (
      !run ||
      run.status !== "READY" ||
      run.acceptedAt ||
      run.baseDraftRevision !== payload.expectedRevision ||
      !run.output ||
      run.outputHash !== siteContentHash(run.output)
    )
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "That proposal is unavailable, already accepted or based on another draft. Review the current designs in Storefront studio.",
      })
    const output = storefrontDesignOutputSchema.parse(run.output)
    const candidate = output.directions.find(
      (entry) => entry.id === payload.directionId,
    )
    if (!candidate)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That direction is unavailable.",
      })
    const manifest = getTemplateManifest(candidate.composition)
    const before = validateComposition(
      current.site.draft.composition,
      getTemplateManifest(current.site.draft.composition),
    )
    const changes = storefrontDesignChanges(
      before,
      candidate.composition,
      templateRegistry.map((entry) => entry.manifest),
    )
    return {
      ...current,
      target: {
        id: run.id,
        revision: siteContentHash({
          base: payload.expectedRevision,
          draft: current.site.draft.composition,
          outputHash: run.outputHash,
          direction: payload.directionId,
        }),
      },
      lines: [
        `Use ${candidate.id} · ${manifest.name} ${manifest.version} as draft rev ${payload.expectedRevision + 1}.`,
        ...changes.map(
          (change) => `${change.label}: ${change.before} → ${change.after}`,
        ),
        "Current public facts, assets and design versions are rechecked on confirmation.",
        "This replaces only the saved draft. Live content stays unchanged; publication requires Storefront studio's separate review and consent.",
      ],
    }
  }
  const recover = async (
    ctx: GeneralTransactionContext,
    payload: Generate | Accept,
  ) => {
    const scope = requireGeneralScope(ctx)
    const site = await commands.read(ctx.db, {
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    })
    if (
      !site ||
      site.siteId !== payload.expectedSiteId ||
      site.storeId !== scope.storeId
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "That storefront is unavailable in the current Store.",
      })
  }
  const generate: GeneralActionAdapter<Generate> = {
    validate: async (ctx, payload) =>
      (await generationReview(ctx, payload)).target,
    review: async (ctx, payload) => {
      const review = await generationReview(ctx, payload)
      return { lines: review.lines, target: review.target }
    },
    stale: "The storefront draft changed. Read and review it again.",
    unavailable:
      "Storefront design generation is unavailable for the current Store.",
    async execute(ctx, payload, key) {
      const current = await target(ctx, payload)
      const result = await commands.generate(ctx.db, current.actor, {
        expectedSiteId: payload.expectedSiteId,
        expectedDraftRevision: payload.expectedRevision,
        desiredJourney: payload.desiredJourney,
        refinement: payload.refinement,
        clientRequestId: key,
      })
      return {
        kind: "storefront_design_run",
        recordId: result.run.id,
        title: "Design request recorded",
        detail: `Status: ${result.run.status}. Open Storefront studio to follow progress and compare proposals. Draft and live content are unchanged.`,
      }
    },
    authorizeRecovery: recover,
  }
  const accept: GeneralActionAdapter<Accept> = {
    validate: async (ctx, payload) =>
      (await acceptanceReview(ctx, payload)).target,
    review: async (ctx, payload) => {
      const review = await acceptanceReview(ctx, payload)
      return { lines: review.lines, target: review.target }
    },
    stale:
      "The draft or design proposals changed. Review the current designs again.",
    unavailable: "The selected storefront proposal is unavailable.",
    async execute(ctx, payload) {
      const current = await target(ctx, payload)
      const result = await commands.accept(ctx.db, current.actor, {
        expectedSiteId: payload.expectedSiteId,
        expectedRevision: payload.expectedRevision,
        runId: payload.runId,
        directionId: payload.directionId,
      })
      if (!result.ok)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The draft or proposal changed. Review the current designs again.",
        })
      return {
        kind: "storefront_design_draft",
        recordId: payload.runId,
        title: "Storefront draft saved",
        detail: `Direction ${payload.directionId} accepted as draft rev ${result.acceptedRevision}. Live content is unchanged; publish separately in Storefront studio.`,
      }
    },
    authorizeRecovery: recover,
  }
  return { generate, accept }
}
export const storefrontDesignAdapters = createStorefrontDesignAdapters()
