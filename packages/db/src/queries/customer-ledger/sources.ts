import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"

const CANONICAL_SEQUENCE = /^(0|[1-9]\d{0,18})$/

/**
 * List currently usable ledger sources for a merchant correction workflow.
 * This is a current-state read, not a historical statement: pagination is
 * pinned to the account revision and callers must refresh after any mutation.
 * Source provenance is advisory; every posting command must revalidate it
 * while holding the corresponding locks.
 */
export async function listCustomerLedgerSources(
  db: PrismaClient,
  input: FinanceActor & {
    accountId: string
    side: "CREDIT" | "DEBIT"
    expectedRevision?: string
    afterSequence?: string
    limit?: number
  },
) {
  if (
    !["CREDIT", "DEBIT"].includes(input.side) ||
    (input.expectedRevision !== undefined &&
      !CANONICAL_SEQUENCE.test(input.expectedRevision)) ||
    (input.afterSequence !== undefined &&
      !CANONICAL_SEQUENCE.test(input.afterSequence)) ||
    (input.afterSequence !== undefined && input.expectedRevision === undefined)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Use a canonical current revision with a valid source cursor.",
    )
  const limit = input.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Source pages must contain 1–50 entries.",
    )

  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
        select: {
          id: true,
          tenantId: true,
          customerId: true,
          currencyCode: true,
          revision: true,
          lastSequence: true,
        },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer ledger account not found in this business.",
        )
      if (
        input.expectedRevision !== undefined &&
        BigInt(input.expectedRevision) !== account.revision
      )
        throw new FinanceError(
          "CONFLICT",
          "The customer account changed. Refresh its current sources before continuing.",
        )

      const snapshot = account.lastSequence
      const after = BigInt(input.afterSequence ?? "0")
      if (after > snapshot)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The source cursor is beyond available customer history.",
        )
      const book = await tx.financeBook.findUnique({
        where: {
          tenantId_currencyCode: {
            tenantId: account.tenantId,
            currencyCode: account.currencyCode,
          },
        },
        select: { id: true },
      })
      if (!book)
        throw new FinanceError(
          "NOT_FOUND",
          "The matching financial book is unavailable.",
        )

      const rows = await tx.$queryRaw<
        Array<{
          id: string
          sequence: bigint
          kind: string
          side: string
          amountMinor: bigint
          usedAmountMinor: string
          remainingAmountMinor: string
          sourceKind: string
          sourceId: string
          orderId: string | null
          effectiveAt: Date
          orderNumber: string | null
          orderStatus: string | null
        }>
      >`
        WITH candidates AS (
          SELECT e.id, e.sequence, e.kind, e.side, e."amountMinor",
            e."sourceKind", e."sourceId", e."orderId", e."effectiveAt"
          FROM "CustomerLedgerEntry" e
          WHERE e."accountId" = ${account.id}
            AND e."tenantId" = ${account.tenantId}
            AND e.side = ${input.side}::"CustomerLedgerSide"
            AND e.sequence > ${after}
            AND e.sequence <= ${snapshot}
            AND NOT EXISTS (
              SELECT 1 FROM "CustomerLedgerEntry" reversal
              WHERE reversal."accountId" = e."accountId"
                AND reversal."reversalOfId" = e.id
            )
            AND (
              (${input.side} = 'CREDIT' AND e.kind IN ('OPENING_CREDIT', 'RECEIPT'))
              OR
              (${input.side} = 'DEBIT' AND e.kind IN ('OPENING_DEBT', 'ORDER_CHARGE'))
            )
            AND (
              (
                e.kind = 'RECEIPT'
                AND e.side = 'CREDIT'
                AND e."sourceKind" = 'CUSTOMER_RECEIPT'
                AND EXISTS (
                  SELECT 1 FROM "CustomerLedgerReceipt" receipt
                  WHERE receipt.id = e."sourceId"
                    AND receipt."entryId" = e.id
                    AND receipt."accountId" = e."accountId"
                    AND receipt."bookId" = ${book.id}
                )
                AND EXISTS (
                  SELECT 1 FROM "FinanceJournalEntry" posting
                  WHERE posting."bookId" = ${book.id}
                    AND posting."sourceKind" = 'CUSTOMER_RECEIPT'
                    AND posting."sourceId" = e."sourceId"
                    AND NOT EXISTS (
                      SELECT 1 FROM "FinanceJournalEntry" reversal
                      WHERE reversal."reversalOfId" = posting.id
                    )
                    AND (
                      SELECT COALESCE(SUM(line."creditMinor" - line."debitMinor"), 0)
                      FROM "FinanceJournalLine" line
                      JOIN "FinanceAccount" control
                        ON control.id = line."accountId" AND control."bookId" = line."bookId"
                      WHERE line."bookId" = posting."bookId"
                        AND line."entryId" = posting.id
                        AND control.purpose = 'CUSTOMER_ADVANCE'
                        AND control.kind = 'LIABILITY'
                    ) = e."amountMinor"
                )
              )
              OR
              (
                e.kind = 'OPENING_CREDIT'
                AND e.side = 'CREDIT'
                AND e."sourceKind" = 'CUSTOMER_OPENING'
                AND e."sourceId" = ${`${account.id}:CREDIT`}
                AND EXISTS (
                  SELECT 1 FROM "FinanceJournalEntry" posting
                  WHERE posting."bookId" = ${book.id}
                    AND posting."sourceKind" = 'CUSTOMER_LEDGER_OPENING'
                    AND posting."sourceId" = e.id
                    AND NOT EXISTS (
                      SELECT 1 FROM "FinanceJournalEntry" reversal
                      WHERE reversal."reversalOfId" = posting.id
                    )
                    AND (
                      SELECT COALESCE(SUM(line."creditMinor" - line."debitMinor"), 0)
                      FROM "FinanceJournalLine" line
                      JOIN "FinanceAccount" control
                        ON control.id = line."accountId" AND control."bookId" = line."bookId"
                      WHERE line."bookId" = posting."bookId"
                        AND line."entryId" = posting.id
                        AND control.purpose = 'CUSTOMER_ADVANCE'
                        AND control.kind = 'LIABILITY'
                    ) = e."amountMinor"
                )
              )
              OR
              (
                e.kind = 'OPENING_DEBT'
                AND e.side = 'DEBIT'
                AND e."sourceKind" = 'CUSTOMER_OPENING'
                AND e."sourceId" = ${`${account.id}:DEBT`}
                AND EXISTS (
                  SELECT 1 FROM "FinanceJournalEntry" posting
                  WHERE posting."bookId" = ${book.id}
                    AND posting."sourceKind" = 'CUSTOMER_LEDGER_OPENING'
                    AND posting."sourceId" = e.id
                    AND NOT EXISTS (
                      SELECT 1 FROM "FinanceJournalEntry" reversal
                      WHERE reversal."reversalOfId" = posting.id
                    )
                    AND (
                      SELECT COALESCE(SUM(line."debitMinor" - line."creditMinor"), 0)
                      FROM "FinanceJournalLine" line
                      JOIN "FinanceAccount" control
                        ON control.id = line."accountId" AND control."bookId" = line."bookId"
                      WHERE line."bookId" = posting."bookId"
                        AND line."entryId" = posting.id
                        AND control.purpose = 'RECEIVABLE'
                        AND control.kind = 'ASSET'
                    ) = e."amountMinor"
                )
              )
              OR
              (
                e.kind = 'ORDER_CHARGE'
                AND e.side = 'DEBIT'
                AND e."sourceKind" = 'COMMERCIAL_ORDER_BILLED'
                AND e."orderId" IS NOT NULL
                AND e."sourceId" = e."orderId"
                AND EXISTS (
                  SELECT 1 FROM "CommercialOrder" order_row
                  WHERE order_row.id = e."orderId"
                    AND order_row."tenantId" = e."tenantId"
                    AND order_row."customerId" = ${account.customerId}
                    AND order_row."currencyCode" = ${account.currencyCode}
                    AND order_row."totalMinor" = e."amountMinor"
                    AND order_row.status NOT IN ('DRAFT', 'PENDING', 'CANCELLED', 'REFUNDED')
                )
                AND EXISTS (
                  SELECT 1 FROM "FinanceJournalEntry" posting
                  WHERE posting."bookId" = ${book.id}
                    AND posting."sourceKind" = 'COMMERCIAL_ORDER_BILLED'
                    AND posting."sourceId" = e."orderId"
                    AND NOT EXISTS (
                      SELECT 1 FROM "FinanceJournalEntry" reversal
                      WHERE reversal."reversalOfId" = posting.id
                    )
                )
              )
            )
        ), source_balances AS (
          SELECT candidate.*,
            COALESCE(alloc.total_minor, 0) AS allocated_minor,
            COALESCE(rel.total_minor, 0) AS released_minor,
            order_row."orderNumber" AS "orderNumber",
            order_row.status AS "orderStatus"
          FROM candidates candidate
          LEFT JOIN LATERAL (
            SELECT SUM(allocation."amountMinor") AS total_minor
            FROM "CustomerLedgerAllocation" allocation
            WHERE allocation."accountId" = ${account.id}
              AND allocation."sequence" <= ${snapshot}
              AND (
                (${input.side} = 'CREDIT' AND allocation."creditEntryId" = candidate.id)
                OR (${input.side} = 'DEBIT' AND allocation."chargeEntryId" = candidate.id)
              )
          ) alloc ON TRUE
          LEFT JOIN LATERAL (
            SELECT SUM(release."amountMinor") AS total_minor
            FROM "CustomerLedgerAllocationRelease" release
            JOIN "CustomerLedgerAllocation" allocation ON allocation.id = release."allocationId"
            WHERE allocation."accountId" = ${account.id}
              AND allocation."sequence" <= ${snapshot}
              AND release."sequence" <= ${snapshot}
              AND (
                (${input.side} = 'CREDIT' AND allocation."creditEntryId" = candidate.id)
                OR (${input.side} = 'DEBIT' AND allocation."chargeEntryId" = candidate.id)
              )
          ) rel ON TRUE
          LEFT JOIN "CommercialOrder" order_row
            ON candidate.kind = 'ORDER_CHARGE'
            AND order_row.id = candidate."orderId"
            AND order_row."tenantId" = ${account.tenantId}
            AND order_row."customerId" = ${account.customerId}
            AND order_row."currencyCode" = ${account.currencyCode}
        )
        SELECT id, sequence, kind, side, "amountMinor",
          (allocated_minor - released_minor)::text AS "usedAmountMinor",
          ("amountMinor" - allocated_minor + released_minor)::text AS "remainingAmountMinor",
          "sourceKind", "sourceId", "orderId", "effectiveAt", "orderNumber", "orderStatus"
        FROM source_balances
        WHERE allocated_minor >= released_minor
          AND allocated_minor - released_minor <= "amountMinor"
          AND "amountMinor" - allocated_minor + released_minor > 0
        ORDER BY sequence
        LIMIT ${limit + 1}
      `

      const page = rows.slice(0, limit)
      return {
        accountId: account.id,
        customerId: account.customerId,
        currencyCode: account.currencyCode,
        currentRevision: account.revision.toString(),
        snapshotSequence: snapshot.toString(),
        coverage: "POSTED_CUSTOMER_LEDGER_SOURCES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
        side: input.side,
        sources: page.map((row) => ({
          id: row.id,
          sequence: row.sequence.toString(),
          kind: row.kind,
          side: row.side,
          amountMinor: row.amountMinor.toString(),
          usedAmountMinor: row.usedAmountMinor.toString(),
          remainingAmountMinor: row.remainingAmountMinor.toString(),
          sourceKind: row.sourceKind,
          sourceId: row.sourceId,
          effectiveAt: row.effectiveAt,
          order:
            row.orderId && row.orderNumber && row.orderStatus
              ? {
                  id: row.orderId,
                  orderNumber: row.orderNumber,
                  status: row.orderStatus,
                }
              : null,
        })),
        nextCursor:
          rows.length > limit
            ? (page[page.length - 1]?.sequence.toString() ?? null)
            : null,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
