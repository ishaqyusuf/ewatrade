import type { Prisma } from "../../../generated/prisma/client"

export async function inspectCustomerLedgerSettlementHistory(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    accountId: string
    sourceEntryId: string
    sourceSequence: bigint
    currentSequence: bigint
    sourceAdvanceAccountId?: string
    sourceReceivableAccountId?: string
  },
) {
  const [proof] = await tx.$queryRaw<
    Array<{ invalidCount: bigint; latestEffectiveAt: Date | null }>
  >`
    WITH targets AS (
      SELECT allocation.id AS allocation_id, allocation."amountMinor" AS amount,
        allocation.sequence AS target_sequence,
        allocation."creditEntryId" AS credit_id,
        allocation."chargeEntryId" AS charge_id,
        charge.kind AS charge_kind, charge."sourceKind" AS charge_source_kind,
        charge."sourceId" AS charge_source_id,
        charge."amountMinor" AS charge_amount,
        charge.side AS charge_side, charge."effectiveAt" AS charge_effective_at
      FROM "CustomerLedgerAllocation" allocation
      JOIN "CustomerLedgerEntry" charge
        ON charge.id = allocation."chargeEntryId"
        AND charge."accountId" = allocation."accountId"
      WHERE allocation."accountId" = ${input.accountId}
        AND (allocation."creditEntryId" = ${input.sourceEntryId}
          OR allocation."chargeEntryId" = ${input.sourceEntryId})
    ), target_releases AS (
      SELECT release.id AS release_id, release."allocationId" AS allocation_id,
        release.sequence, release."amountMinor" AS amount,
        release."actorUserId" AS actor_id
      FROM "CustomerLedgerAllocationRelease" release
      JOIN targets ON targets.allocation_id = release."allocationId"
    ), release_totals AS (
      SELECT allocation_id, SUM(amount) AS amount, COUNT(*) AS count
      FROM target_releases GROUP BY allocation_id
    ), journal_shapes AS (
      SELECT journal.id, journal."sourceKind" AS source_kind,
        journal."sourceId" AS source_id, journal."reversalOfId" AS reversal_of_id,
        journal."effectiveAt" AS effective_at,
        COUNT(line.id) AS line_count,
        COALESCE(SUM(line."debitMinor"), 0) AS debit_total,
        COALESCE(SUM(line."creditMinor"), 0) AS credit_total,
        COALESCE(SUM(line."debitMinor") FILTER (
          WHERE account.kind = 'LIABILITY' AND account.purpose = 'CUSTOMER_ADVANCE'
        ), 0) AS advance_debit,
        COALESCE(SUM(line."creditMinor") FILTER (
          WHERE account.kind = 'LIABILITY' AND account.purpose = 'CUSTOMER_ADVANCE'
        ), 0) AS advance_credit,
        MAX(account.id) FILTER (
          WHERE account.kind = 'LIABILITY' AND account.purpose = 'CUSTOMER_ADVANCE'
        ) AS advance_account_id,
        COALESCE(SUM(line."debitMinor") FILTER (
          WHERE account.kind = 'ASSET' AND account.purpose = 'RECEIVABLE'
        ), 0) AS receivable_debit,
        COALESCE(SUM(line."creditMinor") FILTER (
          WHERE account.kind = 'ASSET' AND account.purpose = 'RECEIVABLE'
        ), 0) AS receivable_credit,
        MAX(account.id) FILTER (
          WHERE account.kind = 'ASSET' AND account.purpose = 'RECEIVABLE'
        ) AS receivable_account_id,
        COALESCE(SUM(line."debitMinor") FILTER (
          WHERE account.kind = 'ASSET' AND account.purpose IN ('CASH', 'BANK', 'CLEARING')
        ), 0) AS money_debit,
        COALESCE(SUM(line."creditMinor") FILTER (
          WHERE account.kind = 'ASSET' AND account.purpose IN ('CASH', 'BANK', 'CLEARING')
        ), 0) AS money_credit
      FROM "FinanceJournalEntry" journal
      LEFT JOIN "FinanceJournalLine" line
        ON line."bookId" = journal."bookId" AND line."entryId" = journal.id
      LEFT JOIN "FinanceAccount" account
        ON account."bookId" = line."bookId" AND account.id = line."accountId"
      WHERE journal."bookId" = ${input.bookId}
        AND (
          (journal."sourceKind" = 'CUSTOMER_CREDIT_ALLOCATION'
            AND journal."sourceId" IN (SELECT allocation_id FROM targets))
          OR (journal."sourceKind" = 'CUSTOMER_ALLOCATION_RELEASE'
            AND journal."sourceId" IN (SELECT release_id FROM target_releases))
          OR (journal."sourceKind" = 'CUSTOMER_HELD_CREDIT_REFUND'
            AND journal."sourceId" IN (
              SELECT charge_id FROM targets WHERE charge_kind = 'REFUND'
            ))
          OR (journal."sourceKind" = 'CUSTOMER_LEDGER_REVERSAL'
            AND journal."reversalOfId" IN (
              SELECT original.id
              FROM "FinanceJournalEntry" original
              JOIN targets ON targets.charge_id = original."sourceId"
              WHERE original."bookId" = ${input.bookId}
                AND original."sourceKind" = 'CUSTOMER_HELD_CREDIT_REFUND'
            ))
        )
      GROUP BY journal.id
    ), refund_reversal_links AS (
      SELECT target_releases.release_id, target_releases.allocation_id,
        original."effectiveAt" AS original_at,
        reversal."effectiveAt" AS reversal_at,
        CASE WHEN original.id IS NOT NULL AND reversal.id IS NOT NULL
          AND ledger_reversal.id IS NOT NULL
          AND (SELECT COUNT(*) FROM "CustomerLedgerAllocation" bridge
            WHERE bridge."accountId" = ${input.accountId}
              AND bridge.sequence = target_releases.sequence
              AND bridge."creditEntryId" = ledger_reversal.id
              AND bridge."chargeEntryId" = targets.charge_id
              AND bridge."amountMinor" = target_releases.amount) = 1
          AND target_releases.amount = targets.amount
          AND target_releases.sequence > targets.target_sequence
          AND target_releases.sequence <= ${input.currentSequence}
          AND COALESCE(release_totals.count, 0) = 1
          AND target_releases.actor_id = ledger_reversal."actorUserId"
          AND original."effectiveAt" = targets.charge_effective_at
          AND original."reversalOfId" IS NULL
          AND reversal."effectiveAt" >= original."effectiveAt"
          AND reversal."reversalOfId" = original.id
          AND ledger_reversal.sequence = target_releases.sequence
          AND ledger_reversal."effectiveAt" = reversal."effectiveAt"
          AND journal_shape.line_count = 2
          AND journal_shape.advance_credit = targets.amount
          AND journal_shape.money_debit = targets.amount
          AND journal_shape.debit_total = targets.amount
          AND journal_shape.credit_total = targets.amount
          AND EXISTS (
            SELECT 1
            FROM "FinanceJournalLine" old_line
            JOIN "FinanceAccount" old_account
              ON old_account."bookId" = old_line."bookId"
              AND old_account.id = old_line."accountId"
            JOIN "FinanceJournalLine" new_line
              ON new_line."bookId" = reversal."bookId"
              AND new_line."entryId" = reversal.id
              AND new_line."accountId" = old_line."accountId"
            WHERE old_line."bookId" = original."bookId"
              AND old_line."entryId" = original.id
              AND old_account.kind = 'ASSET'
              AND old_account.purpose IN ('CASH', 'BANK', 'CLEARING')
              AND old_line."creditMinor" = targets.amount
              AND old_line."debitMinor" = 0
              AND new_line."debitMinor" = targets.amount
              AND new_line."creditMinor" = 0
          )
          AND EXISTS (
            SELECT 1
            FROM "FinanceJournalLine" old_advance
            JOIN "FinanceJournalLine" new_advance
              ON new_advance."bookId" = reversal."bookId"
              AND new_advance."entryId" = reversal.id
              AND new_advance."accountId" = old_advance."accountId"
            JOIN "FinanceAccount" control
              ON control."bookId" = old_advance."bookId"
              AND control.id = old_advance."accountId"
            WHERE old_advance."bookId" = original."bookId"
              AND old_advance."entryId" = original.id
              AND control.kind = 'LIABILITY'
              AND control.purpose = 'CUSTOMER_ADVANCE'
              AND old_advance."debitMinor" = targets.amount
              AND old_advance."creditMinor" = 0
              AND new_advance."creditMinor" = targets.amount
              AND new_advance."debitMinor" = 0
              AND (${input.sourceAdvanceAccountId ?? ""} = ''
                OR old_advance."accountId" = ${input.sourceAdvanceAccountId ?? ""})
          ) THEN TRUE ELSE FALSE END AS valid
      FROM target_releases
      JOIN targets ON targets.allocation_id = target_releases.allocation_id
      LEFT JOIN release_totals ON release_totals.allocation_id = targets.allocation_id
      LEFT JOIN "FinanceJournalEntry" original
        ON original."bookId" = ${input.bookId}
        AND original."sourceKind" = 'CUSTOMER_HELD_CREDIT_REFUND'
        AND original."sourceId" = targets.charge_id
      LEFT JOIN "FinanceJournalEntry" reversal
        ON reversal."reversalOfId" = original.id
        AND reversal."bookId" = ${input.bookId}
        AND reversal."sourceKind" = 'CUSTOMER_LEDGER_REVERSAL'
      LEFT JOIN "CustomerLedgerEntry" ledger_reversal
        ON ledger_reversal.id = reversal."sourceId"
        AND ledger_reversal."tenantId" = ${input.tenantId}
        AND ledger_reversal."accountId" = ${input.accountId}
        AND ledger_reversal.kind = 'REVERSAL'
        AND ledger_reversal.side = 'CREDIT'
        AND ledger_reversal."amountMinor" = targets.amount
        AND ledger_reversal."sourceKind" = 'CUSTOMER_LEDGER_REVERSAL'
        AND ledger_reversal."sourceId" = targets.charge_id
        AND ledger_reversal."reversalOfId" = targets.charge_id
        AND ledger_reversal."effectiveAt" = reversal."effectiveAt"
      LEFT JOIN journal_shapes journal_shape
        ON journal_shape.id = reversal.id
    ), allocation_proof AS (
      SELECT targets.allocation_id, targets.amount,
        allocation_journal.advance_account_id,
        allocation_journal.receivable_account_id,
        COALESCE(release_totals.amount, 0) AS released,
        COALESCE(release_totals.count, 0) AS release_count,
        CASE WHEN targets.charge_kind = 'REFUND' THEN
          targets.charge_source_kind = 'CUSTOMER_HELD_CREDIT_REFUND'
          AND targets.charge_source_id = targets.charge_id
          AND targets.charge_side = 'DEBIT'
          AND targets.charge_amount = targets.amount
          AND refund_journal.id IS NOT NULL
          AND refund_journal.reversal_of_id IS NULL
          AND refund_journal.effective_at = targets.charge_effective_at
          AND refund_journal.line_count = 2
          AND refund_journal.advance_debit = targets.amount
          AND refund_journal.money_credit = targets.amount
          AND refund_journal.debit_total = targets.amount
          AND refund_journal.credit_total = targets.amount
          AND (${input.sourceAdvanceAccountId ?? ""} = ''
            OR refund_journal.advance_account_id = ${input.sourceAdvanceAccountId ?? ""})
          AND targets.target_sequence > ${input.sourceSequence}
          AND targets.target_sequence <= ${input.currentSequence}
          AND (
            (COALESCE(release_totals.count, 0) = 0
              AND refund_journal.reversal_of_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM "FinanceJournalEntry" reversal
                WHERE reversal."reversalOfId" = refund_journal.id
              ))
            OR
            (COALESCE(release_totals.count, 0) = 1
              AND EXISTS (
                SELECT 1 FROM refund_reversal_links link
                WHERE link.allocation_id = targets.allocation_id
                  AND link.valid
              ))
          )
        ELSE (
          allocation_journal.id IS NOT NULL
          AND allocation_journal.reversal_of_id IS NULL
          AND allocation_journal.line_count = 2
          AND allocation_journal.advance_debit = targets.amount
          AND allocation_journal.receivable_credit = targets.amount
          AND allocation_journal.debit_total = targets.amount
          AND allocation_journal.credit_total = targets.amount
          AND targets.target_sequence > ${input.sourceSequence}
          AND targets.target_sequence <= ${input.currentSequence}
          AND (${input.sourceAdvanceAccountId ?? ""} = ''
            OR allocation_journal.advance_account_id = ${input.sourceAdvanceAccountId ?? ""})
          AND (${input.sourceReceivableAccountId ?? ""} = ''
            OR allocation_journal.receivable_account_id = ${input.sourceReceivableAccountId ?? ""})
          AND NOT EXISTS (
            SELECT 1 FROM "FinanceJournalEntry" reversal
            WHERE reversal."reversalOfId" = allocation_journal.id
          )
        ) END AS posting_valid,
        CASE WHEN targets.charge_kind = 'REFUND'
          THEN refund_journal.effective_at
          ELSE allocation_journal.effective_at
        END AS allocation_at
      FROM targets
      LEFT JOIN release_totals ON release_totals.allocation_id = targets.allocation_id
      LEFT JOIN journal_shapes allocation_journal
        ON allocation_journal.source_kind = 'CUSTOMER_CREDIT_ALLOCATION'
        AND allocation_journal.source_id = targets.allocation_id
      LEFT JOIN journal_shapes refund_journal
        ON refund_journal.source_kind = 'CUSTOMER_HELD_CREDIT_REFUND'
        AND refund_journal.source_id = targets.charge_id
    ), release_proof AS (
      SELECT target_releases.release_id,
        CASE WHEN targets.charge_kind = 'REFUND' THEN EXISTS (
          SELECT 1 FROM refund_reversal_links link
          WHERE link.release_id = target_releases.release_id AND link.valid
        ) ELSE (
          release_journal.id IS NOT NULL
          AND release_journal.reversal_of_id IS NULL
          AND release_journal.line_count = 2
          AND release_journal.receivable_debit = target_releases.amount
          AND release_journal.advance_credit = target_releases.amount
          AND release_journal.debit_total = target_releases.amount
          AND release_journal.credit_total = target_releases.amount
          AND release_journal.advance_account_id = allocation_proof.advance_account_id
          AND release_journal.receivable_account_id = allocation_proof.receivable_account_id
          AND target_releases.sequence > targets.target_sequence
          AND target_releases.sequence <= ${input.currentSequence}
          AND NOT EXISTS (
            SELECT 1 FROM "FinanceJournalEntry" reversal
            WHERE reversal."reversalOfId" = release_journal.id
          )
        ) END AS valid,
        CASE WHEN targets.charge_kind = 'REFUND'
          THEN refund_reversal."effectiveAt"
          ELSE release_journal.effective_at
        END AS release_at
      FROM target_releases
      JOIN targets ON targets.allocation_id = target_releases.allocation_id
      JOIN allocation_proof
        ON allocation_proof.allocation_id = target_releases.allocation_id
      LEFT JOIN journal_shapes release_journal
        ON release_journal.source_kind = 'CUSTOMER_ALLOCATION_RELEASE'
        AND release_journal.source_id = target_releases.release_id
      LEFT JOIN "FinanceJournalEntry" original_refund
        ON original_refund."bookId" = ${input.bookId}
        AND original_refund."sourceKind" = 'CUSTOMER_HELD_CREDIT_REFUND'
        AND original_refund."sourceId" = targets.charge_id
      LEFT JOIN "FinanceJournalEntry" refund_reversal
        ON refund_reversal."reversalOfId" = original_refund.id
        AND refund_reversal."bookId" = ${input.bookId}
        AND refund_reversal."sourceKind" = 'CUSTOMER_LEDGER_REVERSAL'
    ), invalid_counts AS (
      SELECT COUNT(*)::bigint AS amount FROM allocation_proof
      WHERE posting_valid IS NOT TRUE OR released <> amount
      UNION ALL
      SELECT COUNT(*)::bigint AS amount FROM release_proof WHERE valid IS NOT TRUE
    ), dates AS (
      SELECT allocation_at AS value FROM allocation_proof
      UNION ALL SELECT release_at FROM release_proof
    )
    SELECT COALESCE((SELECT SUM(amount) FROM invalid_counts), 0)::bigint AS "invalidCount",
      (SELECT MAX(value) FROM dates) AS "latestEffectiveAt"
  `

  return proof ?? { invalidCount: BigInt(1), latestEffectiveAt: null }
}
