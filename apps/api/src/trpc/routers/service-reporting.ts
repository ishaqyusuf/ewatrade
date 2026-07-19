import {
  exportServiceOperationsAudit,
  getServiceOperationsReport,
} from "@ewatrade/db/queries"

import {
  serviceAuditExportSchema,
  serviceReportSchema,
} from "../../schemas/services"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceManager } from "./service-permissions"

export const serviceReportingRouter = createTRPCRouter({
  auditExport: protectedProcedure
    .input(serviceAuditExportSchema)
    .query(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return exportServiceOperationsAudit(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  summary: protectedProcedure.input(serviceReportSchema).query(({ ctx, input }) => {
    assertServiceManager(ctx.tenantContext.membership.role)
    return getServiceOperationsReport(ctx.db, {
      ...input,
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),
})
