import { z } from "zod"

export const MEMBERSHIP_RESUMPTION_CONTRACT =
  "account-privacy-atomic-membership-replay-v1"

const approvalSchema = z
  .object({
    requestId: z.string().min(1).max(200),
    approvedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    approvalReference: z.string().trim().min(1).max(200),
  })
  .strict()

/** This certifies safe resumption, never the outcome of an earlier attempt. */
export function accountPrivacyMembershipResumption(
  input: {
    requestId: string
    status: string
    accessStatus: string | null
    nextStep: string
  },
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
) {
  if (
    environment.APP_ENV !== "preview" ||
    environment.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    environment.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED !== "true" ||
    input.status !== "PROCESSING" ||
    input.accessStatus !== "REVOKED" ||
    input.nextStep !== "REVOKE_MEMBERSHIPS"
  )
    return null
  try {
    const approval = approvalSchema.parse(
      JSON.parse(
        environment.ACCOUNT_PRIVACY_MEMBERSHIP_RESUMPTION_JSON ?? "null",
      ),
    )
    const approvedAt = Date.parse(approval.approvedAt)
    const expiresAt = Date.parse(approval.expiresAt)
    if (
      approval.requestId !== input.requestId ||
      !Number.isFinite(now.getTime()) ||
      approvedAt > now.getTime() ||
      expiresAt <= now.getTime() ||
      expiresAt <= approvedAt ||
      expiresAt - approvedAt > 60 * 60 * 1000
    )
      return null
    return {
      contract: MEMBERSHIP_RESUMPTION_CONTRACT,
      environment: "preview" as const,
      requestId: input.requestId,
      expectedStep: "REVOKE_MEMBERSHIPS" as const,
      approvalReference: approval.approvalReference,
      expiresAt: approval.expiresAt,
      issuedAt: now.toISOString(),
    }
  } catch {
    return null
  }
}
