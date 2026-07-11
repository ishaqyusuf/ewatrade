import { z } from "zod"

export const tenantBootstrapSchema = z.object({
  tenantSlug: z.string().trim().min(1).optional(),
})

const storeOnboardingSchema = z.object({
  businessType: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().max(8).optional(),
  productCategory: z.string().trim().max(120).optional(),
  salesMethod: z.string().trim().max(80).optional(),
  teamSize: z.string().trim().max(80).optional(),
})

export const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .default("NGN")
    .transform((value) => value.toUpperCase()),
  onboarding: storeOnboardingSchema.optional(),
  supportEmail: z.email().optional(),
  supportPhone: z.string().trim().max(40).optional(),
})

export type TenantBootstrapInput = z.infer<typeof tenantBootstrapSchema>
export type CreateStoreInput = z.infer<typeof createStoreSchema>
