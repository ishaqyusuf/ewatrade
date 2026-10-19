import {
  serviceManualMessageContextInput,
  serviceManualMessageOriginalInput,
} from "@ewatrade/assistant/general/service-message-read"
import {
  CatalogError,
  createBatchServiceNotificationIntents,
  createServiceNotificationIntent,
  listServiceJobMessagesInTransaction,
  readServiceManualMessageEditorContextInTransaction,
  readServiceManualMessageOriginalInTransaction,
  recordServiceDeliveryAttempt,
  recordServiceManualMessageInTransaction,
  recordServiceManualShare,
} from "@ewatrade/db/queries"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import {
  customerMessagingProviderStatus,
  enqueueServiceNotificationIntent,
} from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"

import {
  serviceBatchNotificationIntentSchema,
  serviceDeliveryAttemptSchema,
  serviceJobMessagesSchema,
  serviceManualMessageSchema,
  serviceManualShareSchema,
  serviceNotificationIntentSchema,
} from "../../schemas/services"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceManager } from "./service-permissions"

/** Active Store scope for G05 messaging; the command re-checks authority. */
function messagingScope(ctx: {
  tenantContext: {
    membership: { role: string }
    tenant: { id: string }
    activeStore: { id: string } | null
  }
  session: { user: { id: string } }
}) {
  assertServiceManager(ctx.tenantContext.membership.role)
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose the current Store.",
    })
  return {
    tenantId: ctx.tenantContext.tenant.id,
    storeId,
    actorUserId: ctx.session.user.id,
  }
}
async function messaging<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ServiceIntakeReviewError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    if (error instanceof CatalogError)
      throw new TRPCError({
        code: "CONFLICT",
        message: error.message,
        cause: error,
      })
    throw error
  }
}

export const serviceCommunicationsRouter = createTRPCRouter({
  manualMessageEditorContext: protectedProcedure
    .input(serviceManualMessageContextInput)
    .query(({ ctx, input }) => {
      const scope = messagingScope(ctx)
      return messaging(() =>
        ctx.db.$transaction(
          (tx) =>
            readServiceManualMessageEditorContextInTransaction(tx, {
              ...scope,
              ...input,
            }),
          {
            isolationLevel: "RepeatableRead",
            maxWait: 10_000,
            timeout: 30_000,
          },
        ),
      )
    }),
  manualMessageOriginal: protectedProcedure
    .input(serviceManualMessageOriginalInput)
    .query(({ ctx, input }) => {
      const scope = messagingScope(ctx)
      return messaging(() =>
        ctx.db.$transaction(
          (tx) =>
            readServiceManualMessageOriginalInTransaction(tx, {
              ...scope,
              ...input,
            }),
          {
            isolationLevel: "RepeatableRead",
            maxWait: 10_000,
            timeout: 30_000,
          },
        ),
      )
    }),
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

  /** History of one Job's messages: bounded, safe fields, classified. */
  listMessages: protectedProcedure
    .input(serviceJobMessagesSchema)
    .query(({ ctx, input }) => {
      const scope = messagingScope(ctx)
      return messaging(() =>
        ctx.db.$transaction(
          (tx) =>
            listServiceJobMessagesInTransaction(tx, { ...scope, ...input }),
          {
            isolationLevel: "RepeatableRead",
            maxWait: 10_000,
            timeout: 30_000,
          },
        ),
      )
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

  /**
   * Records content the staff member says they ALREADY shared themselves.
   * Never sends, queues or calls a provider; it appears in customer tracking.
   */
  recordManualMessage: protectedProcedure
    .input(serviceManualMessageSchema)
    .mutation(({ ctx, input }) => {
      const scope = messagingScope(ctx)
      return messaging(() =>
        ctx.db.$transaction(
          (tx) =>
            recordServiceManualMessageInTransaction(tx, { ...scope, ...input }),
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
        ),
      )
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
