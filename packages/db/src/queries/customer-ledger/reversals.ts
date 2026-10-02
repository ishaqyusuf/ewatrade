import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postFinanceJournalInTransaction } from "../finance/posting"
import { FinanceError, assertFinancePostingDate } from "../finance/rules"
import { customerLedgerDocumentCommand } from "./commands"
import { inspectCustomerLedgerSettlementHistory } from "./reversal-settlements"
import {
  assertExactHeldCreditSource,
  lineMatches,
  postingLinesMatch,
} from "./reversal-sources"

type ReverseCustomerLedgerEntryInput = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
  entryId: string
  expectedRevision: string
  reason: string
  effectiveAt: Date
}

const zero = BigInt(0)
const revisionPattern = /^(0|[1-9]\d{0,18})$/

function opposite(side: "DEBIT" | "CREDIT") {
  return side === "DEBIT" ? "CREDIT" : "DEBIT"
}

/**
 * Append an immutable full reversal of a supported customer-ledger source.
 * Commerce Order refunds and Order settlements remain owned by Commerce.
 */
export async function reverseCustomerLedgerEntry(
  db: PrismaClient,
  input: ReverseCustomerLedgerEntryInput,
) {
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !revisionPattern.test(input.expectedRevision) ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128 ||
    !input.entryId.trim() ||
    !Number.isFinite(input.effectiveAt.getTime())
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A reviewed revision, reason, effective date and stable command are required.",
    )

  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return db.$transaction(
    (tx) =>
      customerLedgerDocumentCommand(
        tx,
        input,
        "REVERSE_ENTRY",
        { ...payload, reason },
        async (book, account) => {
          if (account.revision !== BigInt(input.expectedRevision))
            throw new FinanceError(
              "CONFLICT",
              "The customer account changed. Review its current balance before reversing this entry.",
            )

          const source = await tx.customerLedgerEntry.findFirst({
            where: {
              id: input.entryId,
              tenantId: input.tenantId,
              accountId: account.id,
              kind: {
                in: ["OPENING_DEBT", "OPENING_CREDIT", "RECEIPT", "REFUND"],
              },
              reversals: { none: {} },
            },
          })
          if (!source)
            throw new FinanceError(
              "NOT_FOUND",
              "This posted customer entry is unavailable for reversal.",
            )

          const opening = source.kind.startsWith("OPENING_")
          const receipt = source.kind === "RECEIPT"
          const heldRefund = source.kind === "REFUND"
          if (
            (opening && source.sourceKind !== "CUSTOMER_OPENING") ||
            (receipt &&
              (source.side !== "CREDIT" ||
                source.sourceKind !== "CUSTOMER_RECEIPT")) ||
            (heldRefund &&
              (source.side !== "DEBIT" ||
                source.sourceKind !== "CUSTOMER_HELD_CREDIT_REFUND" ||
                source.sourceId !== source.id))
          )
            throw new FinanceError(
              "CONFLICT",
              "The customer entry source does not match a supported posted source.",
            )

          const receiptSource = receipt
            ? await tx.customerLedgerReceipt.findFirst({
                where: {
                  id: source.sourceId,
                  entryId: source.id,
                  accountId: account.id,
                  bookId: book.id,
                },
              })
            : null
          if (receipt && !receiptSource)
            throw new FinanceError(
              "CONFLICT",
              "The receipt provenance does not match this customer entry.",
            )

          const expectedOpeningId = source.side === "DEBIT" ? "DEBT" : "CREDIT"
          if (
            opening &&
            source.sourceId !== `${account.id}:${expectedOpeningId}`
          )
            throw new FinanceError(
              "CONFLICT",
              "The opening entry source does not match its direction.",
            )

          const posting = await tx.financeJournalEntry.findUnique({
            where: {
              bookId_sourceKind_sourceId: {
                bookId: book.id,
                sourceKind: opening
                  ? "CUSTOMER_LEDGER_OPENING"
                  : receipt
                    ? "CUSTOMER_RECEIPT"
                    : "CUSTOMER_HELD_CREDIT_REFUND",
                sourceId: opening ? source.id : source.sourceId,
              },
            },
            include: {
              reversal: { select: { id: true } },
              lines: {
                include: {
                  account: {
                    select: { id: true, kind: true, purpose: true },
                  },
                },
              },
            },
          })
          if (
            !posting ||
            posting.reversalOfId !== null ||
            posting.reversal ||
            posting.effectiveAt.getTime() !== source.effectiveAt.getTime()
          )
            throw new FinanceError(
              "CONFLICT",
              "Reconcile the original customer journal before reversing it.",
            )

          const amount = source.amountMinor
          const advance = posting.lines.find(
            (line) =>
              line.account.kind === "LIABILITY" &&
              line.account.purpose === "CUSTOMER_ADVANCE",
          )
          const receivable = posting.lines.find(
            (line) =>
              line.account.kind === "ASSET" &&
              line.account.purpose === "RECEIVABLE",
          )
          let heldRefundAllocationId: string | null = null
          let sourceIsValid = false
          if (source.kind === "OPENING_DEBT") {
            sourceIsValid =
              source.side === "DEBIT" &&
              postingLinesMatch(posting.lines, [
                {
                  kind: "ASSET",
                  purpose: "RECEIVABLE",
                  side: "DEBIT",
                  amount,
                },
                {
                  kind: "EQUITY",
                  purpose: "OPENING_EQUITY",
                  side: "CREDIT",
                  amount,
                },
              ])
          } else if (source.kind === "OPENING_CREDIT") {
            sourceIsValid =
              source.side === "CREDIT" &&
              postingLinesMatch(posting.lines, [
                {
                  kind: "LIABILITY",
                  purpose: "CUSTOMER_ADVANCE",
                  side: "CREDIT",
                  amount,
                },
                {
                  kind: "EQUITY",
                  purpose: "OPENING_EQUITY",
                  side: "DEBIT",
                  amount,
                },
              ])
          } else if (receipt) {
            const moneyLine = posting.lines.find(
              (line) => line.accountId === receiptSource?.moneyAccountId,
            )
            sourceIsValid =
              !!receiptSource &&
              !!advance &&
              !!moneyLine &&
              source.side === "CREDIT" &&
              posting.lines.length === 2 &&
              lineMatches(moneyLine, {
                accountId: receiptSource.moneyAccountId,
                kind: "ASSET",
                purpose: moneyLine.account.purpose,
                side: "DEBIT",
                amount,
              }) &&
              ["CASH", "BANK", "CLEARING"].includes(
                moneyLine.account.purpose,
              ) &&
              lineMatches(advance, {
                accountId: advance.accountId,
                kind: "LIABILITY",
                purpose: "CUSTOMER_ADVANCE",
                side: "CREDIT",
                amount,
              })
          } else {
            const allocations = await tx.customerLedgerAllocation.findMany({
              where: {
                accountId: account.id,
                chargeEntryId: source.id,
              },
              take: 2,
              include: {
                releases: { take: 1 },
                _count: { select: { releases: true } },
                orderSettlement: { select: { id: true } },
              },
            })
            const creditIds = [
              ...new Set(allocations.map((row) => row.creditEntryId)),
            ]
            const credits = creditIds.length
              ? await tx.customerLedgerEntry.findMany({
                  where: {
                    id: { in: creditIds },
                    accountId: account.id,
                    side: "CREDIT",
                    kind: { in: ["OPENING_CREDIT", "RECEIPT"] },
                    reversals: { none: {} },
                  },
                })
              : []
            const refundCredit = credits.length === 1 ? credits[0] : null
            const allocation = allocations.length === 1 ? allocations[0] : null
            heldRefundAllocationId = allocation?.id ?? null
            const creditIsExact =
              !!refundCredit &&
              !!advance &&
              (await assertExactHeldCreditSource(
                tx,
                { bookId: book.id, accountId: account.id },
                refundCredit,
                advance.accountId,
              )) &&
              refundCredit.effectiveAt <= source.effectiveAt
            const moneyLine = posting.lines.find(
              (line) =>
                line.account.kind === "ASSET" &&
                ["CASH", "BANK", "CLEARING"].includes(line.account.purpose) &&
                line.creditMinor === amount &&
                line.debitMinor === zero,
            )
            sourceIsValid =
              source.side === "DEBIT" &&
              !!advance &&
              !!allocation &&
              allocation.amountMinor === amount &&
              allocation.sequence === source.sequence &&
              allocation.releases.length === 0 &&
              allocation._count.releases === 0 &&
              !allocation.orderSettlement &&
              !!refundCredit &&
              creditIsExact &&
              !!moneyLine &&
              postingLinesMatch(posting.lines, [
                {
                  accountId: advance.accountId,
                  kind: "LIABILITY",
                  purpose: "CUSTOMER_ADVANCE",
                  side: "DEBIT",
                  amount,
                },
                {
                  accountId: moneyLine.accountId,
                  kind: "ASSET",
                  purpose: moneyLine.account.purpose,
                  side: "CREDIT",
                  amount,
                },
              ])
          }
          if (!sourceIsValid)
            throw new FinanceError(
              "CONFLICT",
              "The original source journal does not exactly back this customer entry.",
            )

          let latestRelatedAt = posting.effectiveAt
          if (heldRefund) {
            if (!heldRefundAllocationId)
              throw new FinanceError(
                "CONFLICT",
                "The held refund no longer has its exact original credit allocation.",
              )
          } else {
            const settlementProof =
              await inspectCustomerLedgerSettlementHistory(tx, {
                tenantId: input.tenantId,
                bookId: book.id,
                accountId: account.id,
                sourceEntryId: source.id,
                sourceSequence: source.sequence,
                currentSequence: account.lastSequence,
                sourceAdvanceAccountId: advance?.accountId,
                sourceReceivableAccountId:
                  source.kind === "OPENING_DEBT"
                    ? receivable?.accountId
                    : undefined,
              })
            if (settlementProof.invalidCount > BigInt(0))
              throw new FinanceError(
                "CONFLICT",
                "Reconcile every customer allocation and release before reversing its source.",
              )
            if (
              settlementProof.latestEffectiveAt &&
              settlementProof.latestEffectiveAt > latestRelatedAt
            )
              latestRelatedAt = settlementProof.latestEffectiveAt
          }
          if (input.effectiveAt < latestRelatedAt)
            throw new FinanceError(
              "INVALID_JOURNAL",
              "A customer source cannot be reversed before its latest settlement posting.",
            )

          assertFinancePostingDate({
            effectiveAt: input.effectiveAt,
            startsAt: book.startsAt,
            closedThrough: book.closedThrough,
            now: new Date(),
          })

          const updated = await tx.customerLedgerAccount.update({
            where: { id: account.id },
            data: {
              lastSequence: { increment: 1 },
              revision: { increment: 1 },
            },
          })
          const reversal = await tx.customerLedgerEntry.create({
            data: {
              tenantId: input.tenantId,
              accountId: account.id,
              sequence: updated.lastSequence,
              kind: "REVERSAL",
              side: opposite(source.side),
              amountMinor: amount,
              sourceKind: "CUSTOMER_LEDGER_REVERSAL",
              sourceId: source.id,
              storeId: source.storeId,
              actorUserId: input.actorUserId,
              effectiveAt: input.effectiveAt,
              description: `Reverse ${source.kind.toLowerCase().replaceAll("_", " ")}: ${reason}`,
              reversalOfId: source.id,
            },
            select: { id: true },
          })

          let refundReleaseId: string | null = null
          let bridgeAllocationId: string | null = null
          if (heldRefund) {
            if (!heldRefundAllocationId)
              throw new FinanceError(
                "CONFLICT",
                "The held refund allocation is unavailable.",
              )
            const released = await tx.customerLedgerAllocationRelease.create({
              data: {
                allocationId: heldRefundAllocationId,
                sequence: updated.lastSequence,
                amountMinor: amount,
                reason: `Reverse held-fund refund: ${reason}`,
                actorUserId: input.actorUserId,
              },
              select: { id: true },
            })
            refundReleaseId = released.id
            const bridge = await tx.customerLedgerAllocation.create({
              data: {
                accountId: account.id,
                sequence: updated.lastSequence,
                creditEntryId: reversal.id,
                chargeEntryId: source.id,
                amountMinor: amount,
                actorUserId: input.actorUserId,
              },
              select: { id: true },
            })
            bridgeAllocationId = bridge.id
          } else {
            const bridge = await tx.customerLedgerAllocation.create({
              data: {
                accountId: account.id,
                sequence: updated.lastSequence,
                creditEntryId:
                  source.side === "CREDIT" ? source.id : reversal.id,
                chargeEntryId:
                  source.side === "CREDIT" ? reversal.id : source.id,
                amountMinor: amount,
                actorUserId: input.actorUserId,
              },
              select: { id: true },
            })
            bridgeAllocationId = bridge.id
          }

          await postFinanceJournalInTransaction(tx, {
            ...input,
            clientCommandId: financePostingCommandId(
              `customer-ledger:${input.clientCommandId}`,
              "reverse-entry",
            ),
            sourceKind: "CUSTOMER_LEDGER_REVERSAL",
            sourceId: reversal.id,
            description: `Reverse customer ${source.kind.toLowerCase().replaceAll("_", " ")}: ${reason}`,
            effectiveAt: input.effectiveAt,
            storeId: source.storeId ?? undefined,
            reversalOfId: posting.id,
            lines: posting.lines.map((line) => ({
              accountId: line.accountId,
              side: line.debitMinor > zero ? "CREDIT" : "DEBIT",
              amountMinor: (line.debitMinor + line.creditMinor).toString(),
            })),
          })
          const reversalJournal = await tx.financeJournalEntry.findUnique({
            where: {
              bookId_sourceKind_sourceId: {
                bookId: book.id,
                sourceKind: "CUSTOMER_LEDGER_REVERSAL",
                sourceId: reversal.id,
              },
            },
            select: { id: true, reversalOfId: true },
          })
          if (!reversalJournal || reversalJournal.reversalOfId !== posting.id)
            throw new FinanceError(
              "CONFLICT",
              "The reversal journal result could not be recovered.",
            )

          return {
            id: reversal.id,
            audit: {
              sourceEntryId: source.id,
              sourceJournalEntryId: posting.id,
              reversalJournalEntryId: reversalJournal.id,
              bridgeAllocationId,
              refundReleaseId,
              reason,
              effectiveAt: input.effectiveAt.toISOString(),
              amountMinor: amount.toString(),
            },
          }
        },
      ),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
