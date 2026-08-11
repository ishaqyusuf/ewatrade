import {
  SERVICE_COMMERCE_CUSTOMER_ACTION_TEMPLATE_KEY,
  issueServiceCommerceCustomerActionToken,
  protectCommunicationsRecipient,
} from "@ewatrade/communications"
import {
  ServiceCommerceCustomerActionError,
  executeServiceCommerceCustomerAction,
  getPublicServiceCommerceCustomerAction,
  issueServiceCommerceCustomerActions,
} from "@ewatrade/db/queries"
import { enqueueServiceCommerceCustomerNotificationDispatch } from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"

import {
  serviceCommerceCustomerActionExecuteSchema,
  serviceCommerceCustomerActionReadSchema,
  serviceCommerceCustomerActionsIssueSchema,
} from "../../../schemas/service-commerce-actions"
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../init"
import {
  assertServiceOperator,
  resolveServiceStoreId,
} from "../service-permissions"

function mapActionError(error: unknown): never {
  if (error instanceof ServiceCommerceCustomerActionError) {
    throw new TRPCError({
      code:
        error.code === "ACTION_FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "ACTION_NOT_FOUND" || error.code === "ACTION_EXPIRED"
            ? "NOT_FOUND"
            : error.code === "ACTION_BLOCKED"
              ? "BAD_REQUEST"
              : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

export const serviceCommerceActionsRouter = createTRPCRouter({
  customerAction: publicProcedure
    .input(serviceCommerceCustomerActionReadSchema)
    .query(({ ctx, input }) =>
      getPublicServiceCommerceCustomerAction(ctx.db, input),
    ),

  executeCustomerAction: publicProcedure
    .input(serviceCommerceCustomerActionExecuteSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await executeServiceCommerceCustomerAction(ctx.db, input)
      } catch (error) {
        mapActionError(error)
      }
    }),

  issueCustomerActions: protectedProcedure
    .input(serviceCommerceCustomerActionsIssueSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        const result = await issueServiceCommerceCustomerActions(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          issueCapabilityToken: issueServiceCommerceCustomerActionToken,
          protectRecipient: ({ recipient }) =>
            protectCommunicationsRecipient(recipient),
          storeId,
          templateKey:
            input.channel === "whatsapp"
              ? SERVICE_COMMERCE_CUSTOMER_ACTION_TEMPLATE_KEY
              : undefined,
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (result.notificationIntentId) {
          await enqueueServiceCommerceCustomerNotificationDispatch({
            actorUserId: ctx.session.user.id,
            intentId: result.notificationIntentId,
            storeId,
            tenantId: ctx.tenantContext.tenant.id,
          })
        }
        return result.actions
      } catch (error) {
        mapActionError(error)
      }
    }),
})
