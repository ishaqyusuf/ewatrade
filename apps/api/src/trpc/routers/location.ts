import {
  type ResolvedAddress,
  isValidCoordinate,
} from "@ewatrade/utils/geo-address"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "../init"

export const locationRouter = createTRPCRouter({
  reverseGeocode: publicProcedure
    .input(
      z
        .object({ latitude: z.number(), longitude: z.number() })
        .strict()
        .refine((value) => isValidCoordinate(value.latitude, value.longitude)),
    )
    .mutation(async (): Promise<ResolvedAddress> => {
      // Keep the older native-client contract, but never forward coordinates.
      // Reopening requires an approved provider and new privacy acceptance.
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Automatic address lookup is unavailable. Enter the address manually.",
      })
    }),
})
