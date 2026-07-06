import { z } from "zod"

export const tenantBootstrapSchema = z.object({
  tenantSlug: z.string().trim().min(1).optional(),
})

export const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .default("NGN")
    .transform((value) => value.toUpperCase()),
  supportEmail: z.email().optional(),
  supportPhone: z.string().trim().max(40).optional(),
})

export type TenantBootstrapInput = z.infer<typeof tenantBootstrapSchema>
export type CreateStoreInput = z.infer<typeof createStoreSchema>
