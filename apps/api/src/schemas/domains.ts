import { normalizeDomainName } from "@ewatrade/domains"
import { z } from "zod"

export const DOMAIN_REGISTRANT_CONSENT_VERSION = "2026-07-24" as const
export const DOMAIN_TERMS_VERSION = "2026-07-24" as const

const supportedDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(253)
  .transform((value, context) => {
    try {
      return normalizeDomainName(value).normalizedDomain
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Enter a valid domain.",
      })
      return z.NEVER
    }
  })

export const domainAvailabilitySchema = z.object({
  domain: supportedDomainSchema,
  storeId: z.string().trim().min(1),
})

export const domainRegistrantSchema = z.object({
  addressLine1: z.string().trim().min(3).max(160),
  addressLine2: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  companyName: z.string().trim().max(160).nullable().optional(),
  consentVersion: z.literal(DOMAIN_REGISTRANT_CONSENT_VERSION),
  countryCode: z.string().trim().length(2).toUpperCase(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phoneCountryCode: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{0,3}$/),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/),
  postalCode: z.string().trim().max(24).nullable().optional(),
  region: z.string().trim().min(2).max(100),
})

export const createDomainCheckoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  quoteId: z.string().trim().min(1),
  registrantProfileId: z.string().trim().min(1),
  surface: z.enum(["dashboard", "mobile"]).default("dashboard"),
  termsVersion: z.literal(DOMAIN_TERMS_VERSION),
})

export const domainListSchema = z.object({
  query: z.string().trim().max(120).nullable().optional(),
  statuses: z
    .array(
      z.enum([
        "OWNERSHIP_PENDING",
        "DNS_CONFIGURING",
        "VERIFYING",
        "ACTIVE",
        "FAILED",
        "DISCONNECTED",
      ]),
    )
    .max(6)
    .optional(),
})

export const domainOrderSchema = z.object({
  orderId: z.string().trim().min(1),
})

export const connectExternalDomainSchema = z.object({
  domain: supportedDomainSchema,
  storeId: z.string().trim().min(1),
})

export const verifyDomainConnectionSchema = z.object({
  connectionId: z.string().trim().min(1),
})
