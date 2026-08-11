import { protectCommunicationsRecipient } from "@ewatrade/communications"
import {
  ServiceCommerceBookingError,
  ServiceCommercePolicyError,
  confirmServiceCommerceBooking,
  createServiceCommerceBookingCapability,
  createServiceCommerceBookingHold,
  createServiceCommerceBookingResource,
  getPublicServiceCommerceBooking,
  getPublicServiceCommerceBookingSlots,
  getServiceCommerceBookingConfiguration,
  resolveServiceCommerceBookingCapabilityScope,
  reviseServiceCommerceBooking,
  updateServiceCommerceBookingConfiguration,
} from "@ewatrade/db/queries"
import { enqueueServiceCommerceBookingNotificationDispatch } from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"

import {
  serviceCommerceBookingCapabilityCreateSchema,
  serviceCommerceBookingConfigurationReadSchema,
  serviceCommerceBookingConfigurationUpdateSchema,
  serviceCommerceBookingResourceCreateSchema,
  serviceCommercePublicBookingConfirmSchema,
  serviceCommercePublicBookingDetailSchema,
  serviceCommercePublicBookingHoldSchema,
  serviceCommercePublicBookingReviseSchema,
  serviceCommercePublicBookingSlotsSchema,
  serviceCommerceStaffBookingConfirmSchema,
  serviceCommerceStaffBookingHoldSchema,
  serviceCommerceStaffBookingReviseSchema,
} from "../../../schemas/service-commerce-bookings"
import { issueServiceCommerceBookingCapabilityToken } from "../../../service-commerce/booking-capability"
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../init"
import {
  assertServiceManager,
  assertServiceOperator,
  resolveServiceStoreId,
} from "../service-permissions"

function mapBookingError(error: unknown): never {
  if (error instanceof ServiceCommerceBookingError) {
    throw new TRPCError({
      code:
        error.code === "BOOKING_FORBIDDEN" || error.code === "BOOKING_BLOCKED"
          ? "FORBIDDEN"
          : error.code === "BOOKING_NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "BOOKING_INVALID_INPUT"
              ? "BAD_REQUEST"
              : "CONFLICT",
      message: error.message,
    })
  }
  if (error instanceof ServiceCommercePolicyError) {
    throw new TRPCError({
      code: error.code === "FORBIDDEN" ? "FORBIDDEN" : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

function publicFailure(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "This booking action is unavailable.",
  })
}

function storeId(
  context: {
    activeStore: { id: string } | null
    stores: Array<{ id: string }>
  },
  requested?: string,
) {
  return resolveServiceStoreId(context.stores, context.activeStore, requested)
}

async function enqueueBookingNotifications<
  T extends {
    notificationDispatches: Array<{ actorUserId: string; intentId: string }>
  },
>(result: T, scope: { storeId: string; tenantId: string }) {
  const { notificationDispatches, ...projection } = result
  await Promise.all(
    notificationDispatches.map((dispatch) =>
      enqueueServiceCommerceBookingNotificationDispatch({
        ...dispatch,
        ...scope,
      }),
    ),
  )
  return projection
}

export const serviceCommerceBookingsRouter = createTRPCRouter({
  bookingConfiguration: protectedProcedure
    .input(serviceCommerceBookingConfigurationReadSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        return await getServiceCommerceBookingConfiguration(ctx.db, {
          actorUserId: ctx.session.user.id,
          offeringId: input.offeringId,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  createBookingCapability: protectedProcedure
    .input(serviceCommerceBookingCapabilityCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        return await createServiceCommerceBookingCapability(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  createBookingResource: protectedProcedure
    .input(serviceCommerceBookingResourceCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        return await createServiceCommerceBookingResource(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  updateBookingConfiguration: protectedProcedure
    .input(serviceCommerceBookingConfigurationUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        return await updateServiceCommerceBookingConfiguration(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  confirmBooking: protectedProcedure
    .input(serviceCommerceStaffBookingConfirmSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const resolvedStoreId = storeId(ctx.tenantContext, input.storeId)
        const result = await confirmServiceCommerceBooking(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          protectRecipient: protectCommunicationsRecipient,
          storeId: resolvedStoreId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        return enqueueBookingNotifications(result, {
          storeId: resolvedStoreId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  holdBookingSlot: protectedProcedure
    .input(serviceCommerceStaffBookingHoldSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await createServiceCommerceBookingHold(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  reviseBooking: protectedProcedure
    .input(serviceCommerceStaffBookingReviseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const resolvedStoreId = storeId(ctx.tenantContext, input.storeId)
        const result = await reviseServiceCommerceBooking(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          storeId: resolvedStoreId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        return enqueueBookingNotifications(result, {
          storeId: resolvedStoreId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapBookingError(error)
      }
    }),

  publicBooking: publicProcedure
    .input(serviceCommercePublicBookingDetailSchema)
    .query(async ({ ctx, input }) => {
      try {
        await resolveServiceCommerceBookingCapabilityScope(ctx.db, {
          accessToken: input.accessToken,
          purpose: "view_and_manage",
        })
        return await getPublicServiceCommerceBooking(ctx.db, {
          accessToken: input.accessToken,
        })
      } catch {
        publicFailure()
      }
    }),

  publicBookingSlots: publicProcedure
    .input(serviceCommercePublicBookingSlotsSchema)
    .query(async ({ ctx, input }) => {
      try {
        await resolveServiceCommerceBookingCapabilityScope(ctx.db, {
          accessToken: input.accessToken,
          purpose: "view_slots",
        })
        return await getPublicServiceCommerceBookingSlots(ctx.db, input)
      } catch {
        publicFailure()
      }
    }),

  publicConfirmBooking: publicProcedure
    .input(serviceCommercePublicBookingConfirmSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveServiceCommerceBookingCapabilityScope(
          ctx.db,
          {
            accessToken: input.accessToken,
            purpose: "confirm",
          },
        )
        const result = await confirmServiceCommerceBooking(ctx.db, {
          ...input,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          protectRecipient: protectCommunicationsRecipient,
          source: scope.source,
          storeId: scope.storeId,
          tenantId: scope.tenantId,
        })
        return enqueueBookingNotifications(result, scope)
      } catch {
        publicFailure()
      }
    }),

  publicHoldBookingSlot: publicProcedure
    .input(serviceCommercePublicBookingHoldSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveServiceCommerceBookingCapabilityScope(
          ctx.db,
          {
            accessToken: input.accessToken,
            purpose: "view_slots",
          },
        )
        return await createServiceCommerceBookingHold(ctx.db, {
          ...input,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          // The opaque capability, not caller input, defines the offering
          // scope. This is also used by manage tokens during rescheduling.
          offeringId: scope.offeringId,
          source: scope.source,
          storeId: scope.storeId,
          tenantId: scope.tenantId,
        })
      } catch {
        publicFailure()
      }
    }),

  publicReviseBooking: publicProcedure
    .input(serviceCommercePublicBookingReviseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = await resolveServiceCommerceBookingCapabilityScope(
          ctx.db,
          {
            accessToken: input.accessToken,
            purpose: "view_and_manage",
          },
        )
        if (scope.bookingId !== input.bookingId) publicFailure()
        if (scope.customerAction && scope.customerAction !== input.operation) {
          publicFailure()
        }
        const result = await reviseServiceCommerceBooking(ctx.db, {
          ...input,
          issueCapabilityToken: issueServiceCommerceBookingCapabilityToken,
          storeId: scope.storeId,
          tenantId: scope.tenantId,
        })
        return enqueueBookingNotifications(result, scope)
      } catch {
        publicFailure()
      }
    }),
})
