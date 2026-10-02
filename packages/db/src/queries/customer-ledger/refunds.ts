import { randomUUID } from "node:crypto"
import type {
  CommercialPaymentMethod,
  PrismaClient,
} from "../../../generated/prisma/client"
import type { FinanceActor } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postFinanceJournalInTransaction } from "../finance/posting"
import { FinanceError, financeAmount } from "../finance/rules"
import { customerLedgerDocumentCommand } from "./commands"

/** Return only unused held funds; applying credit to a charge must be released first. */
export async function refundCustomerLedgerCredit(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId: string
    clientCommandId: string
    expectedRevision: string
    creditEntryId: string
    amountMinor: string
    moneyAccountId: string
    method: CommercialPaymentMethod
    reference?: string
    reason: string
    effectiveAt: Date
  },
) {
  const amount = financeAmount(input.amountMinor)
  const reason = input.reason.trim()
  const reference = input.reference?.trim() || null
  if (
    !reason ||
    reason.length > 400 ||
    (reference?.length ?? 0) > 160 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"].includes(input.method) ||
    !Number.isFinite(input.effectiveAt.getTime())
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the customer balance and supply a valid refund method, date and reason.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return db.$transaction(
    (tx) =>
      customerLedgerDocumentCommand(
        tx,
        input,
        "REFUND_HELD_CREDIT",
        { ...payload, reason, reference },
        async (book, account) => {
          if (account.revision !== BigInt(input.expectedRevision))
            throw new FinanceError(
              "CONFLICT",
              "The customer account changed. Review available funds before returning money.",
            )
          const credit = await tx.customerLedgerEntry.findFirst({
            where: {
              id: input.creditEntryId,
              accountId: account.id,
              side: "CREDIT",
              kind: { in: ["OPENING_CREDIT", "RECEIPT"] },
              reversals: { none: {} },
            },
          })
          if (!credit)
            throw new FinanceError(
              "NOT_FOUND",
              "Held credit not found in this customer account.",
            )
          if (input.effectiveAt < credit.effectiveAt)
            throw new FinanceError(
              "INVALID_JOURNAL",
              "Money cannot be returned before its credit was recorded.",
            )
          // Verify that the selected subledger credit really controls held funds in this book.
          const source =
            credit.kind === "RECEIPT"
              ? { sourceKind: "CUSTOMER_RECEIPT", sourceId: credit.sourceId }
              : { sourceKind: "CUSTOMER_LEDGER_OPENING", sourceId: credit.id }
          const posting = await tx.financeJournalEntry.findUnique({
            where: {
              bookId_sourceKind_sourceId: { bookId: book.id, ...source },
            },
            include: {
              reversal: { select: { id: true } },
              lines: {
                include: { account: { select: { purpose: true, kind: true } } },
              },
            },
          })
          const heldPosting = posting?.lines.reduce(
            (sum, line) =>
              line.account.purpose === "CUSTOMER_ADVANCE" &&
              line.account.kind === "LIABILITY"
                ? sum + line.creditMinor - line.debitMinor
                : sum,
            BigInt(0),
          )
          const receipt =
            credit.kind === "RECEIPT"
              ? await tx.customerLedgerReceipt.findFirst({
                  where: {
                    id: credit.sourceId,
                    entryId: credit.id,
                    accountId: account.id,
                    bookId: book.id,
                  },
                  select: { id: true },
                })
              : null
          if (
            !posting ||
            posting.reversal ||
            heldPosting !== credit.amountMinor ||
            (credit.kind === "RECEIPT" &&
              (credit.sourceKind !== "CUSTOMER_RECEIPT" || !receipt)) ||
            (credit.kind === "OPENING_CREDIT" &&
              (credit.sourceKind !== "CUSTOMER_OPENING" ||
                credit.sourceId !== `${account.id}:CREDIT`))
          )
            throw new FinanceError(
              "CONFLICT",
              "Reconcile the customer's held-credit posting before returning money.",
            )
          const [allocated, released, money, advance] = await Promise.all([
            tx.customerLedgerAllocation.aggregate({
              where: { accountId: account.id, creditEntryId: credit.id },
              _sum: { amountMinor: true },
            }),
            tx.customerLedgerAllocationRelease.aggregate({
              where: {
                allocation: { accountId: account.id, creditEntryId: credit.id },
              },
              _sum: { amountMinor: true },
            }),
            tx.financeAccount.findFirst({
              where: {
                id: input.moneyAccountId,
                bookId: book.id,
                kind: "ASSET",
                purpose: { in: ["CASH", "BANK", "CLEARING"] },
                archivedAt: null,
              },
            }),
            tx.financeAccount.findFirst({
              where: {
                bookId: book.id,
                kind: "LIABILITY",
                purpose: "CUSTOMER_ADVANCE",
                archivedAt: null,
              },
            }),
          ])
          const used =
            (allocated._sum.amountMinor ?? BigInt(0)) -
            (released._sum.amountMinor ?? BigInt(0))
          if (used < BigInt(0) || amount > credit.amountMinor - used)
            throw new FinanceError(
              "CONFLICT",
              "Refund exceeds unused held credit. Release any charge allocations first.",
            )
          if (!money || !advance)
            throw new FinanceError(
              "NOT_FOUND",
              "Choose an active money account in this financial book.",
            )
          if (
            (input.method === "CASH" && money.purpose !== "CASH") ||
            (input.method === "BANK_TRANSFER" && money.purpose !== "BANK") ||
            (["CARD", "POS"].includes(input.method) && money.purpose === "CASH")
          )
            throw new FinanceError(
              "INVALID_JOURNAL",
              "The money account does not match the refund method.",
            )
          const updated = await tx.customerLedgerAccount.update({
            where: { id: account.id },
            data: {
              revision: { increment: 1 },
              lastSequence: { increment: 1 },
            },
          })
          const refundId = randomUUID()
          const entry = await tx.customerLedgerEntry.create({
            data: {
              id: refundId,
              tenantId: input.tenantId,
              accountId: account.id,
              sequence: updated.lastSequence,
              kind: "REFUND",
              side: "DEBIT",
              amountMinor: amount,
              sourceKind: "CUSTOMER_HELD_CREDIT_REFUND",
              sourceId: refundId,
              actorUserId: input.actorUserId,
              effectiveAt: input.effectiveAt,
              description: `Customer funds returned: ${reason}`,
            },
            select: { id: true },
          })
          await tx.customerLedgerAllocation.create({
            data: {
              accountId: account.id,
              sequence: updated.lastSequence,
              creditEntryId: credit.id,
              chargeEntryId: entry.id,
              amountMinor: amount,
              actorUserId: input.actorUserId,
            },
          })
          await postFinanceJournalInTransaction(tx, {
            ...input,
            clientCommandId: financePostingCommandId(
              `customer-ledger:${input.clientCommandId}`,
              "held-credit-refund",
            ),
            sourceKind: "CUSTOMER_HELD_CREDIT_REFUND",
            sourceId: entry.id,
            description: `Return held customer funds: ${reason}`,
            effectiveAt: input.effectiveAt,
            lines: [
              {
                accountId: advance.id,
                side: "DEBIT",
                amountMinor: amount.toString(),
              },
              {
                accountId: money.id,
                side: "CREDIT",
                amountMinor: amount.toString(),
              },
            ],
          })
          return {
            id: entry.id,
            audit: {
              creditEntryId: credit.id,
              moneyAccountId: money.id,
              method: input.method,
              reference,
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
