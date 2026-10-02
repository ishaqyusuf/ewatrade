import { z } from "zod"

const id = z.string().trim().min(1).max(128)

export const financePeriodAuditSchema = z
  .object({
    bookId: id,
    cursor: id.optional(),
    limit: z.number().int().min(1).max(50).default(30),
  })
  .strict()
