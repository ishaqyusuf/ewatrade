import {
  createBatchServiceNotificationIntents,
  createServiceNotificationIntent,
  recordServiceDeliveryAttempt,
  recordServiceManualShare,
} from "@ewatrade/db/queries"
import {
  customerMessagingProviderStatus,
  enqueueServiceNotificationIntent,
} from "@ewatrade/jobs"

import {
  serviceBatchNotificationIntentSchema,
  serviceDeliveryAttemptSchema,
  serviceManualShareSchema,
  serviceNotificationIntentSchema,
} from "../../schemas/services"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceManager } from "./service-permissions"

export const serviceCommunicationsRouter = createTRPCRouter({
  createBatchIntents: protectedProcedure
    .input(serviceBatchNotificationIntentSchema)
    .mutation(async ({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const intents = await createBatchServiceNotificationIntents(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      await Promise.all(
        intents
          .filter((intent) => intent.status === "READY")
          .map((intent) => enqueueServiceNotificationIntent(intent.id)),
      )
      return intents
    }),

  createIntent: protectedProcedure
    .input(serviceNotificationIntentSchema)
    .mutation(async ({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const intent = await createServiceNotificationIntent(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (intent.status === "READY") {
        await enqueueServiceNotificationIntent(intent.id)
      }
      return intent
    }),

  providerStatus: protectedProcedure.query(({ ctx }) => {
    assertServiceManager(ctx.tenantContext.membership.role)
    return customerMessagingProviderStatus()
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
