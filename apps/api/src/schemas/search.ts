import { z } from "zod"

export const globalSearchSchema = z
  .object({
    limit: z.number().int().min(1).max(10).default(6),
    query: z.string().trim().min(2).max(160),
  })
  .strict()
