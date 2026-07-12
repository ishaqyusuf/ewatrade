import { z } from "zod"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional()

const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value || undefined)
  .pipe(z.email().optional())

export const tenantBootstrapSchema = z.object({
  tenantSlug: optionalText(120),
})

const storeOnboardingSchema = z.object({
  businessType: optionalText(80),
  countryCode: optionalText(8),
  productCategory: optionalText(120),
  salesMethod: optionalText(80),
  teamSize: optionalText(80),
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
  supportEmail: optionalEmailSchema,
  supportPhone: optionalText(40),
})

export type TenantBootstrapInput = z.infer<typeof tenantBootstrapSchema>
export type CreateStoreInput = z.infer<typeof createStoreSchema>
