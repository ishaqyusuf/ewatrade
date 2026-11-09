import { z } from "zod"

export const storePublicListingSchema = z
  .object({
    storeId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

export const updateStorePublicListingSchema = z
  .object({
    storeId: z.string().trim().min(1).max(128),
    listed: z.boolean(),
  })
  .strict()
