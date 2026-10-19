import { z } from "zod"

const identity = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (value) =>
      value !== "." &&
      value !== ".." &&
      [...value].every((point) => {
        const code = point.codePointAt(0) ?? 0
        return code >= 32 && code !== 127
      }),
    "Choose a saved record identity",
  )

/** Navigation provenance only; neither the origin nor an object ID grants authority. */
export const readRecordOriginSchema = z
  .object({ tenantId: identity, storeId: identity })
  .strict()
export type ReadRecordOrigin = z.infer<typeof readRecordOriginSchema>

export const catalogItemReadTargetSchema = z
  .object({
    kind: z.literal("catalog_item"),
    catalogItemId: identity,
    origin: readRecordOriginSchema,
  })
  .strict()

/** This opens the directory, not a guessed exact-customer route or name match. */
export const customerDirectoryReadTargetSchema = z
  .object({
    kind: z.literal("customer_directory"),
    origin: readRecordOriginSchema,
  })
  .strict()

export const customerReadTargetSchema = z
  .object({
    kind: z.literal("customer"),
    customerId: identity,
    origin: readRecordOriginSchema,
  })
  .strict()

export const orderReadTargetSchema = z
  .object({
    kind: z.literal("order"),
    orderId: identity,
    origin: readRecordOriginSchema,
  })
  .strict()

export const readRecordTargetSchema = z.discriminatedUnion("kind", [
  catalogItemReadTargetSchema,
  customerDirectoryReadTargetSchema,
  customerReadTargetSchema,
  orderReadTargetSchema,
])
export type ReadRecordTarget = z.infer<typeof readRecordTargetSchema>
