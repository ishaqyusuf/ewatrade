import { createHash } from "node:crypto"
import { z } from "zod"

const databaseHost = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
export const privacyProductOperatorPlanSchema = z
  .object({
    version: z.literal(1),
    databaseHost,
    databaseName: z.string().min(1).max(100),
    officeDatabaseHost: databaseHost,
    officeDatabaseName: z.string().min(1).max(100),
    officeActorId: z.uuid(),
    officeEnrollmentAuditId: z.uuid(),
    officeOwnerId: z.uuid(),
    expectedOfficeRevision: z.number().int().positive(),
    expectedOwnerRevision: z.number().int().positive(),
    expectedPlatformAdminCount: z.number().int().nonnegative(),
    userId: z.uuid(),
    email: z.literal("privacy@ewatrade.com"),
    name: z.literal("EwaTrade Privacy Operations"),
    scope: z.literal("process"),
    platformAdmin: z.literal(true),
    expiresAt: z.iso.datetime(),
    reason: z.string().trim().min(30).max(1000),
    mailboxVerification: z.string().trim().min(30).max(1000),
  })
  .strict()
  .refine(
    (p) => p.userId !== p.officeActorId && p.userId !== p.officeOwnerId,
    "The product identity must be distinct from office identities",
  )

export type PrivacyProductOperatorPlan = z.infer<
  typeof privacyProductOperatorPlanSchema
>

export function readPrivacyProductOperatorPlan(raw: string, now = new Date()) {
  const plan = privacyProductOperatorPlanSchema.parse(JSON.parse(raw))
  const remaining = new Date(plan.expiresAt).getTime() - now.getTime()
  if (remaining <= 0 || remaining > 31 * 24 * 60 * 60_000)
    throw Error("Operator mapping must expire within 31 days")
  return {
    plan,
    sha256: createHash("sha256").update(raw).digest("hex"),
  }
}

export function assertPrivacyOperatorTarget(
  connectionString: string,
  host: string,
  name: string,
) {
  const url = new URL(connectionString)
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== host ||
    decodeURIComponent(url.pathname.slice(1)) !== name ||
    !host.endsWith(".neon.tech") ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")
  )
    throw Error("Database does not match the exact reviewed Neon target")
  // pg's require compatibility mode must not weaken certificate verification.
  url.searchParams.set("sslmode", "verify-full")
  return url.toString()
}

export function assertPrivacyOperatorApplyApproval(
  sha256: string,
  env: Record<string, string | undefined>,
) {
  if (
    env.PRIVACY_PRODUCT_ENROLLMENT !== "APPROVED" ||
    env.PRIVACY_PRODUCT_PLAN_SHA256 !== sha256
  )
    throw Error("Apply requires approval of this exact product grant plan")
}

export function privacyOperatorBinding(plan: PrivacyProductOperatorPlan) {
  return {
    [plan.officeActorId]: {
      userId: plan.userId,
      scope: plan.scope,
      expiresAt: plan.expiresAt,
    },
  }
}
