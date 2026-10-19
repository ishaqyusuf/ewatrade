import {
  ServiceCommerceBookingError,
  ServiceCommercePolicyError,
} from "@ewatrade/db/queries"
import { readStaffServiceCommerceBookingAvailabilityInTransaction } from "@ewatrade/db/service-booking-availability"
import { TRPCError } from "@trpc/server"
import { requireGeneralScope } from "../../assistant/general-context"
import { assistantBookingAvailabilityInput } from "../../schemas/assistant-booking-availability"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceOperator } from "./service-permissions"

const snapshot = {
  isolationLevel: "RepeatableRead" as const,
  maxWait: 10_000,
  timeout: 30_000,
}

function mapBookingError(error: unknown): never {
  if (error instanceof ServiceCommerceBookingError)
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
      cause: error,
    })
  if (error instanceof ServiceCommercePolicyError)
    throw new TRPCError({
      code: error.code === "FORBIDDEN" ? "FORBIDDEN" : "CONFLICT",
      message: error.message,
      cause: error,
    })
  throw error
}

/** Protected live, unreserved availability; no customer capability or command. */
export const serviceAssistantBookingsRouter = createTRPCRouter({
  availability: protectedProcedure
    .input(assistantBookingAvailabilityInput)
    .query(async ({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      const scope = requireGeneralScope(ctx)
      try {
        return await ctx.db.$transaction(
          (tx) =>
            readStaffServiceCommerceBookingAvailabilityInTransaction(tx, {
              ...input,
              actorUserId: scope.userId,
              tenantId: scope.tenantId,
              storeId: scope.storeId,
            }),
          snapshot,
        )
      } catch (error) {
        return mapBookingError(error)
      }
    }),
})
