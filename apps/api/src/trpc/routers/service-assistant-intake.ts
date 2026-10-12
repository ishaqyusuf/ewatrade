import { CatalogError } from "@ewatrade/db/queries"
import { readServiceIntakeReceiptInTransaction } from "@ewatrade/db/service-intake-receipt"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  generalServiceIntakeOptionsInput,
  readGeneralServiceIntakeOptions,
} from "../../assistant/general-service-intake-options"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceManager } from "./service-permissions"

/** Protected choices and owning receipts; signed GENERAL decisions own creation. */
export const serviceAssistantIntakeRouter = createTRPCRouter({
  options: protectedProcedure
    .input(generalServiceIntakeOptionsInput)
    .query(({ ctx, input }) => readGeneralServiceIntakeOptions(ctx, input)),
  receipt: protectedProcedure
    .input(z.object({ intakeId: z.string().trim().min(1).max(128) }).strict())
    .query(async ({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const storeId = ctx.tenantContext.activeStore?.id
      if (!storeId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Choose the current Store.",
        })
      try {
        return await ctx.db.$transaction(
          (tx) =>
            readServiceIntakeReceiptInTransaction(tx, {
              intakeId: input.intakeId,
              tenantId: ctx.tenantContext.tenant.id,
              storeId,
              actorUserId: ctx.session.user.id,
            }),
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        if (error instanceof ServiceIntakeReviewError)
          throw new TRPCError({
            code: error.code,
            message: error.message,
            cause: error,
          })
        if (error instanceof CatalogError)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
            cause: error,
          })
        throw error
      }
    }),
})
