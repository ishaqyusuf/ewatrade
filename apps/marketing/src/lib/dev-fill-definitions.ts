import type {
  AccountTypeValues,
  BusinessValues,
  OwnerValues,
  WorkspaceValues,
} from "./signup-schemas"

// ─── Dev form fill definitions ────────────────────────────────────────────────
// Each export provides realistic mock data for its corresponding signup step.
// Only imported in development — tree-shaken in production builds.

export const accountTypeFill: AccountTypeValues = {
  modes: ["STORE", "MERCHANT"],
}

export const workspaceFill: WorkspaceValues = {
  subdomain: "nilemkt",
  customDomain: "",
}

export const businessFill: BusinessValues = {
  businessName: "Nile Market Co.",
  industry: "retail",
  businessSize: "2_10",
  countryCode: "NG",
  phone: "+234 801 234 5678",
}

export const ownerFill: OwnerValues = {
  firstName: "Ada",
  lastName: "Nwosu",
  email: `ada.nwosu+dev${Date.now().toString().slice(-4)}@nilemkt.dev`,
  password: "password123",
  confirmPassword: "password123",
}
