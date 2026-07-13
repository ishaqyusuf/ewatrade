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
  businessTemplateKey: z
    .enum(["product_sales", "dry_cleaning_laundry", "other_generic"])
    .optional(),
  businessType: optionalText(80),
  countryCode: optionalText(8),
  offeringCategory: optionalText(120),
  operatingModel: optionalText(120),
  orderChannels: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  otherBusinessDescription: optionalText(240),
  productCategory: optionalText(120),
  requestedCapabilities: z
    .array(z.string().trim().min(1).max(120))
    .max(12)
    .optional(),
  salesMethod: optionalText(80),
  serviceCategory: optionalText(120),
  staffInvolvement: optionalText(120),
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
