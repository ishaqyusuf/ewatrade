import {
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZE_KEYS,
  OPERATING_CURRENCY_CODES,
  isBusinessProfileKey,
} from "@ewatrade/utils"
import { z } from "zod"

// ─── Step 1: Workspace ────────────────────────────────────────────────────────

export const workspaceSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .min(3, "Subdomain must be at least 3 characters")
    .max(32, "Subdomain must be 32 characters or less")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      "Subdomain can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)",
    ),
  customDomain: z
    .string()
    .trim()
    .max(253, "Domain too long")
    .regex(
      /^$|^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
      "Enter a valid domain (e.g. mystore.com)",
    )
    .optional()
    .or(z.literal("")),
})

export type WorkspaceValues = z.infer<typeof workspaceSchema>

// ─── Step 2: Business Details ─────────────────────────────────────────────────

export const COUNTRIES = [
  { value: "NG", label: "Nigeria" },
  { value: "GH", label: "Ghana" },
  { value: "KE", label: "Kenya" },
  { value: "ZA", label: "South Africa" },
  { value: "EG", label: "Egypt" },
  { value: "TZ", label: "Tanzania" },
  { value: "UG", label: "Uganda" },
  { value: "SN", label: "Senegal" },
  { value: "CI", label: "Côte d'Ivoire" },
  { value: "ET", label: "Ethiopia" },
  { value: "OTHER", label: "Other" },
] as const

export const businessSchema = z
  .object({
    addressLine1: z
      .string()
      .trim()
      .min(3, "Enter your business address")
      .max(200),
    businessName: z
      .string()
      .trim()
      .min(2, "Business name must be at least 2 characters")
      .max(120, "Business name is too long"),
    businessProfileKey: z
      .string()
      .trim()
      .refine(isBusinessProfileKey, "Select your business category"),
    businessProfileVersion: z.literal(BUSINESS_PROFILE_SCHEMA_VERSION),
    businessSize: z.enum(BUSINESS_TEAM_SIZE_KEYS, {
      message: "Select your business size",
    }),
    city: z.string().trim().min(2, "Enter your city").max(120),
    countryCode: z.string().min(1, "Select your country"),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES, {
      message: "Select your operating currency",
    }),
    phone: z
      .string()
      .trim()
      .min(7, "Enter a valid phone number")
      .max(20, "Phone number is too long")
      .regex(/^\+?[0-9\s\-().]{7,20}$/, "Enter a valid phone number"),
    region: z.string().trim().max(120).optional().or(z.literal("")),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS, {
      message: "Select what you sell",
    }),
    orderChannels: z
      .array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS))
      .min(1, "Select at least one order channel")
      .max(5),
    otherBusinessDescription: z.string().trim().max(240).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.businessProfileKey === "other-mixed-business" &&
      !value.otherBusinessDescription?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Tell us what your business does",
        path: ["otherBusinessDescription"],
      })
    }
  })

export type BusinessValues = z.infer<typeof businessSchema>

// ─── Step 3: Owner Account ────────────────────────────────────────────────────

export const ownerSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(80, "First name is too long"),
    lastName: z
      .string()
      .trim()
      .min(1, "Last name is required")
      .max(80, "Last name is too long"),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(200, "Email is too long"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password is too long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type OwnerValues = z.infer<typeof ownerSchema>

// ─── Full Signup Payload ──────────────────────────────────────────────────────

export const signupPayloadSchema = z
  .object({
    addressLine1: z.string().min(3).max(200),
    accessToken: z.string().trim().min(1).optional(),
    subdomain: z.string().min(3).max(32),
    customDomain: z.string().optional().or(z.literal("")),
    businessName: z.string().min(2).max(120),
    city: z.string().min(2).max(120),
    businessProfileKey: z
      .string()
      .trim()
      .refine(isBusinessProfileKey, "Select your business category"),
    businessProfileVersion: z.literal(BUSINESS_PROFILE_SCHEMA_VERSION),
    businessSize: z.enum(BUSINESS_TEAM_SIZE_KEYS),
    countryCode: z.string().min(1),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES),
    phone: z.string().min(7).max(20),
    region: z.string().max(120).optional().or(z.literal("")),
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email().max(200),
    password: z.string().min(8).max(128),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS),
    orderChannels: z.array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS)).min(1).max(5),
    otherBusinessDescription: z.string().trim().max(240).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.businessProfileKey === "other-mixed-business" &&
      !value.otherBusinessDescription?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Tell us what your business does",
        path: ["otherBusinessDescription"],
      })
    }
  })

export type SignupPayload = z.infer<typeof signupPayloadSchema>
