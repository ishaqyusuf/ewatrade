import { Prisma } from "../../generated/prisma/client"
import { tracePhase } from "../performance-tracing"
import type { DbClient } from "./types"

export type QaSessionValidationFacts = {
  qaAuthorizationId: string | null
  qaMembershipId: string | null
  qaTenantId: string | null
  qaStoreId: string | null
  authorizationId: string | null
  authorizationStatus: string | null
  authorizationRevokedAt: Date | null
  authorizationExpiresAt: Date | null
  grantStatus: string | null
  grantRevokedAt: Date | null
  grantExpiresAt: Date | null
  qaDomain: string | null
  membershipMatches: boolean
}

/** Same current proof predicates in one snapshot; no session token or grant digest. */
export function qaSessionValidationFactsQuery(sessionId: string) {
  return Prisma.sql`
    SELECT s."qaAuthorizationId", s."qaMembershipId", s."qaTenantId", s."qaStoreId",
      a."id" AS "authorizationId", a."status" AS "authorizationStatus",
      a."revokedAt" AS "authorizationRevokedAt", a."expiresAt" AS "authorizationExpiresAt",
      g."status" AS "grantStatus", g."revokedAt" AS "grantRevokedAt",
      g."expiresAt" AS "grantExpiresAt", g."qaDomain",
      EXISTS (
        SELECT 1 FROM "Membership" m
        JOIN "Tenant" t ON t."id" = m."tenantId"
        JOIN "Store" st ON st."tenantId" = t."id"
        WHERE m."id" = s."qaMembershipId" AND s."qaMembershipId" <> ''
          AND m."status" = 'ACTIVE'
          AND t."id" = COALESCE(s."qaTenantId", '')
          AND t."dataClassification" = 'QA' AND t."isActive" = true
          AND t."qaPurgeStartedAt" IS NULL AND t."qaSourceDomain" = g."qaDomain"
          AND st."id" = COALESCE(s."qaStoreId", '') AND st."status" = 'ACTIVE'
      ) AS "membershipMatches"
    FROM "Session" s
    LEFT JOIN "QaClientAuthorization" a ON a."id" = s."qaAuthorizationId"
    LEFT JOIN "QaTesterGrant" g ON g."id" = a."grantId"
    WHERE s."id" = ${sessionId}
    LIMIT 1
  `
}

export async function readQaSessionValidationFacts(
  db: DbClient,
  sessionId: string,
) {
  const rows = await tracePhase("qaProofFacts", () =>
    db.$queryRaw<QaSessionValidationFacts[]>(
      qaSessionValidationFactsQuery(sessionId),
    ),
  )
  return rows[0] ?? null
}

export function hasActiveQaSessionBinding(
  facts: QaSessionValidationFacts,
  now: Date,
): facts is QaSessionValidationFacts & { qaDomain: string } {
  return Boolean(
    facts.authorizationId &&
      facts.authorizationStatus === "ACTIVE" &&
      !facts.authorizationRevokedAt &&
      facts.authorizationExpiresAt &&
      facts.authorizationExpiresAt > now &&
      facts.grantStatus === "ACTIVE" &&
      !facts.grantRevokedAt &&
      facts.grantExpiresAt &&
      facts.grantExpiresAt > now &&
      facts.membershipMatches &&
      typeof facts.qaDomain === "string",
  )
}
