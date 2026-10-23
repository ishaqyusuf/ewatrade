import {
  type EwaTradeRole,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { TRPCError } from "@trpc/server"

import {
  storefrontAcceptDesignSchema,
  storefrontGenerateSchema,
  storefrontGenerationIdSchema,
  storefrontHistorySchema,
  storefrontInitializeSchema,
  storefrontPreviewSchema,
  storefrontPublishSchema,
  storefrontRollbackSchema,
  storefrontSaveDraftSchema,
} from "../../schemas/storefront"
import {
  acceptStorefrontDesign,
  cancelStorefrontGeneration,
  initializeStorefront,
  listStorefrontHistory,
  previewStorefrontDraft,
  publishStorefront,
  readStorefrontDraft,
  readStorefrontGeneration,
  readStorefrontGenerations,
  readStorefrontReadiness,
  requestStorefrontGeneration,
  rollbackStorefront,
  saveStorefrontDraft,
  startStorefrontPreview,
} from "../../storefront/site-commands"
import { createTRPCRouter, protectedProcedure } from "../init"

/**
 * Thin storefront router. This early role check only fails fast; each command
 * rechecks fresh Owner/Admin membership, Store and plan inside its transaction.
 * Scoped staff are denied by the fail-closed staff procedure policy.
 */
const storefrontProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = normalizeRole(
    ctx.tenantContext.membership.role,
  ) as EwaTradeRole | null
  if (!role || !canManageTenant(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only business Owners and Admins can manage the storefront.",
    })
  return next({
    ctx: {
      actor: {
        tenantId: ctx.tenantContext.tenant.id,
        actorUserId: ctx.session.user.id,
      },
    },
  })
})

export const storefrontRouter = createTRPCRouter({
  acceptDesign: storefrontProcedure
    .input(storefrontAcceptDesignSchema)
    .mutation(({ ctx, input }) =>
      acceptStorefrontDesign(ctx.db, ctx.actor, input),
    ),
  generation: storefrontProcedure
    .input(storefrontGenerationIdSchema)
    .query(({ ctx, input }) =>
      readStorefrontGeneration(ctx.db, ctx.actor, input),
    ),
  generations: storefrontProcedure.query(({ ctx }) =>
    readStorefrontGenerations(ctx.db, ctx.actor),
  ),
  generate: storefrontProcedure
    .input(storefrontGenerateSchema)
    .mutation(({ ctx, input }) =>
      requestStorefrontGeneration(ctx.db, ctx.actor, input),
    ),
  cancelGeneration: storefrontProcedure
    .input(storefrontGenerationIdSchema)
    .mutation(({ ctx, input }) =>
      cancelStorefrontGeneration(ctx.db, ctx.actor, input),
    ),
  draft: storefrontProcedure.query(({ ctx }) =>
    readStorefrontDraft(ctx.db, ctx.actor),
  ),
  preview: storefrontProcedure
    .input(storefrontPreviewSchema)
    .query(({ ctx, input }) =>
      previewStorefrontDraft(ctx.db, ctx.actor, input),
    ),
  previewSession: storefrontProcedure.mutation(({ ctx }) =>
    startStorefrontPreview(ctx.db, ctx.actor),
  ),
  readiness: storefrontProcedure.query(({ ctx }) =>
    readStorefrontReadiness(ctx.db, ctx.actor),
  ),
  history: storefrontProcedure
    .input(storefrontHistorySchema)
    .query(({ ctx, input }) =>
      listStorefrontHistory(ctx.db, ctx.actor, input.take),
    ),
  initialize: storefrontProcedure
    .input(storefrontInitializeSchema)
    .mutation(({ ctx, input }) =>
      initializeStorefront(ctx.db, ctx.actor, input),
    ),
  saveDraft: storefrontProcedure
    .input(storefrontSaveDraftSchema)
    .mutation(({ ctx, input }) =>
      saveStorefrontDraft(ctx.db, ctx.actor, input),
    ),
  publish: storefrontProcedure
    .input(storefrontPublishSchema)
    .mutation(({ ctx, input }) => publishStorefront(ctx.db, ctx.actor, input)),
  rollback: storefrontProcedure
    .input(storefrontRollbackSchema)
    .mutation(({ ctx, input }) => rollbackStorefront(ctx.db, ctx.actor, input)),
})
