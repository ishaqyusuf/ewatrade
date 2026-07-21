import {
  BUSINESS_PROFILE_SCHEMA_VERSION,
  OPERATING_CURRENCY_CODES,
  isBusinessProfileKey,
} from "@ewatrade/utils"
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

const operatingCurrencySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(OPERATING_CURRENCY_CODES),
)

export const tenantBootstrapSchema = z.object({
  tenantSlug: optionalText(120),
})

const storeOnboardingSchema = z.object({
  businessProfileKey: optionalText(120).refine(
    (value) => value === undefined || isBusinessProfileKey(value),
    "Select a supported business category",
  ),
  businessProfileVersion: z
    .literal(BUSINESS_PROFILE_SCHEMA_VERSION)
    .optional(),
  countryCode: optionalText(8),
  otherBusinessDescription: optionalText(240),
  operatingModel: optionalText(120),
  orderChannels: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  salesMethod: optionalText(80),
  staffInvolvement: optionalText(120),
  teamSize: optionalText(80),
})

export const createStoreSchema = z.object({
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  countryCode: optionalText(8),
  name: z.string().trim().min(1).max(120),
  currencyCode: operatingCurrencySchema.optional(),
  onboarding: storeOnboardingSchema.optional(),
  supportEmail: optionalEmailSchema,
  supportPhone: optionalText(40),
  postalCode: optionalText(40),
  region: optionalText(120),
})

export type TenantBootstrapInput = z.infer<typeof tenantBootstrapSchema>
export type CreateStoreInput = z.infer<typeof createStoreSchema>
