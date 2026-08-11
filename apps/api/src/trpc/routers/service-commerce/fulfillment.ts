import {
  PrescriptionCommerceError,
  PrescriptionFulfillmentError,
  ServiceCommerceFulfillmentError,
  ServiceCommercePolicyError,
  createPrescriptionServiceCommerceFulfillmentAdapter,
  getServiceCommerceFulfillmentOrder,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  serviceCommerceDeliveryCommandInputSchema,
  serviceCommerceFulfillmentDetailSchema,
  serviceCommercePickupCommandInputSchema,
} from "../../../schemas/service-commerce-fulfillment"
import { createTRPCRouter, protectedProcedure } from "../../init"
import {
  assertServiceOperator,
  resolveServiceStoreId,
} from "../service-permissions"

function mapFulfillmentError(error: unknown): never {
  if (error instanceof ServiceCommerceFulfillmentError) {
    throw new TRPCError({
      code: error.code === "FULFILLMENT_BLOCKED" ? "FORBIDDEN" : "NOT_FOUND",
      message: error.message,
    })
  }
  if (error instanceof PrescriptionFulfillmentError) {
    throw new TRPCError({
      code: error.code === "FULFILLMENT_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT",
      message: error.message,
    })
  }
  if (
    error instanceof PrescriptionCommerceError ||
    error instanceof ServiceCommercePolicyError
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message })
  }
  throw error
}

export const serviceCommerceFulfillmentRouter = createTRPCRouter({
  deliveryFulfillment: protectedProcedure
    .input(serviceCommerceDeliveryCommandInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await createPrescriptionServiceCommerceFulfillmentAdapter(
          ctx.db,
        ).delivery(
          { userId: ctx.session.user.id },
          {
            context: {
              orderId: input.orderId,
              source: input.source,
              storeId,
              tenantId: ctx.tenantContext.tenant.id,
            },
            input: input.input,
          },
        )
      } catch (error) {
        mapFulfillmentError(error)
      }
    }),

  fulfillmentDetail: protectedProcedure
    .input(serviceCommerceFulfillmentDetailSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await getServiceCommerceFulfillmentOrder(ctx.db, {
          actorUserId: ctx.session.user.id,
          orderId: input.orderId,
          source: input.source,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapFulfillmentError(error)
      }
    }),

  pickupFulfillment: protectedProcedure
    .input(serviceCommercePickupCommandInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await createPrescriptionServiceCommerceFulfillmentAdapter(
          ctx.db,
        ).pickup(
          { userId: ctx.session.user.id },
          {
            context: {
              orderId: input.orderId,
              source: input.source,
              storeId,
              tenantId: ctx.tenantContext.tenant.id,
            },
            input: input.input,
          },
        )
      } catch (error) {
        mapFulfillmentError(error)
      }
    }),
})
