import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

type BankCorrectionTarget =
  | { kind: "MONEY"; entryId: string }
  | { kind: "BILL"; billId: string; paymentId?: string }
  | {
      kind: "PURCHASE"
      billId: string
      paymentId?: string
      payment?: {
        id: string
        supplierId: string
        amountMinor: string
        effectiveAt: Date
        description: string
        reversedAt: Date | null
        reversed: boolean
        reversalEffectiveAt: Date | null
        latestEffectiveAt: Date
      }
    }
  | {
      kind: "SUPPLIER"
      supplierId: string
      supplierEntryId: string
      entryKind: string
      amountMinor: string
      effectiveAt: Date
      description: string
      reversal: { id: string; effectiveAt: Date } | null
    }
  | {
      kind: "CUSTOMER"
      customerId: string
      accountId: string
      entryId: string
    }
  | { kind: "UNAVAILABLE"; reason: string }

type PostedEntry = {
  description: string
  effectiveAt: Date
  sequence: string
  amountMinor: string
}

function unavailable(reason: string): BankCorrectionTarget {
  return { kind: "UNAVAILABLE", reason }
}

function invalidSource(): never {
  throw new FinanceError(
    "CONFLICT",
    "The selected bank posting has inconsistent source evidence.",
  )
}

async function getEntry(
  tx: Prisma.TransactionClient,
  input: {
    bookId: string
    entryId: string
    accountId: string
    watermark: bigint
  },
) {
  return tx.financeJournalEntry.findFirst({
    where: {
      id: input.entryId,
      bookId: input.bookId,
      sequence: { lte: input.watermark },
      lines: { some: { bookId: input.bookId, accountId: input.accountId } },
    },
    include: {
      lines: {
        where: { bookId: input.bookId, accountId: input.accountId },
        take: 101,
      },
    },
  })
}

function selectedAmount(
  lines: Array<{ debitMinor: bigint; creditMinor: bigint }>,
) {
  if (
    lines.length === 0 ||
    lines.length > 100 ||
    lines.some(
      (line) =>
        line.debitMinor < 0n ||
        line.creditMinor < 0n ||
        line.debitMinor > 0n === line.creditMinor > 0n,
    )
  )
    return invalidSource()
  return lines.reduce(
    (sum, line) => sum + line.debitMinor - line.creditMinor,
    0n,
  )
}

function sourcePolarityMatches(sourceKind: string, amountMinor: bigint) {
  if (sourceKind === "OWNER_CONTRIBUTION" || sourceKind === "CUSTOMER_RECEIPT")
    return amountMinor > 0n
  if (
    sourceKind === "OWNER_WITHDRAWAL" ||
    sourceKind === "BILL_PAYMENT" ||
    sourceKind === "OWNER_BILL_PAYMENT" ||
    sourceKind === "PURCHASE_PAYMENT" ||
    sourceKind === "SUPPLIER_ADVANCE" ||
    sourceKind === "CUSTOMER_HELD_CREDIT_REFUND"
  )
    return amountMinor < 0n
  return true
}

async function customerTarget(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    bankAccountId: string
    sourceKind: string
    sourceId: string
    selectedAmountMinor: bigint
  },
): Promise<BankCorrectionTarget> {
  if (input.sourceKind === "CUSTOMER_RECEIPT") {
    const receipt = await tx.customerLedgerReceipt.findFirst({
      where: {
        id: input.sourceId,
        bookId: input.bookId,
        moneyAccountId: input.bankAccountId,
      },
      include: {
        entry: {
          include: {
            account: {
              include: { customer: { select: { id: true, tenantId: true } } },
            },
          },
        },
      },
    })
    if (
      !receipt ||
      receipt.entry.tenantId !== input.tenantId ||
      receipt.entry.account.tenantId !== input.tenantId ||
      receipt.entry.account.customer.tenantId !== input.tenantId ||
      receipt.entry.sourceKind !== "CUSTOMER_RECEIPT" ||
      receipt.entry.sourceId !== receipt.id ||
      receipt.entry.kind !== "RECEIPT" ||
      receipt.entry.side !== "CREDIT" ||
      receipt.entry.amountMinor !==
        (input.selectedAmountMinor < 0n
          ? -input.selectedAmountMinor
          : input.selectedAmountMinor)
    )
      return unavailable("Customer receipt provenance is incomplete.")
    return {
      kind: "CUSTOMER",
      customerId: receipt.entry.account.customer.id,
      accountId: receipt.accountId,
      entryId: receipt.entryId,
    }
  }

  if (input.sourceKind === "CUSTOMER_HELD_CREDIT_REFUND") {
    const entry = await tx.customerLedgerEntry.findFirst({
      where: {
        id: input.sourceId,
        tenantId: input.tenantId,
        sourceKind: "CUSTOMER_HELD_CREDIT_REFUND",
        sourceId: input.sourceId,
        kind: "REFUND",
        side: "DEBIT",
        account: { tenantId: input.tenantId },
      },
      include: {
        account: {
          include: { customer: { select: { id: true, tenantId: true } } },
        },
      },
    })
    if (
      !entry ||
      entry.account.customer.tenantId !== input.tenantId ||
      entry.amountMinor !==
        (input.selectedAmountMinor < 0n
          ? -input.selectedAmountMinor
          : input.selectedAmountMinor)
    )
      return unavailable("Customer refund provenance is incomplete.")
    return {
      kind: "CUSTOMER",
      customerId: entry.account.customer.id,
      accountId: entry.accountId,
      entryId: entry.id,
    }
  }
  return unavailable(
    "This customer posting has no supported correction source.",
  )
}

async function resolveOriginalTarget(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    bankAccountId: string
    sourceKind: string
    sourceId: string
    journalEntryId: string
    selectedAmountMinor: bigint
  },
): Promise<BankCorrectionTarget> {
  if (
    ["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(
      input.sourceKind,
    )
  )
    return { kind: "MONEY", entryId: input.journalEntryId }

  if (
    input.sourceKind === "EXPENSE_BILL" ||
    input.sourceKind === "PURCHASE_BILL"
  ) {
    const bill = await tx.financeBill.findFirst({
      where: { id: input.sourceId, bookId: input.bookId },
      select: { id: true, bookId: true, kind: true },
    })
    if (!bill) return unavailable("The original bill is unavailable.")
    if (
      (input.sourceKind === "EXPENSE_BILL" && bill.kind !== "EXPENSE") ||
      (input.sourceKind === "PURCHASE_BILL" &&
        bill.kind !== "PURCHASE" &&
        bill.kind !== "PURCHASE_ACCRUAL")
    )
      return unavailable("The original bill type does not match its posting.")
    return bill.kind === "EXPENSE"
      ? { kind: "BILL", billId: bill.id }
      : { kind: "PURCHASE", billId: bill.id }
  }

  if (
    input.sourceKind === "BILL_PAYMENT" ||
    input.sourceKind === "OWNER_BILL_PAYMENT" ||
    input.sourceKind === "PURCHASE_PAYMENT"
  ) {
    const payment = await tx.financeBillPayment.findFirst({
      where: {
        id: input.sourceId,
        bookId: input.bookId,
        accountId: input.bankAccountId,
      },
      include: {
        bill: {
          select: { id: true, bookId: true, kind: true, supplierId: true },
        },
        supplierEntry: {
          select: {
            id: true,
            bookId: true,
            kind: true,
            side: true,
            journalEntryId: true,
            paymentId: true,
            supplierId: true,
            billId: true,
            moneyAccountId: true,
            amountMinor: true,
            effectiveAt: true,
            actorUserId: true,
            description: true,
            journalEntry: {
              select: {
                actorUserId: true,
                effectiveAt: true,
                description: true,
                reversalOfId: true,
                reversal: { select: { id: true, effectiveAt: true } },
              },
            },
            reversals: { select: { id: true, effectiveAt: true }, take: 2 },
          },
        },
      },
    })
    if (
      !payment ||
      payment.bill.bookId !== input.bookId ||
      payment.amountMinor !==
        (input.selectedAmountMinor < 0n
          ? -input.selectedAmountMinor
          : input.selectedAmountMinor)
    )
      return unavailable("The original bill payment is unavailable.")
    if (
      input.sourceKind === "PURCHASE_PAYMENT" &&
      payment.bill.kind === "PURCHASE" &&
      payment.bill.supplierId &&
      payment.supplierEntry?.bookId === input.bookId &&
      payment.supplierEntry.kind === "PURCHASE_PAYMENT" &&
      payment.supplierEntry.side === "DEBIT" &&
      payment.supplierEntry.journalEntryId === input.journalEntryId &&
      payment.supplierEntry.paymentId === payment.id &&
      payment.supplierEntry.supplierId === payment.bill.supplierId &&
      payment.supplierEntry.billId === payment.bill.id &&
      payment.supplierEntry.moneyAccountId === input.bankAccountId &&
      payment.supplierEntry.amountMinor === payment.amountMinor &&
      payment.supplierEntry.actorUserId === payment.actorUserId &&
      payment.supplierEntry.effectiveAt.getTime() ===
        payment.effectiveAt.getTime() &&
      payment.supplierEntry.journalEntry.actorUserId === payment.actorUserId &&
      payment.supplierEntry.journalEntry.effectiveAt.getTime() ===
        payment.effectiveAt.getTime() &&
      payment.supplierEntry.journalEntry.reversalOfId === null &&
      payment.supplierEntry.description ===
        payment.supplierEntry.journalEntry.description
    ) {
      const latest = await tx.financeSupplierEntry.aggregate({
        where: {
          bookId: input.bookId,
          billId: payment.bill.id,
          supplierId: payment.bill.supplierId,
        },
        _max: { effectiveAt: true },
      })
      const journalReversal = payment.supplierEntry.journalEntry.reversal
      const supplierReversal = payment.supplierEntry.reversals[0]
      return {
        kind: "PURCHASE",
        billId: payment.bill.id,
        paymentId: payment.id,
        payment: {
          id: payment.id,
          supplierId: payment.bill.supplierId,
          amountMinor: payment.amountMinor.toString(),
          effectiveAt: payment.effectiveAt,
          description: payment.supplierEntry.description,
          reversedAt: payment.reversedAt,
          reversed: Boolean(
            payment.reversedAt || journalReversal || supplierReversal,
          ),
          reversalEffectiveAt:
            payment.reversalEffectiveAt ??
            journalReversal?.effectiveAt ??
            supplierReversal?.effectiveAt ??
            null,
          latestEffectiveAt: latest._max.effectiveAt ?? payment.effectiveAt,
        },
      }
    }
    if (
      (input.sourceKind === "BILL_PAYMENT" ||
        input.sourceKind === "OWNER_BILL_PAYMENT") &&
      payment.bill.kind === "EXPENSE"
    )
      return { kind: "BILL", billId: payment.bill.id, paymentId: payment.id }
    return unavailable("The bill payment kind does not match its source.")
  }

  if (
    input.sourceKind === "SUPPLIER_ADVANCE" ||
    input.sourceKind === "SUPPLIER_OPENING_ADVANCE" ||
    input.sourceKind === "SUPPLIER_OPENING_PAYABLE"
  ) {
    const source = await tx.financeSupplierEntry.findFirst({
      where: {
        bookId: input.bookId,
        ...(input.sourceKind === "SUPPLIER_ADVANCE"
          ? { id: input.sourceId, journalEntryId: input.journalEntryId }
          : {
              supplierId: input.sourceId,
              kind:
                input.sourceKind === "SUPPLIER_OPENING_ADVANCE"
                  ? "OPENING_ADVANCE"
                  : "OPENING_PAYABLE",
              journalEntryId: input.journalEntryId,
            }),
      },
      include: {
        supplier: { select: { id: true, bookId: true } },
        journalEntry: {
          include: {
            lines: {
              select: { accountId: true, debitMinor: true, creditMinor: true },
            },
          },
        },
        reversals: {
          select: { id: true, effectiveAt: true, reversalOfId: true },
          take: 2,
        },
      },
    })
    if (
      !source ||
      source.kind !==
        (input.sourceKind === "SUPPLIER_ADVANCE"
          ? "ADVANCE"
          : input.sourceKind === "SUPPLIER_OPENING_ADVANCE"
            ? "OPENING_ADVANCE"
            : "OPENING_PAYABLE") ||
      source.side !==
        (input.sourceKind === "SUPPLIER_OPENING_PAYABLE"
          ? "CREDIT"
          : "DEBIT") ||
      source.supplier.bookId !== input.bookId ||
      source.journalEntry.bookId !== input.bookId ||
      source.journalEntryId !== input.journalEntryId ||
      source.journalEntry.sourceKind !== input.sourceKind ||
      source.journalEntry.sourceId !== input.sourceId ||
      source.journalEntry.actorUserId !== source.actorUserId ||
      source.journalEntry.effectiveAt.getTime() !==
        source.effectiveAt.getTime() ||
      source.journalEntry.description !== source.description ||
      source.amountMinor !==
        (input.selectedAmountMinor < 0n
          ? -input.selectedAmountMinor
          : input.selectedAmountMinor) ||
      source.reversals.length > 1 ||
      (source.kind === "ADVANCE" &&
        source.moneyAccountId !== input.bankAccountId)
    )
      return unavailable(
        "The supplier entry does not match its original posting.",
      )
    const reversal = source.reversals[0]
    if (reversal && reversal.reversalOfId !== source.id)
      return unavailable("The supplier reversal link is inconsistent.")
    return {
      kind: "SUPPLIER",
      supplierId: source.supplierId,
      supplierEntryId: source.id,
      entryKind: source.kind,
      amountMinor: source.amountMinor.toString(),
      effectiveAt: source.effectiveAt,
      description: source.description,
      reversal: reversal
        ? { id: reversal.id, effectiveAt: reversal.effectiveAt }
        : null,
    }
  }

  if (
    input.sourceKind === "CUSTOMER_RECEIPT" ||
    input.sourceKind === "CUSTOMER_HELD_CREDIT_REFUND"
  )
    return customerTarget(tx, {
      tenantId: input.tenantId,
      bookId: input.bookId,
      bankAccountId: input.bankAccountId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      selectedAmountMinor: input.selectedAmountMinor,
    })

  return unavailable("This journal posting has no supported source correction.")
}

export async function resolveFinanceBankCorrectionSource(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId: string
    entryId: string
  },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, tenantId: true, lastSequence: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const account = await tx.financeAccount.findFirst({
        where: {
          id: input.accountId,
          bookId: book.id,
          kind: "ASSET",
          purpose: { in: ["BANK", "CLEARING"] },
          archivedAt: null,
        },
        select: { id: true, bookId: true },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose an active bank or clearing account in this financial book.",
        )
      const entry = await getEntry(tx, {
        bookId: book.id,
        entryId: input.entryId,
        accountId: account.id,
        watermark: book.lastSequence,
      })
      if (!entry)
        throw new FinanceError(
          "NOT_FOUND",
          "The posted bank entry was not found in this financial book.",
        )
      const amountMinor = selectedAmount(entry.lines)
      if (amountMinor === 0n)
        return {
          bookId: book.id,
          bankAccountId: account.id,
          journalEntryId: entry.id,
          sourceKind: entry.sourceKind,
          sourceId: entry.sourceId,
          target: unavailable(
            "The selected posting has no net movement on this account.",
          ),
          posted: {
            description: entry.description,
            effectiveAt: entry.effectiveAt,
            sequence: entry.sequence.toString(),
            amountMinor: "0",
          },
        }

      let original = entry
      if (entry.reversalOfId !== null) {
        const expectedReversalKind =
          entry.sourceKind === "MONEY_REVERSAL" ||
          entry.sourceKind === "CUSTOMER_LEDGER_REVERSAL" ||
          entry.sourceKind === "SUPPLIER_ENTRY_REVERSAL" ||
          entry.sourceKind === "PURCHASE_PAYMENT_REVERSAL" ||
          [
            "EXPENSE_BILL_REVERSAL",
            "BILL_PAYMENT_REVERSAL",
            "OWNER_BILL_PAYMENT_REVERSAL",
          ].includes(entry.sourceKind)
        if (!expectedReversalKind || entry.sourceId.length === 0)
          return {
            bookId: book.id,
            bankAccountId: account.id,
            journalEntryId: entry.id,
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
            target: unavailable("The reversal source is not supported."),
            posted: {
              description: entry.description,
              effectiveAt: entry.effectiveAt,
              sequence: entry.sequence.toString(),
              amountMinor: amountMinor.toString(),
            },
          }
        const prior = await getEntry(tx, {
          bookId: book.id,
          entryId: entry.reversalOfId,
          accountId: account.id,
          watermark: book.lastSequence,
        })
        let reversalSourceMatches =
          entry.sourceKind === "MONEY_REVERSAL"
            ? !!prior &&
              entry.sourceId === prior.id &&
              ["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(
                prior.sourceKind,
              )
            : entry.sourceKind === "EXPENSE_BILL_REVERSAL"
              ? !!prior &&
                entry.sourceId === prior.id &&
                prior.sourceKind === "EXPENSE_BILL"
              : entry.sourceKind === "BILL_PAYMENT_REVERSAL"
                ? !!prior &&
                  entry.sourceId === prior.id &&
                  prior.sourceKind === "BILL_PAYMENT"
                : entry.sourceKind === "OWNER_BILL_PAYMENT_REVERSAL"
                  ? !!prior &&
                    entry.sourceId === prior.id &&
                    prior.sourceKind === "OWNER_BILL_PAYMENT"
                  : false
        if (prior && entry.sourceKind === "SUPPLIER_ENTRY_REVERSAL") {
          const supplierReversal = await tx.financeSupplierEntry.findFirst({
            where: {
              bookId: book.id,
              journalEntryId: entry.id,
              kind: "REVERSAL",
              reversalOf: {
                id: entry.sourceId,
                journalEntryId: prior.id,
                kind: {
                  in: ["OPENING_PAYABLE", "OPENING_ADVANCE", "ADVANCE"],
                },
              },
            },
            select: { id: true },
          })
          reversalSourceMatches = !!supplierReversal
        }
        if (prior && entry.sourceKind === "PURCHASE_PAYMENT_REVERSAL") {
          const supplierReversal = await tx.financeSupplierEntry.findFirst({
            where: {
              bookId: book.id,
              journalEntryId: entry.id,
              kind: "REVERSAL",
              reversalOf: {
                id: entry.sourceId,
                kind: "PURCHASE_PAYMENT",
                journalEntryId: prior.id,
              },
            },
            select: { id: true },
          })
          reversalSourceMatches =
            !!supplierReversal && prior.sourceKind === "PURCHASE_PAYMENT"
        }
        if (prior && entry.sourceKind === "CUSTOMER_LEDGER_REVERSAL") {
          const ledgerReversal = await tx.customerLedgerEntry.findFirst({
            where: {
              id: entry.sourceId,
              tenantId: input.tenantId,
              kind: "REVERSAL",
              reversalOf: { account: { tenantId: input.tenantId } },
            },
            include: {
              reversalOf: {
                select: {
                  id: true,
                  sourceKind: true,
                  sourceId: true,
                  kind: true,
                },
              },
            },
          })
          if (ledgerReversal?.reversalOf) {
            reversalSourceMatches =
              (prior.sourceKind === "CUSTOMER_RECEIPT" &&
                ledgerReversal.reversalOf.kind === "RECEIPT" &&
                ledgerReversal.reversalOf.sourceKind === "CUSTOMER_RECEIPT" &&
                ledgerReversal.reversalOf.sourceId === prior.sourceId) ||
              (prior.sourceKind === "CUSTOMER_HELD_CREDIT_REFUND" &&
                ledgerReversal.reversalOf.kind === "REFUND" &&
                ledgerReversal.reversalOf.sourceKind ===
                  "CUSTOMER_HELD_CREDIT_REFUND" &&
                ledgerReversal.reversalOf.id === prior.sourceId)
          }
        }
        if (
          !prior ||
          prior.reversalOfId !== null ||
          prior.sequence >= entry.sequence ||
          entry.effectiveAt < prior.effectiveAt ||
          amountMinor !== -selectedAmount(prior.lines) ||
          !reversalSourceMatches
        )
          return {
            bookId: book.id,
            bankAccountId: account.id,
            journalEntryId: entry.id,
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
            target: unavailable(
              "The reversal does not link to its original posting.",
            ),
            posted: {
              description: entry.description,
              effectiveAt: entry.effectiveAt,
              sequence: entry.sequence.toString(),
              amountMinor: amountMinor.toString(),
            },
          }
        original = prior
      } else if (
        entry.sourceKind.endsWith("_REVERSAL") ||
        entry.sourceKind === "MONEY_REVERSAL" ||
        entry.sourceKind === "CUSTOMER_LEDGER_REVERSAL" ||
        entry.sourceKind === "SUPPLIER_ENTRY_REVERSAL" ||
        entry.sourceKind === "PURCHASE_PAYMENT_REVERSAL"
      ) {
        return {
          bookId: book.id,
          bankAccountId: account.id,
          journalEntryId: entry.id,
          sourceKind: entry.sourceKind,
          sourceId: entry.sourceId,
          target: unavailable(
            "The source is tagged as a reversal without an original link.",
          ),
          posted: {
            description: entry.description,
            effectiveAt: entry.effectiveAt,
            sequence: entry.sequence.toString(),
            amountMinor: amountMinor.toString(),
          },
        }
      }

      const originalAmountMinor = selectedAmount(original.lines)
      const sourceKind = original.sourceKind
      const sourceId = original.sourceId
      const target = sourcePolarityMatches(sourceKind, originalAmountMinor)
        ? await resolveOriginalTarget(tx, {
            tenantId: input.tenantId,
            bookId: book.id,
            bankAccountId: account.id,
            sourceKind,
            sourceId,
            journalEntryId: original.id,
            selectedAmountMinor: originalAmountMinor,
          })
        : unavailable("The bank movement sign does not match its source.")
      return {
        bookId: book.id,
        bankAccountId: account.id,
        journalEntryId: entry.id,
        sourceKind,
        sourceId,
        target,
        posted: {
          description: original.description,
          effectiveAt: original.effectiveAt,
          sequence: original.sequence.toString(),
          amountMinor: originalAmountMinor.toString(),
        } satisfies PostedEntry,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
