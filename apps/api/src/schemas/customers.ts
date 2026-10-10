import { z } from "zod"

export const customerGetByIdSchema = z
  .object({ customerId: z.string().trim().min(1).max(160) })
  .strict()

export const customerCreateSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(3).max(40).optional(),
  })
  .strict()

/** Omitted fields stay unchanged; `null` clears phone or email. */
export const customerUpdateSchema = z
  .object({
    customerId: z.string().trim().min(1).max(160),
    expectedRevision: z.string().trim().min(1).max(64),
    email: z.string().trim().email().max(320).nullable().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.phone !== undefined ||
      input.email !== undefined,
    "Change at least one detail.",
  )

export const customerListPageSchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    query: z.string().trim().max(160).optional(),
  })
  .strict()

export const customerCountSchema = z
  .object({ query: z.string().trim().min(1).max(160).optional() })
  .strict()
  .optional()
