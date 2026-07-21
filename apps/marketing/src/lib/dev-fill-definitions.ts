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
  businessProfileKey: "general-retail-groceries",
  businessProfileVersion: 1,
  businessName: `Nile Market QA ${devRunSuffix}`,
  businessSize: "2_5",
  city: "Lagos",
  countryCode: "NG",
  currencyCode: "NGN",
  phone: `+23480${devRunSuffix}`,
  region: "Lagos",
  operatingModel: "products",
  orderChannels: ["walk_in", "phone_whatsapp"],
  otherBusinessDescription: "",
}

export const ownerFill: OwnerValues = {
  firstName: "Ada",
  lastName: "Nwosu",
  email: `ada.nwosu+dev${devRunSuffix}@nilemkt.dev`,
  password: "password123",
  confirmPassword: "password123",
}
