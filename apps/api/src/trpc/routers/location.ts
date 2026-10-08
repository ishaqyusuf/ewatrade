import {
  GeoAddressError,
  createGeoLookupLimiter,
  isValidCoordinate,
  reverseGeocode,
} from "@ewatrade/utils/geo-address"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../init"

// Sign-up's "Use my current location" is public, so cap callers and respect
// the provider's one-request-per-second limit.
const limiter = createGeoLookupLimiter()

export const locationRouter = createTRPCRouter({
  reverseGeocode: publicProcedure
    .input(
      z
        .object({ latitude: z.number(), longitude: z.number() })
        .strict()
        .refine((value) => isValidCoordinate(value.latitude, value.longitude)),
    )
    .mutation(async ({ ctx, input }) => {
      if (!limiter.allow(ctx.clientIp ?? "unknown"))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many location lookups. Enter the address instead.",
        })
      try {
        return await limiter.run(() =>
          reverseGeocode(input.latitude, input.longitude),
        )
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof GeoAddressError
              ? error.message
              : "We couldn’t look up this location. Try again.",
        })
      }
    }),
})
