import { Prisma } from "../../../generated/prisma/client"

type OwedParty = { id: string; name: string; owedMinor: string }
type OwedRow = {
  kind: "customers" | "suppliers"
  count: string
  owedMinor: string
  top: OwedParty[]
}

/** Caller owns fresh Finance authority and its existing RepeatableRead snapshot. */
export async function getFinanceOwedSummaryProjection(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: {
    tenantId: string
    currencyCode: string
    bookId: string
    snapshot: bigint
  },
) {
  const rows = await tx.$queryRaw<OwedRow[]>(Prisma.sql`
    WITH "supplierDebts" AS MATERIALIZED (
      SELECT supplier.id, supplier.name,
        SUM(line."creditMinor" - line."debitMinor") AS owed
      FROM "FinanceSupplierAccount" supplier
      JOIN "FinanceSupplierEntry" source ON source."bookId"=supplier."bookId" AND source."supplierId"=supplier.id
      JOIN "FinanceJournalEntry" entry ON entry."bookId"=source."bookId" AND entry.id=source."journalEntryId"
      JOIN "FinanceJournalLine" line ON line."bookId"=entry."bookId" AND line."entryId"=entry.id
      JOIN "FinanceAccount" account ON account."bookId"=line."bookId" AND account.id=line."accountId"
      WHERE supplier."bookId"=${input.bookId} AND entry.sequence<=${input.snapshot}
        AND account.purpose='PAYABLE'
      GROUP BY supplier.id, supplier.name
      HAVING SUM(line."creditMinor" - line."debitMinor")>0
    ), "customerAccounts" AS MATERIALIZED (
      SELECT account.id, account."customerId", account."lastSequence", customer.name
      FROM "CustomerLedgerAccount" account
      JOIN "Customer" customer ON customer.id=account."customerId" AND customer."tenantId"=account."tenantId"
      WHERE account."tenantId"=${input.tenantId} AND account."currencyCode"=${input.currencyCode}
    ), "customerDebits" AS (
      SELECT entry."accountId", SUM(entry."amountMinor") AS amount
      FROM "customerAccounts" account
      JOIN "CustomerLedgerEntry" entry ON entry."accountId"=account.id AND entry.sequence<=account."lastSequence"
      WHERE entry.side='DEBIT' GROUP BY entry."accountId"
    ), "customerAllocations" AS (
      SELECT allocation."accountId", SUM(allocation."amountMinor") AS amount
      FROM "customerAccounts" account
      JOIN "CustomerLedgerAllocation" allocation ON allocation."accountId"=account.id AND allocation.sequence<=account."lastSequence"
      GROUP BY allocation."accountId"
    ), "customerReleases" AS (
      SELECT allocation."accountId", SUM(release."amountMinor") AS amount
      FROM "customerAccounts" account
      JOIN "CustomerLedgerAllocation" allocation ON allocation."accountId"=account.id AND allocation.sequence<=account."lastSequence"
      JOIN "CustomerLedgerAllocationRelease" release ON release."allocationId"=allocation.id AND release.sequence<=account."lastSequence"
      GROUP BY allocation."accountId"
    ), "customerDebts" AS MATERIALIZED (
      SELECT account."customerId" AS id, account.name,
        COALESCE(debits.amount,0)-COALESCE(allocations.amount,0)+COALESCE(releases.amount,0) AS owed
      FROM "customerAccounts" account
      LEFT JOIN "customerDebits" debits ON debits."accountId"=account.id
      LEFT JOIN "customerAllocations" allocations ON allocations."accountId"=account.id
      LEFT JOIN "customerReleases" releases ON releases."accountId"=account.id
    )
    SELECT 'customers'::text AS kind, COUNT(*)::text AS count, COALESCE(SUM(owed),0)::text AS "owedMinor",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',top.id,'name',top.name,'owedMinor',top.owed::text) ORDER BY top.owed DESC,top.id ASC)
        FROM (SELECT id,name,owed FROM "customerDebts" WHERE owed>0 ORDER BY owed DESC,id ASC LIMIT 3) top),'[]'::jsonb) AS top
      FROM "customerDebts" WHERE owed>0
    UNION ALL
    SELECT 'suppliers'::text AS kind, COUNT(*)::text AS count, COALESCE(SUM(owed),0)::text AS "owedMinor",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',top.id,'name',top.name,'owedMinor',top.owed::text) ORDER BY top.owed DESC,top.id ASC)
        FROM (SELECT id,name,owed FROM "supplierDebts" ORDER BY owed DESC,id ASC LIMIT 3) top),'[]'::jsonb) AS top
      FROM "supplierDebts"
  `)
  const customers = rows.find((row) => row.kind === "customers")
  const suppliers = rows.find((row) => row.kind === "suppliers")
  if (!customers || !suppliers || rows.length !== 2)
    throw new Error("Financial owed summary is unavailable.")
  const summary = (row: OwedRow) => {
    const count = Number(row.count)
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("Financial owed count is unavailable.")
    return { count, owedMinor: row.owedMinor, top: row.top }
  }
  return { customers: summary(customers), suppliers: summary(suppliers) }
}
