import { z } from "zod"

const contactFields = z
  .object({
    supportPhone: z.string().min(1).max(80).nullable(),
    countryCode: z.string().min(2).max(2).nullable(),
  })
  .strict()

export const storeContactSchema = z
  .object({
    storeId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

export const updateStoreContactSchema = contactFields
  .extend({
    storeId: z.string().trim().min(1).max(128),
    expected: contactFields,
  })
  .strict()
