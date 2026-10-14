import { createHash } from "node:crypto"
import { z } from "zod"

const provider = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    disposition: z.enum(["ERASURE_CONFIRMED", "RETENTION_APPROVED"]),
    purpose: z.string().trim().min(1).max(300),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict()
const schema = z
  .object({
    version: z.string().trim().min(1).max(100),
    approvalReference: z.string().trim().min(1).max(300),
    approvedAt: z.string().datetime(),
    reviewAt: z.string().datetime(),
    mode: z.literal("REVIEW_PROVIDER_CONFIRMATIONS"),
    providers: z.array(provider).min(1).max(30),
  })
  .strict()
export type AccountPrivacyExternalPolicy = z.infer<typeof schema> & {
  digest: string
}

/** An approved schedule is a prerequisite, never evidence that a provider acted. */
export function getApprovedAccountPrivacyExternalPolicy(
  environment = process.env,
  now = new Date(),
): AccountPrivacyExternalPolicy | null {
  const raw = environment.ACCOUNT_PRIVACY_EXTERNAL_POLICY_JSON
  const digest = environment.ACCOUNT_PRIVACY_APPROVED_EXTERNAL_POLICY_SHA256
  if (
    !raw ||
    !digest ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    createHash("sha256").update(raw).digest("hex") !== digest
  )
    return null
  try {
    const result = schema.safeParse(JSON.parse(raw))
    if (!result.success) return null
    const policy = result.data
    if (
      !Number.isFinite(now.getTime()) ||
      policy.version !==
        environment.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim() ||
      new Date(policy.approvedAt) > now ||
      new Date(policy.reviewAt) <= now ||
      new Set(policy.providers.map((item) => item.key)).size !==
        policy.providers.length
    )
      return null
    if (
      policy.providers.some((item) =>
        item.disposition === "RETENTION_APPROVED"
          ? !item.expiresAt || new Date(item.expiresAt) <= now
          : item.expiresAt !== null,
      )
    )
      return null
    return { ...policy, digest }
  } catch {
    return null
  }
}

export const accountPrivacyExternalReceiptSchema = z
  .object({
    provider: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    // Hash of the request/subject-bound confirmation retained in the restricted support case.
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmedAt: z.coerce.date(),
  })
  .strict()
export type AccountPrivacyExternalReceipt = z.infer<
  typeof accountPrivacyExternalReceiptSchema
>

export function accountPrivacyExternalEvidence(input: {
  requestId: string
  subjectId: string
  policy: AccountPrivacyExternalPolicy
  receipts: readonly AccountPrivacyExternalReceipt[]
  operatorUserId: string
  processedAt: Date
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        processor: "account-privacy-external-review-v1",
        requestId: input.requestId,
        subjectId: input.subjectId,
        policyDigest: input.policy.digest,
        operatorUserId: input.operatorUserId,
        processedAt: input.processedAt.toISOString(),
        receipts: [...input.receipts]
          .sort((a, b) => a.provider.localeCompare(b.provider))
          .map((item) => ({
            provider: item.provider,
            evidenceDigest: item.evidenceDigest,
            confirmedAt: item.confirmedAt.toISOString(),
          })),
      }),
    )
    .digest("hex")
}

/** Rechecks the processor's recorded review against current approved scope and immutable subject. */
export function accountPrivacyExternalReviewIsConfirmed(
  input: {
    requestId: string
    subjectId: string
    verifiedAt: Date
    outcome: {
      processor: string
      policyVersion: string
      evidenceDigest: string
      disposition: string
      processedAt: Date
      nextReviewAt: Date | null
    }
    recorded: unknown
    now: Date
  },
  environment = process.env,
) {
  const policy = getApprovedAccountPrivacyExternalPolicy(environment, input.now)
  if (
    !policy ||
    !input.recorded ||
    typeof input.recorded !== "object" ||
    Array.isArray(input.recorded)
  )
    return false
  const recorded = input.recorded as Record<string, unknown>
  const providersResult = z
    .array(provider)
    .min(1)
    .max(30)
    .safeParse(recorded.providers)
  const receiptsResult = z
    .array(accountPrivacyExternalReceiptSchema)
    .min(1)
    .max(30)
    .safeParse(recorded.receipts)
  if (
    !providersResult.success ||
    !receiptsResult.success ||
    recorded.processor !== "account-privacy-external-review-v1" ||
    recorded.policyDigest !== policy.digest ||
    typeof recorded.operatorUserId !== "string" ||
    !recorded.operatorUserId.trim() ||
    recorded.operatorUserId === input.subjectId ||
    JSON.stringify(providersResult.data) !== JSON.stringify(policy.providers)
  )
    return false
  const receipts = receiptsResult.data
  if (
    receipts.length !== policy.providers.length ||
    new Set(receipts.map((row) => row.provider)).size !== receipts.length ||
    policy.providers.some(
      (provider) => !receipts.some((row) => row.provider === provider.key),
    ) ||
    receipts.some(
      (row) =>
        row.confirmedAt < input.verifiedAt ||
        row.confirmedAt > input.outcome.processedAt,
    )
  )
    return false
  const retained = policy.providers.filter(
    (provider) => provider.disposition === "RETENTION_APPROVED",
  )
  const reviewTimes = [
    new Date(policy.reviewAt).getTime(),
    ...retained.map((provider) => new Date(provider.expiresAt ?? "").getTime()),
  ]
  const nextReviewAt = retained.length ? Math.min(...reviewTimes) : null
  return (
    input.outcome.processor === "account-privacy-external-review-v1" &&
    input.outcome.policyVersion === policy.version &&
    input.outcome.processedAt >= input.verifiedAt &&
    input.outcome.processedAt <= input.now &&
    input.outcome.disposition ===
      (retained.length ? "RETENTION_APPROVED" : "ERASURE_CONFIRMED") &&
    (input.outcome.nextReviewAt?.getTime() ?? null) === nextReviewAt &&
    recorded.evidenceDigest === input.outcome.evidenceDigest &&
    input.outcome.evidenceDigest ===
      accountPrivacyExternalEvidence({
        requestId: input.requestId,
        subjectId: input.subjectId,
        policy,
        receipts,
        operatorUserId: recorded.operatorUserId,
        processedAt: input.outcome.processedAt,
      })
  )
}
