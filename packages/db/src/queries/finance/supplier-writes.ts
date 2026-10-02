import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError, financeAmount } from "./rules"
import {
  assertOriginalSupplierPosting,
  normalizeFinanceSupplier,
  normalizeFinanceSupplierDescription,
} from "./supplier-rules"

const SUPPLIER_REVERSAL_SOURCE = "SUPPLIER_ENTRY_REVERSAL"

export type CreateFinanceSupplierInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  code: string
  name: string
}

export type FinanceSupplierOpeningInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  supplierId: string
  kind: "PAYABLE" | "ADVANCE"
  amountMinor: string
  description: string
  effectiveAt: Date
}

export type FinanceSupplierAdvanceInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  supplierId: string
  moneyAccountId: string
  amountMinor: string
  description: string
  effectiveAt: Date
}

export type FinanceSupplierEntryReversalInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  entryId: string
  reason: string
  effectiveAt: Date
}

function getJournalEntryId(result: unknown) {
  if (
    !result ||
    typeof result !== "object" ||
    typeof (result as { entryId?: unknown }).entryId !== "string"
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The saved journal result cannot be recovered.",
    )
  }
  return (result as { entryId: string }).entryId
}

async function getSupplier(
  tx: Prisma.TransactionClient,
  bookId: string,
  supplierId: string,
) {
  const supplier = await tx.financeSupplierAccount.findFirst({
    where: { id: supplierId, bookId },
    select: { id: true },
  })
  if (!supplier)
    throw new FinanceError(
      "NOT_FOUND",
      "Supplier not found in this financial book.",
    )
  return supplier
}

async function getControlAccount(
  tx: Prisma.TransactionClient,
  bookId: string,
  code: string,
  kind: "ASSET" | "LIABILITY" | "EQUITY",
  purpose: "SUPPLIER_ADVANCE" | "PAYABLE" | "OPENING_EQUITY",
) {
  const account = await tx.financeAccount.findUnique({
    where: { bookId_code: { bookId, code } },
    select: { id: true, kind: true, purpose: true },
  })
  if (!account || account.kind !== kind || account.purpose !== purpose) {
    throw new FinanceError(
      "CONFLICT",
      `Finance control account ${code} is unavailable or has changed.`,
    )
  }
  return account
}

function requireEffectiveDate(effectiveAt: Date) {
  if (!Number.isFinite(effectiveAt.getTime())) {
    throw new FinanceError("INVALID_JOURNAL", "Enter a valid effective date.")
  }
}

export async function createFinanceSupplierInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateFinanceSupplierInput,
) {
  const { code, name } = normalizeFinanceSupplier(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "CREATE_FINANCE_SUPPLIER",
    { ...payload, code, name },
    async (book) => {
      const existing = await tx.financeSupplierAccount.findUnique({
        where: { bookId_code: { bookId: book.id, code } },
        select: { id: true },
      })
      if (existing)
        throw new FinanceError(
          "CONFLICT",
          "That supplier code is already in use.",
        )
      const supplier = await tx.financeSupplierAccount.create({
        data: { bookId: book.id, code, name, actorUserId: input.actorUserId },
        select: { id: true },
      })
      return { id: supplier.id }
    },
  )
}

export async function createFinanceSupplier(
  db: PrismaClient,
  input: CreateFinanceSupplierInput,
) {
  return db.$transaction(
    (tx) => createFinanceSupplierInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}

export async function recordFinanceSupplierOpeningInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningInput,
) {
  const amount = financeAmount(input.amountMinor)
  const description = normalizeFinanceSupplierDescription(input.description)
  requireEffectiveDate(input.effectiveAt)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECORD_SUPPLIER_OPENING",
    { ...payload, description },
    async (book) => {
      await getSupplier(tx, book.id, input.supplierId)
      if (input.effectiveAt.getTime() !== book.startsAt.getTime()) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A supplier opening must use the bookkeeping start date.",
        )
      }
      const kind =
        input.kind === "PAYABLE"
          ? "OPENING_PAYABLE"
          : input.kind === "ADVANCE"
            ? "OPENING_ADVANCE"
            : null
      if (!kind)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Choose a payable or advance opening.",
        )
      const prior = await tx.financeSupplierEntry.findFirst({
        where: { bookId: book.id, supplierId: input.supplierId, kind },
        select: { id: true },
      })
      if (prior)
        throw new FinanceError(
          "CONFLICT",
          "This supplier already has an opening of that kind.",
        )

      const payable =
        kind === "OPENING_PAYABLE"
          ? await getControlAccount(tx, book.id, "2000", "LIABILITY", "PAYABLE")
          : null
      const advance =
        kind === "OPENING_ADVANCE"
          ? await getControlAccount(
              tx,
              book.id,
              "1250",
              "ASSET",
              "SUPPLIER_ADVANCE",
            )
          : null
      const equity = await getControlAccount(
        tx,
        book.id,
        "3900",
        "EQUITY",
        "OPENING_EQUITY",
      )
      const supplierEntryId = randomUUID()
      const lines =
        kind === "OPENING_PAYABLE"
          ? payable
            ? [
                {
                  accountId: equity.id,
                  side: "DEBIT" as const,
                  amountMinor: amount.toString(),
                },
                {
                  accountId: payable.id,
                  side: "CREDIT" as const,
                  amountMinor: amount.toString(),
                },
              ]
            : []
          : advance
            ? [
                {
                  accountId: advance.id,
                  side: "DEBIT" as const,
                  amountMinor: amount.toString(),
                },
                {
                  accountId: equity.id,
                  side: "CREDIT" as const,
                  amountMinor: amount.toString(),
                },
              ]
            : []
      if (!lines.length)
        throw new FinanceError(
          "CONFLICT",
          "The supplier opening control account is unavailable.",
        )
      const journalResult = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "supplier-opening",
        ),
        sourceKind:
          kind === "OPENING_PAYABLE"
            ? "SUPPLIER_OPENING_PAYABLE"
            : "SUPPLIER_OPENING_ADVANCE",
        sourceId: input.supplierId,
        description,
        effectiveAt: input.effectiveAt,
        lines,
      })
      const entry = await tx.financeSupplierEntry.create({
        data: {
          id: supplierEntryId,
          bookId: book.id,
          supplierId: input.supplierId,
          kind,
          side: kind === "OPENING_PAYABLE" ? "CREDIT" : "DEBIT",
          amountMinor: amount,
          journalEntryId: getJournalEntryId(journalResult),
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description,
        },
        select: { id: true },
      })
      return { id: entry.id }
    },
  )
}

export async function recordFinanceSupplierOpening(
  db: PrismaClient,
  input: FinanceSupplierOpeningInput,
) {
  return db.$transaction(
    (tx) => recordFinanceSupplierOpeningInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}

export async function recordFinanceSupplierAdvanceInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierAdvanceInput,
) {
  const amount = financeAmount(input.amountMinor)
  const description = normalizeFinanceSupplierDescription(input.description)
  requireEffectiveDate(input.effectiveAt)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECORD_SUPPLIER_ADVANCE",
    { ...payload, description },
    async (book) => {
      await getSupplier(tx, book.id, input.supplierId)
      const advance = await getControlAccount(
        tx,
        book.id,
        "1250",
        "ASSET",
        "SUPPLIER_ADVANCE",
      )
      const moneyAccount = await tx.financeAccount.findFirst({
        where: {
          id: input.moneyAccountId,
          bookId: book.id,
          kind: "ASSET",
          purpose: { in: ["CASH", "BANK", "CLEARING"] },
          archivedAt: null,
        },
        select: { id: true },
      })
      if (!moneyAccount)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose an active cash, bank, or clearing account.",
        )
      const supplierEntryId = randomUUID()
      const journalResult = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "supplier-advance",
        ),
        sourceKind: "SUPPLIER_ADVANCE",
        sourceId: supplierEntryId,
        description,
        effectiveAt: input.effectiveAt,
        lines: [
          {
            accountId: advance.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: moneyAccount.id,
            side: "CREDIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      const entry = await tx.financeSupplierEntry.create({
        data: {
          id: supplierEntryId,
          bookId: book.id,
          supplierId: input.supplierId,
          kind: "ADVANCE",
          side: "DEBIT",
          amountMinor: amount,
          journalEntryId: getJournalEntryId(journalResult),
          moneyAccountId: moneyAccount.id,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description,
        },
        select: { id: true },
      })
      return { id: entry.id }
    },
  )
}

export async function recordFinanceSupplierAdvance(
  db: PrismaClient,
  input: FinanceSupplierAdvanceInput,
) {
  return db.$transaction(
    (tx) => recordFinanceSupplierAdvanceInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}

export async function reverseFinanceSupplierEntryInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierEntryReversalInput,
) {
  const reason = input.reason.trim()
  requireEffectiveDate(input.effectiveAt)
  if (!reason || reason.length > 400) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Give a reversal reason of 1–400 characters.",
    )
  }
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_SUPPLIER_ENTRY",
    { ...payload, reason },
    async (book) => {
      const original = await tx.financeSupplierEntry.findFirst({
        where: { id: input.entryId, bookId: book.id },
        include: {
          journalEntry: {
            include: { lines: true, reversal: { select: { id: true } } },
          },
          reversalOf: { select: { id: true } },
          reversals: { select: { id: true } },
        },
      })
      if (!original)
        throw new FinanceError(
          "NOT_FOUND",
          "Supplier entry not found in this financial book.",
        )
      if (
        original.kind !== "OPENING_PAYABLE" &&
        original.kind !== "OPENING_ADVANCE" &&
        original.kind !== "ADVANCE"
      ) {
        throw new FinanceError(
          "CONFLICT",
          "Purchase bills, payments and allocations must be corrected through their source commands.",
        )
      }
      if (
        original.reversalOfId ||
        original.reversals.length ||
        original.journalEntry.reversal
      ) {
        throw new FinanceError(
          "CONFLICT",
          "This supplier entry is already reversed or is itself a reversal.",
        )
      }
      if (input.effectiveAt < original.effectiveAt) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A reversal cannot precede its supplier entry.",
        )
      }
      const advance =
        original.kind === "OPENING_ADVANCE" || original.kind === "ADVANCE"
          ? await getControlAccount(
              tx,
              book.id,
              "1250",
              "ASSET",
              "SUPPLIER_ADVANCE",
            )
          : null
      const payable =
        original.kind === "OPENING_PAYABLE"
          ? await getControlAccount(tx, book.id, "2000", "LIABILITY", "PAYABLE")
          : null
      const equity =
        original.kind !== "ADVANCE"
          ? await getControlAccount(
              tx,
              book.id,
              "3900",
              "EQUITY",
              "OPENING_EQUITY",
            )
          : null
      assertOriginalSupplierPosting({
        kind: original.kind,
        side: original.side,
        amountMinor: original.amountMinor,
        moneyAccountId: original.moneyAccountId,
        entryId: original.id,
        supplierId: original.supplierId,
        supplierActorUserId: original.actorUserId,
        supplierEffectiveAt: original.effectiveAt,
        supplierDescription: original.description,
        bookStartsAt: book.startsAt,
        journal: original.journalEntry,
        advanceAccountId: advance?.id ?? "",
        payableAccountId: payable?.id ?? "",
        openingEquityAccountId: equity?.id ?? "",
      })
      if (original.kind === "OPENING_ADVANCE" || original.kind === "ADVANCE") {
        const [allocated, released] = await Promise.all([
          tx.financeSupplierAllocation.aggregate({
            where: { bookId: book.id, advanceEntryId: original.id },
            _sum: { amountMinor: true },
            _max: { effectiveAt: true },
          }),
          tx.financeSupplierAllocationRelease.aggregate({
            where: {
              bookId: book.id,
              allocation: { advanceEntryId: original.id },
            },
            _sum: { amountMinor: true },
            _max: { effectiveAt: true },
          }),
        ])
        if (
          (allocated._sum.amountMinor ?? BigInt(0)) >
          (released._sum.amountMinor ?? BigInt(0))
        ) {
          throw new FinanceError(
            "CONFLICT",
            "Release every consumed portion of this advance before reversing it.",
          )
        }
        const latestSettlementAt =
          allocated._max.effectiveAt && released._max.effectiveAt
            ? allocated._max.effectiveAt > released._max.effectiveAt
              ? allocated._max.effectiveAt
              : released._max.effectiveAt
            : (allocated._max.effectiveAt ?? released._max.effectiveAt)
        if (latestSettlementAt && input.effectiveAt < latestSettlementAt)
          throw new FinanceError(
            "INVALID_JOURNAL",
            "An advance reversal cannot precede its latest allocation or release.",
          )
      }
      if (original.kind === "ADVANCE") {
        const moneyAccount = await tx.financeAccount.findFirst({
          where: { id: original.moneyAccountId ?? "", bookId: book.id },
          select: { id: true, kind: true, purpose: true },
        })
        if (
          !moneyAccount ||
          moneyAccount.kind !== "ASSET" ||
          !["CASH", "BANK", "CLEARING"].includes(moneyAccount.purpose)
        ) {
          throw new FinanceError(
            "CONFLICT",
            "The original advance account no longer matches its financial purpose.",
          )
        }
      }
      const reversalDescription = `Reversal: ${reason}`
      const journalResult = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "supplier-entry-reversal",
        ),
        sourceKind: SUPPLIER_REVERSAL_SOURCE,
        sourceId: original.id,
        reversalOfId: original.journalEntryId,
        description: reversalDescription,
        effectiveAt: input.effectiveAt,
        lines: original.journalEntry.lines.map((line) => ({
          accountId: line.accountId,
          side:
            line.debitMinor > BigInt(0)
              ? ("CREDIT" as const)
              : ("DEBIT" as const),
          amountMinor: (line.debitMinor > BigInt(0)
            ? line.debitMinor
            : line.creditMinor
          ).toString(),
        })),
      })
      const reversal = await tx.financeSupplierEntry.create({
        data: {
          bookId: book.id,
          supplierId: original.supplierId,
          kind: "REVERSAL",
          side: original.side === "DEBIT" ? "CREDIT" : "DEBIT",
          amountMinor: original.amountMinor,
          journalEntryId: getJournalEntryId(journalResult),
          moneyAccountId: original.moneyAccountId,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          description: reversalDescription,
          reversalOfId: original.id,
        },
        select: { id: true },
      })
      return { id: reversal.id }
    },
  )
}

export async function reverseFinanceSupplierEntry(
  db: PrismaClient,
  input: FinanceSupplierEntryReversalInput,
) {
  return db.$transaction(
    (tx) => reverseFinanceSupplierEntryInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
