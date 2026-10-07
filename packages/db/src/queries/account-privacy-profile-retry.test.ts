import { describe, expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { submitExternalDeletionRequest } from "./account-privacy"
import {
  accountPrivacyProfileEvidence,
  accountPrivacyPseudonymousEmail,
  getApprovedAccountPrivacyProfilePolicy,
} from "./account-privacy-profile-policy"

describe("verified deletion retry after profile minimization", () => {
  for (const scenario of [
    "processing",
    "completed",
    "wrong-code",
    "ambiguous",
    "subject-mismatch",
    "stale-evidence",
    "residual-age",
    "unapproved-policy",
    "registered-email",
    "unverified-registered-email",
    "unknown-email",
  ]) {
    test(scenario, async () => {
      const secret = "qa-only-privacy-secret-not-a-production-credential"
      const email = "synthetic@example.test"
      const code = "123456"
      const now = new Date()
      const source = JSON.stringify({
        version: "qa-only-profile-retry",
        approvalReference: "synthetic-fixture-not-owner-approval",
        approvedAt: new Date(now.getTime() - 60_000).toISOString(),
        mode: "PSEUDONYMIZE",
        legalAcceptanceDisposition: "RETAIN",
        retentionPurpose: "QA-only proof",
        reviewAt: new Date(now.getTime() + 86_400_000).toISOString(),
      })
      const values = {
        ACCOUNT_PRIVACY_OTP_SECRET: secret,
        ACCOUNT_PRIVACY_PROFILE_POLICY_JSON: source,
        ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256: createHash("sha256")
          .update(source)
          .digest("hex"),
        ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "qa-only-profile-retry",
      }
      const previous = Object.fromEntries(
        Object.keys(values).map((key) => [key, process.env[key]]),
      )
      Object.assign(process.env, values)
      try {
        const policy = getApprovedAccountPrivacyProfilePolicy()
        if (!policy) throw new Error("Expected synthetic policy")
        const digest = (purpose: string, value: string) =>
          createHmac("sha256", secret)
            .update(`${purpose}:${value}`)
            .digest("hex")
        const emailDigest = digest("account-deletion-email", email)
        const outcome = {
          userId: "subject",
          processor: "account-privacy-profile-v1",
          policyVersion: policy.version,
          disposition: "RETENTION_APPROVED",
          processedAt: new Date(now.getTime() - 1000),
          nextReviewAt: new Date(policy.reviewAt),
          evidenceDigest: accountPrivacyProfileEvidence({
            requestId: "original-request",
            subjectId: "subject",
            policy,
            legalAcceptanceCount: 1,
          }),
        }
        const request = {
          id: "original-request",
          requestKey: "account-deletion:subject",
          userId: "subject",
          verifiedSubjectUserId: "subject",
          verifiedAt: new Date(now.getTime() - 2000),
          contactEmail: email,
          status:
            scenario === "completed"
              ? ("COMPLETED" as const)
              : ("PROCESSING" as const),
          requestedAt: new Date(now.getTime() - 3000),
          updatedAt: now,
          completedAt: scenario === "completed" ? now : null,
          user: {
            email: accountPrivacyPseudonymousEmail(
              "original-request",
              "subject",
            ),
            emailVerified: false,
          },
          domainOutcomes: [outcome],
        }
        if (scenario === "subject-mismatch") request.userId = "someone-else"
        if (scenario === "stale-evidence")
          outcome.evidenceDigest = "0".repeat(64)
        if (scenario === "unapproved-policy")
          Reflect.deleteProperty(
            process.env,
            "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
          )
        let upserts = 0
        let lookups = 0
        let query: unknown
        const tx = {
          accountPrivacyChallenge: {
            findUnique: async () => ({
              id: "fresh-challenge",
              expiresAt: new Date(now.getTime() + 60_000),
              attempts: 0,
              codeDigest: digest(
                "account-deletion-code",
                `${emailDigest}:${code}`,
              ),
            }),
            deleteMany: async () => ({ count: 1 }),
            updateMany: async () => ({ count: 1 }),
          },
          user: {
            findUnique: async (args: { where: { id?: string } }) =>
              args.where.id
                ? {
                    ...request.user,
                    name: "",
                    isPlatformAdmin: false,
                    ageBand:
                      scenario === "residual-age"
                        ? "AGE_13_TO_15"
                        : "UNDECLARED",
                    ageDeclaredAt: null,
                  }
                : scenario.includes("registered-email")
                  ? {
                      id: "new-subject",
                      emailVerified: scenario === "registered-email",
                    }
                  : null,
          },
          account: { count: async () => 0 },
          session: { count: async () => 0 },
          verification: { count: async () => 0 },
          legalAcceptance: { count: async () => 1 },
          accountPrivacyRequest: {
            findMany: async (args: unknown) => {
              lookups++
              query = args
              return scenario === "unknown-email"
                ? []
                : scenario === "ambiguous"
                  ? [request, { ...request, id: "different-request" }]
                  : [request]
            },
            upsert: async (args: { where: { requestKey: string } }) => {
              upserts++
              return { id: "new-request", requestKey: args.where.requestKey }
            },
          },
        }
        const db = {
          $transaction: (fn: (transaction: typeof tx) => unknown) => fn(tx),
        } as unknown as PrismaClient
        const result = await submitExternalDeletionRequest(
          db,
          email,
          scenario === "wrong-code" ? "654321" : code,
        )
        if (["processing", "completed"].includes(scenario)) {
          expect(result).toEqual({
            id: request.id,
            status: request.status,
            requestedAt: request.requestedAt,
            updatedAt: request.updatedAt,
            completedAt: request.completedAt,
          })
          expect(upserts).toBe(0)
          expect(query).toMatchObject({
            take: 2,
            where: { contactEmail: email },
          })
        } else if (scenario === "registered-email") {
          expect(result).toMatchObject({
            requestKey: "account-deletion:new-subject",
          })
          expect(lookups).toBe(0)
        } else if (
          ["unverified-registered-email", "unknown-email"].includes(scenario)
        ) {
          expect(result).toMatchObject({
            requestKey: `external-deletion:${emailDigest}`,
          })
          expect(upserts).toBe(1)
        } else {
          expect(result).toBeNull()
          expect(upserts).toBe(0)
          if (scenario === "wrong-code") expect(lookups).toBe(0)
        }
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) Reflect.deleteProperty(process.env, key)
          else process.env[key] = value
        }
      }
    })
  }
})
