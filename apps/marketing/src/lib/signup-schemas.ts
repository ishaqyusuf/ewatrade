import { z } from "zod"

// ─── Step 1: Account Type ─────────────────────────────────────────────────────

export const TENANT_MODES = ["STORE", "DISPATCH", "MERCHANT"] as const
export type TenantMode = (typeof TENANT_MODES)[number]

export const accountTypeSchema = z.object({
  modes: z
    .array(z.enum(TENANT_MODES))
    .min(1, "Select at least one account type")
    .max(3, "Maximum 3 modes allowed"),
})

export type AccountTypeValues = z.infer<typeof accountTypeSchema>

// ─── Step 2: Workspace ────────────────────────────────────────────────────────

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

// ─── Step 3: Business Details ─────────────────────────────────────────────────

export const INDUSTRIES = [
  { value: "retail", label: "Retail" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "fashion", label: "Fashion & Apparel" },
  { value: "electronics", label: "Electronics" },
  { value: "logistics", label: "Logistics & Delivery" },
  { value: "health_beauty", label: "Health & Beauty" },
  { value: "home_living", label: "Home & Living" },
  { value: "other", label: "Other" },
] as const

export const BUSINESS_SIZES = [
  { value: "solo", label: "Solo founder" },
  { value: "2_10", label: "2 – 10 people" },
  { value: "11_50", label: "11 – 50 people" },
  { value: "50_plus", label: "50+ people" },
] as const

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

export const businessSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters")
    .max(120, "Business name is too long"),
  industry: z.string().min(1, "Select your industry"),
  businessSize: z.string().min(1, "Select your business size"),
  countryCode: z.string().min(1, "Select your country"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20, "Phone number is too long")
    .regex(/^\+?[0-9\s\-().]{7,20}$/, "Enter a valid phone number"),
})

export type BusinessValues = z.infer<typeof businessSchema>

// ─── Step 4: Owner Account ────────────────────────────────────────────────────

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

export const signupPayloadSchema = z.object({
  modes: z.array(z.enum(TENANT_MODES)).min(1),
  subdomain: z.string().min(3).max(32),
  customDomain: z.string().optional().or(z.literal("")),
  businessName: z.string().min(2).max(120),
  industry: z.string().min(1),
  businessSize: z.string().min(1),
  countryCode: z.string().min(1),
  phone: z.string().min(7).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
})

export type SignupPayload = z.infer<typeof signupPayloadSchema>
