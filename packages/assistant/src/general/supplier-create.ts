import { z } from "zod"
export const supplierCreateAction = z.object({
  action: z.literal("supplier_create"),
  bookId: z.string().trim().min(1).max(128),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
  name: z.string().trim().min(1).max(160),
}).strict()
