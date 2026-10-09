import type { ZodType } from "zod"

/** Mirrors `@ewatrade/auth/roles`; kept local so the manifest stays dependency-free. */
export type CapabilityRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "OPERATOR"
export type CapabilityDomain =
  | "search"
  | "catalog"
  | "inventory"
  | "sales"
  | "services"
  | "customers"
  | "finance"
  | "staff"
export type CapabilityClient = "dashboard" | "mobile"
export type CapabilityRollout = "planned" | "source" | "pilot" | "enabled"
/** `book` and `provider` are reserved for finance and external-money phases. */
export type CapabilityEffect = "none" | "record" | "book" | "provider"

/**
 * The assistant's role ceiling, which may be narrower than the domain's. The
 * API also applies each procedure's canonical domain check and, for scoped
 * staff, its Store grant; the manifest never widens either.
 */
export type CapabilityPolicy = {
  roles: readonly CapabilityRole[]
}

type CapabilityBase = {
  id: string
  version: number
  title: string
  domain: CapabilityDomain
  policy: CapabilityPolicy
  scope: "store" | "tenant" | "book"
  clients: readonly CapabilityClient[]
  rollout: CapabilityRollout
  /** Model-facing name; unchanged when IDs are versioned. */
  tool: string
  /** Canonical procedures this capability reuses, as `router.procedure`. */
  procedures: readonly string[]
  examples: readonly string[]
  /** Repository-relative test files that prove the capability. */
  tests: readonly string[]
  brain: string
}
export type ReadCapability = CapabilityBase & { mode: "read" }
export type WriteCapability = CapabilityBase & {
  mode: "write"
  /** Proposal `action` discriminator. */
  action: string
  schema: ZodType
  effect: Exclude<CapabilityEffect, "none">
  receipt: string
}
export type Capability = ReadCapability | WriteCapability

export type CoverageOwner =
  | CapabilityDomain
  | "platform"
  | "assistant"
  | "commerce"
  | "privacy"
/**
 * Classification for a router procedure that is not a capability. Supported
 * rows come only from manifest `procedures`, never from a rule.
 */
export type ProcedureRule = { owner: CoverageOwner } & (
  | { status: "planned"; ticket: string }
  | { status: "form_only"; reason: string }
  | { status: "excluded"; reason: string }
)
