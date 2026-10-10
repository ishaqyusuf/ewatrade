import {
  orderCancelAction,
  orderMetadataAction,
  orderReplaceAction,
} from "@ewatrade/assistant/general/contracts"
import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
import {
  CatalogError,
  amendCommercialOrderMetadata,
  cancelCommercialOrder,
  previewCommercialOrderCancellation,
  previewCommercialOrderMetadataAmendment,
  previewCommercialOrderReplacement,
  replaceCommercialOrder,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { protectedProcedure } from "../init"
export function assertCanAmendOrders(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageSalesOperations(normalized))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only authorized owners and managers can amend orders.",
    })
}
const procedure = protectedProcedure.use(({ ctx, next }) => {
  assertCanAmendOrders(ctx.tenantContext.membership.role)
  const storeId = ctx.tenantContext.activeStore?.id
  if (
    !storeId ||
    !ctx.tenantContext.stores.some((store) => store.id === storeId)
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Select an accessible Store first.",
    })
  return next({
    ctx: {
      ...ctx,
      amendmentScope: {
        tenantId: ctx.tenantContext.tenant.id,
        storeId,
        actorUserId: ctx.session.user.id,
      },
    },
  })
})
const command = {
  clientOperationId: z.string().trim().min(1).max(128),
  expectedReviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
}
async function domain<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CatalogError)
      throw new TRPCError({
        code:
          error.code === "ORDER_NOT_FOUND"
            ? "NOT_FOUND"
            : [
                  "REVISION_CONFLICT",
                  "IDEMPOTENCY_MISMATCH",
                  "INSUFFICIENT_STOCK",
                  "STALE_CONFIGURATION",
                ].includes(error.code)
              ? "CONFLICT"
              : "BAD_REQUEST",
        message: error.message,
        cause: error,
      })
    throw error
  }
}
export const orderAmendmentProcedures = {
  cancellationReview: procedure
    .input(orderCancelAction.omit({ action: true, reason: true }))
    .query(({ ctx, input }) =>
      domain(() =>
        previewCommercialOrderCancellation(ctx.db, {
          ...input,
          ...ctx.amendmentScope,
        }),
      ),
    ),
  metadataReview: procedure
    .input(orderMetadataAction.omit({ action: true, reason: true }))
    .query(({ ctx, input }) =>
      domain(() =>
        previewCommercialOrderMetadataAmendment(ctx.db, {
          ...input,
          ...ctx.amendmentScope,
        }),
      ),
    ),
  replacementReview: procedure
    .input(orderReplaceAction.omit({ action: true, reason: true }))
    .query(({ ctx, input }) =>
      domain(() =>
        previewCommercialOrderReplacement(ctx.db, {
          ...input,
          ...ctx.amendmentScope,
        }),
      ),
    ),
  cancel: procedure
    .input(orderCancelAction.omit({ action: true }).extend(command))
    .mutation(({ ctx, input }) =>
      domain(() =>
        cancelCommercialOrder(ctx.db, { ...input, ...ctx.amendmentScope }),
      ),
    ),
  amendMetadata: procedure
    .input(orderMetadataAction.omit({ action: true }).extend(command))
    .mutation(({ ctx, input }) =>
      domain(() =>
        amendCommercialOrderMetadata(ctx.db, {
          ...input,
          ...ctx.amendmentScope,
        }),
      ),
    ),
  replace: procedure
    .input(orderReplaceAction.omit({ action: true }).extend(command))
    .mutation(({ ctx, input }) =>
      domain(() =>
        replaceCommercialOrder(ctx.db, { ...input, ...ctx.amendmentScope }),
      ),
    ),
}
