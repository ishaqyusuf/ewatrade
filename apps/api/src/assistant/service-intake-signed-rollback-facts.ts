import { Prisma } from "@ewatrade/db"
import {
  type G02RollbackFacts,
  assertG02FactsUnchanged,
  changedG02FactTables,
  g02RollbackFacts,
  verifyG02FinanceInventory,
} from "./general-cash-count-signed-rollback-facts"
import { signedIntakeCheck as check } from "./service-intake-signed-rollback-guards"

// All columns/rows, including child relations and cross-scope fixture proposal bindings.
// These extra domain/auth aggregates expose only counts and hashes, never row content.
export const serviceIntakeSignedFactTables = [
  "Customer",
  "CustomerLedgerAccount",
  "CustomerLedgerEntry",
  "CustomerLedgerCommand",
  "CustomerLedgerAllocation",
  "CustomerLedgerAllocationRelease",
  "CustomerLedgerReceipt",
  "CatalogItem",
  "CatalogService",
  "CatalogCommandReceipt",
  "CatalogPriceChange",
  "SellableVariant",
  "SellableVariantSelection",
  "SellableOffering",
  "ServiceOffering",
  "StoreOfferingAvailability",
  "CommercialOrder",
  "CommercialOrderLine",
  "OfferingSnapshot",
  "CommercialOrderPayment",
  "CommercialServiceAuthorization",
  "CommercialServiceFulfillment",
  "CommercialOrderFulfillmentCommand",
  "CommercialOrderActivity",
  "CommercialOrderAmendment",
  "CommercialOrderCredit",
  "CommercialOrderReminderSettings",
  "CommercialOrderReminderDelivery",
  "CommercialOrderReminderDigest",
  "ServiceStoreSettings",
  "ServiceIntake",
  "ServiceIntakeLine",
  "ServiceJob",
  "ServiceJobLine",
  "ServiceWorkAssignment",
  "ServiceDueCommitment",
  "ServiceWorkEvent",
  "ServiceInternalNote",
  "ServiceException",
  "ServiceEvidence",
  "ServiceEvidenceAuditEvent",
  "ServiceNotificationIntent",
  "ServiceManualShare",
  "ServiceDeliveryAttempt",
  "CustomerTrackingAccess",
  "AccountPrivacyRequest",
  "AccountPrivacyRetention",
  "AccountPrivacyNoticeAttempt",
  "AccountPrivacyDomainOutcome",
  "AccountPrivacyAccessRevocation",
  "AccountPrivacyAccessRecoveryEvent",
  "AccountPrivacyChallenge",
  "AccountPrivacyRateBucket",
  "LegalAcceptance",
  "QaTesterGrant",
  "QaClientAuthorization",
  "QaAccessProfileSelection",
  "QaAccessAttemptBucket",
  "QaAccessAuditEvent",
  "AssistantActionProposal",
  "AssistantConversation",
  "AssistantMessage",
] as const
export type ServiceIntakeSignedAuthorizationFact = {
  id: string
  hash: string
  stableFieldsHash: string
  lastValidatedAt: string
  updatedAt: string
  status: string
  revokedAt: string | null
  expiresAt: string
}
export type ServiceIntakeSignedFacts = Array<
  G02RollbackFacts[number] & {
    authorizationRows?: ServiceIntakeSignedAuthorizationFact[] | null
  }
>
export function assertServiceIntakeSignedNativeCreation(
  before: ServiceIntakeSignedFacts,
  after: ServiceIntakeSignedFacts,
) {
  for (const [table, count] of [
    ["CommercialOrder", 1],
    ["CommercialOrderLine", 2],
    ["OfferingSnapshot", 2],
    ["ServiceIntake", 1],
    ["ServiceIntakeLine", 2],
    ["ServiceJob", 1],
    ["ServiceJobLine", 1],
  ] as const) {
    const a = before.find((row) => row.table === `D04:${table}`)
    const b = after.find((row) => row.table === `D04:${table}`)
    check(a && b, `Missing native ${table} fingerprint`)
    check(
      BigInt(b.rows) === BigInt(a.rows) + BigInt(count),
      `Signed creation duplicated or omitted ${table}`,
    )
  }
}
type Reader = Pick<Prisma.TransactionClient, "$queryRaw">

export async function serviceIntakeSignedRollbackFacts(
  db: Reader,
  tenantId: string,
) {
  const shared = await g02RollbackFacts(db, tenantId)
  const queries = serviceIntakeSignedFactTables.map((table) => {
    // Safe row metadata shares the aggregate's SQL snapshot. Full-row hashes
    // retain every column; credentials and client/grant identifiers never leave SQL.
    const authorizationRows =
      table === "QaClientAuthorization"
        ? Prisma.sql`COALESCE(jsonb_agg(jsonb_build_object(
          'id', r."id", 'hash', md5(to_jsonb(r)::text),
          'stableFieldsHash', md5((to_jsonb(r) - 'lastValidatedAt' - 'updatedAt')::text),
          'lastValidatedAt', r."lastValidatedAt", 'updatedAt', r."updatedAt",
          'status', r."status", 'revokedAt', r."revokedAt", 'expiresAt', r."expiresAt"
        ) ORDER BY r."id"), '[]'::jsonb)`
        : Prisma.sql`NULL::jsonb`
    return Prisma.sql`
    SELECT ${`D04:${table}`}::text AS "table", count(*)::text AS rows,
      md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb)::text) AS hash,
      ${authorizationRows} AS "authorizationRows"
    FROM ${Prisma.raw(`"${table}"`)} r`
  })
  const domain = await db.$queryRaw<ServiceIntakeSignedFacts>(Prisma.sql`
    SELECT * FROM (${Prisma.join(queries, " UNION ALL ")}) fingerprints ORDER BY "table"`)
  return [
    ...shared,
    ...domain.map(({ authorizationRows, ...fact }) =>
      authorizationRows ? { ...fact, authorizationRows } : fact,
    ),
  ].sort((a, b) => a.table.localeCompare(b.table))
}

export {
  verifyG02FinanceInventory as verifyServiceIntakeSignedFinanceInventory,
}
export { changedG02FactTables as changedServiceIntakeSignedFacts }
export { assertG02FactsUnchanged as assertServiceIntakeSignedFactsUnchanged }
