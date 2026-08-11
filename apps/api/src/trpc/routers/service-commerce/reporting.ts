import {
  getServiceCommerceReport,
  getServiceCommerceReportDrilldown,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  serviceCommerceReportDrilldownSchema,
  serviceCommerceReportSchema,
} from "../../../schemas/service-commerce-reporting"
import { createTRPCRouter, protectedProcedure } from "../../init"

function mapReportingError(error: unknown): never {
  if (error instanceof TRPCError) throw error
  if (error instanceof Error && error.message === "REPORT_ACCESS_FORBIDDEN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You do not have permission to view this Service Commerce report.",
    })
  }
  if (error instanceof Error && error.message === "REPORT_STORE_NOT_FOUND") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found." })
  }
  throw error
}

/** Aggregate-only reporting; the repository never returns customer content. */
export const serviceCommerceReportingRouter = createTRPCRouter({
  report: protectedProcedure
    .input(serviceCommerceReportSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getServiceCommerceReport(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapReportingError(error)
      }
    }),

  reportDrilldown: protectedProcedure
    .input(serviceCommerceReportDrilldownSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getServiceCommerceReportDrilldown(ctx.db, {
          actorUserId: ctx.session.user.id,
          category: input.category,
          end: input.end,
          start: input.start,
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapReportingError(error)
      }
    }),
})
