import type {
  BusinessValues,
  OwnerValues,
  WorkspaceValues,
} from "./signup-schemas"

// ─── Dev form fill definitions ────────────────────────────────────────────────
// Each export provides realistic mock data for its corresponding signup step.
// Only imported in development — tree-shaken in production builds.

const devRunSuffix = Date.now().toString().slice(-7)

export const workspaceFill: WorkspaceValues = {
  subdomain: `nilemkt-${devRunSuffix.slice(-5)}`,
  customDomain: "",
}

export const businessFill: BusinessValues = {
  addressLine1: "12 Market Road",
  businessName: `Nile Market QA ${devRunSuffix}`,
  industry: "retail",
  businessSize: "2_10",
  city: "Lagos",
  countryCode: "NG",
  currencyCode: "NGN",
  phone: `+23480${devRunSuffix}`,
  region: "Lagos",
}

export const ownerFill: OwnerValues = {
  firstName: "Ada",
  lastName: "Nwosu",
  email: `ada.nwosu+dev${devRunSuffix}@nilemkt.dev`,
  password: "password123",
  confirmPassword: "password123",
}
