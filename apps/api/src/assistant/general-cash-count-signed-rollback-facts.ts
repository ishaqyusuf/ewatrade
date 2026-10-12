import { Prisma } from "@ewatrade/db"
import { rollbackCheck } from "./general-cash-count-signed-rollback-guards"

// Explicit inventory: schema drift must fail before any rollback fixture is written.
export const g02FinanceTables = [
  "FinanceAccount",
  "FinanceBankAccountState",
  "FinanceBankMatchEvent",
  "FinanceBankStatement",
  "FinanceBankStatementLine",
  "FinanceBill",
  "FinanceBillLine",
  "FinanceBillPayment",
  "FinanceBook",
  "FinanceCommand",
  "FinanceExpenseReceiptAsset",
  "FinanceExpenseReceiptAuditEvent",
  "FinanceExpenseReceiptDownloadGrant",
  "FinanceFiscalCalendar",
  "FinanceFiscalCloseEvent",
  "FinanceFiscalCloseJournal",
  "FinanceFiscalYear",
  "FinanceInventoryCostReview",
  "FinanceInventoryCostReviewAllocation",
  "FinanceInventoryCostReviewEvidence",
  "FinanceInventoryCostReviewJournal",
  "FinanceInventoryCostReviewPool",
  "FinanceInventoryPool",
  "FinanceInventoryValuationEvent",
  "FinanceJournalEntry",
  "FinanceJournalLine",
  "FinanceMoneyAccountPaymentEvent",
  "FinancePeriod",
  "FinanceProductReturnCost",
  "FinanceProductReturnCostAllocation",
  "FinancePurchaseReceiptLine",
  "FinancePurchaseRecognition",
  "FinancePurchaseRecognitionEvent",
  "FinancePurchaseRecognitionLine",
  "FinanceReconciliation",
  "FinanceSupplierAccount",
  "FinanceSupplierAllocation",
  "FinanceSupplierAllocationRelease",
  "FinanceSupplierEntry",
] as const

export type G02RollbackFacts = Array<{
  table: string
  rows: string
  hash: string
}>
export function changedG02FactTables(
  before: Readonly<G02RollbackFacts>,
  after: Readonly<G02RollbackFacts>,
) {
  const a = new Map(before.map((row) => [row.table, row]))
  const b = new Map(after.map((row) => [row.table, row]))
  return [...new Set([...a.keys(), ...b.keys()])].sort().filter((table) => {
    const x = a.get(table)
    const y = b.get(table)
    return !x || !y || x.rows !== y.rows || x.hash !== y.hash
  })
}
type Reader = Pick<Prisma.TransactionClient, "$queryRaw">

export function assertG02FinanceInventory(actual: string[]) {
  rollbackCheck(
    JSON.stringify([...actual].sort()) === JSON.stringify(g02FinanceTables),
    "Finance table inventory changed; review the full rollback fingerprint scope",
  )
}

export async function verifyG02FinanceInventory(db: Reader) {
  const rows = await db.$queryRaw<Array<{ table: string }>>(Prisma.sql`
    SELECT table_name AS "table" FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
      AND table_name LIKE 'Finance%'
    ORDER BY table_name`)
  assertG02FinanceInventory(rows.map((row) => row.table))
}

/** All columns, all Tenant Books, stable row ordering; only hashes/counts leave SQL. */
export async function g02RollbackFacts(
  db: Reader,
  tenantId: string,
): Promise<G02RollbackFacts> {
  const books = Prisma.sql`SELECT id FROM "FinanceBook" WHERE "tenantId" = ${tenantId}`
  const conversations = Prisma.sql`SELECT id FROM "AssistantConversation" WHERE "tenantId" = ${tenantId}`
  const users = Prisma.sql`SELECT "userId" FROM "Membership" WHERE "tenantId" = ${tenantId}`
  const scopes: Array<[string, Prisma.Sql]> = g02FinanceTables.map((table) => [
    table,
    table === "FinanceBook"
      ? Prisma.sql`r."tenantId" = ${tenantId}`
      : Prisma.sql`r."bookId" IN (${books})`,
  ])
  scopes.push(
    ["Tenant", Prisma.sql`r.id = ${tenantId}`],
    ["Store", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["Membership", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["StaffStoreAssignment", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["RetailOpsStaffProfile", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["User", Prisma.sql`r.id IN (${users})`],
    ["Session", Prisma.sql`r."userId" IN (${users})`],
    ["Account", Prisma.sql`r."userId" IN (${users})`],
    ["AssistantConversation", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["AssistantAttachment", Prisma.sql`r."tenantId" = ${tenantId}`],
    [
      "AssistantTranscriptionAttempt",
      Prisma.sql`r."attachmentId" IN (SELECT id FROM "AssistantAttachment" WHERE "tenantId" = ${tenantId})`,
    ],
    ["AssistantMessage", Prisma.sql`r."conversationId" IN (${conversations})`],
    ["AssistantRun", Prisma.sql`r."conversationId" IN (${conversations})`],
    ["AssistantUsageEvent", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["AssistantActionProposal", Prisma.sql`r."tenantId" = ${tenantId}`],
    ["SetupDraft", Prisma.sql`r."tenantId" = ${tenantId}`],
    [
      "SetupDraftEntity",
      Prisma.sql`r."draftId" IN (SELECT id FROM "SetupDraft" WHERE "tenantId" = ${tenantId})`,
    ],
    // Budget keys span actor/business/global scopes; fingerprint every saved budget row.
    ["AssistantBudget", Prisma.sql`TRUE`],
  )
  // Identifiers come exclusively from the fixed source inventory; Tenant values stay bound.
  const queries = scopes.map(
    ([table, where]) => Prisma.sql`
    SELECT ${table}::text AS "table", count(*)::text AS rows,
      md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb)::text) AS hash
    FROM ${Prisma.raw(`"${table}"`)} r WHERE ${where}`,
  )
  // Per-row fingerprints locate a budget mismatch without retaining keys or content.
  // The aggregate all-budget assertion above remains mandatory.
  queries.push(Prisma.sql`
    SELECT 'AssistantBudgetRow:' || md5(r."scopeKey") AS "table", '1'::text AS rows,
      md5(to_jsonb(r)::text) AS hash FROM "AssistantBudget" r`)
  return db.$queryRaw<G02RollbackFacts>(Prisma.sql`
    SELECT * FROM (${Prisma.join(queries, " UNION ALL ")}) fingerprints ORDER BY "table"`)
}

export function assertG02FactsUnchanged(
  before: Readonly<G02RollbackFacts>,
  after: Readonly<G02RollbackFacts>,
  allowed: string[] = [],
) {
  rollbackCheck(
    before.length === after.length && before.length > 0,
    "Incomplete saved-state fingerprints",
  )
  for (let i = 0; i < before.length; i++) {
    const a = before[i]
    const b = after[i]
    rollbackCheck(a && b, "Missing saved-state fingerprint")
    rollbackCheck(a.table === b.table, "Fingerprint inventory differs")
    if (!allowed.includes(a.table))
      rollbackCheck(
        a.rows === b.rows && a.hash === b.hash,
        `Saved ${a.table} facts changed`,
      )
  }
}
