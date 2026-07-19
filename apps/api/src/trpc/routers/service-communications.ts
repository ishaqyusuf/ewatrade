import {
  createServiceNotificationIntent,
  recordServiceDeliveryAttempt,
  recordServiceManualShare,
} from "@ewatrade/db/queries"

import {
  serviceDeliveryAttemptSchema,
  serviceManualShareSchema,
  serviceNotificationIntentSchema,
} from "../../schemas/services"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceManager } from "./service-permissions"

export const serviceCommunicationsRouter = createTRPCRouter({
  createIntent: protectedProcedure
    .input(serviceNotificationIntentSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return createServiceNotificationIntent(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  recordDeliveryAttempt: protectedProcedure
    .input(serviceDeliveryAttemptSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return recordServiceDeliveryAttempt(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  recordManualShare: protectedProcedure
    .input(serviceManualShareSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return recordServiceManualShare(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
})
