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

export const customerListPageSchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    query: z.string().trim().max(160).optional(),
  })
  .strict()
