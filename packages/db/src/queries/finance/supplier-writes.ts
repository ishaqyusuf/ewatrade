import { randomUUID } from "node:crypto"
import type {
  FinanceBook,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import {
  type FinanceActor,
  assertFinanceManager,
  lockFinanceBook,
} from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError, assertFinancePostingDate, financeAmount } from "./rules"
import { assertFinanceSupplierCodeAvailable } from "./supplier-create-source"
import {
  assertOriginalSupplierPosting,
  normalizeFinanceSupplier,
  normalizeFinanceSupplierDescription,
} from "./supplier-rules"

import {
  normalizeSupplierAdvance,
  reviewSupplierAdvanceSource,
} from "./supplier-advance-review"

import {
  type FinanceSupplierOpeningReviewInput,
  loadSupplierOpeningReview,
  normalizeSupplierOpening,
  reviewSupplierOpeningSource,
} from "./supplier-opening-review"

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
      await assertFinanceSupplierCodeAvailable(tx, book.id, code)
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

async function executeSupplierOpening(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningInput,
  preparedSource?: Awaited<ReturnType<typeof reviewSupplierOpeningSource>>,
) {
  const { amount, description } = normalizeSupplierOpening(input)
  requireEffectiveDate(input.effectiveAt)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECORD_SUPPLIER_OPENING",
    { ...payload, description },
    async (book) => {
      const { kind, lines } =
        preparedSource ?? (await reviewSupplierOpeningSource(tx, input, book))
      const supplierEntryId = randomUUID()
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

export async function recordFinanceSupplierOpeningInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningInput,
) {
  return executeSupplierOpening(tx, input)
}
/** Start date and fresh proof stay private to the locked transaction and one command. */
export async function prepareReviewedFinanceSupplierOpeningInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierOpeningReviewInput,
) {
  const owned = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    supplierId: input.supplierId,
    kind: input.kind,
    amountMinor: input.amountMinor,
    description: input.description,
  }
  const value = await loadSupplierOpeningReview(tx, owned, true)
  let commandId: string | undefined
  let execution: ReturnType<typeof executeSupplierOpening> | undefined
  return {
    review: value.review,
    execute: (clientCommandId: string) => {
      if (commandId !== undefined && commandId !== clientCommandId)
        throw new FinanceError(
          "CONFLICT",
          "Prepared supplier opening is bound to one command.",
        )
      commandId = clientCommandId
      return (execution ??= executeSupplierOpening(
        tx,
        { ...value.input, clientCommandId },
        value.source,
      ))
    },
  }
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
  const { amount, description } = normalizeSupplierAdvance(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECORD_SUPPLIER_ADVANCE",
    { ...payload, description },
    async (book) => {
      const { advance, moneyAccount } = await reviewSupplierAdvanceSource(tx, {
        ...input,
        bookId: book.id,
      })
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

async function resolveSupplierEntryReversalSource(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierEntryReversalInput, "clientCommandId">,
  book: FinanceBook,
) {
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const original = await tx.financeSupplierEntry.findFirst({
    where: { id: input.entryId, bookId: book.id },
    include: {
      journalEntry: {
        include: {
          lines: { include: { account: true } },
          reversal: { select: { id: true } },
        },
      },
      supplier: true,
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
    original.kind !== "ADVANCE" &&
    original.kind !== "OPENING_PAYMENT"
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
  let settlement: {
    allocatedMinor: string
    releasedMinor: string
    latestAt: string | null
  } | null = null
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
    original.kind === "OPENING_PAYABLE" || original.kind === "OPENING_PAYMENT"
      ? await getControlAccount(tx, book.id, "2000", "LIABILITY", "PAYABLE")
      : null
  const equity =
    original.kind !== "ADVANCE" && original.kind !== "OPENING_PAYMENT"
      ? await getControlAccount(tx, book.id, "3900", "EQUITY", "OPENING_EQUITY")
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
    settlement = {
      allocatedMinor: (allocated._sum.amountMinor ?? 0n).toString(),
      releasedMinor: (released._sum.amountMinor ?? 0n).toString(),
      latestAt: latestSettlementAt?.toISOString() ?? null,
    }
    if (latestSettlementAt && input.effectiveAt < latestSettlementAt)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "An advance reversal cannot precede its latest allocation or release.",
      )
  }
  if (original.kind === "OPENING_PAYABLE") {
    // Payments toward a starting balance must be undone before the balance.
    const payments = await tx.financeSupplierEntry.count({
      where: {
        bookId: book.id,
        supplierId: original.supplierId,
        kind: "OPENING_PAYMENT",
        reversals: { none: {} },
      },
    })
    if (payments > 0)
      throw new FinanceError(
        "CONFLICT",
        "Undo the payments toward this starting balance before undoing it.",
      )
  }
  if (original.kind === "ADVANCE" || original.kind === "OPENING_PAYMENT") {
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
  if (
    original.supplier.bookId !== book.id ||
    original.journalEntry.bookId !== book.id ||
    original.journalEntry.lines.some(
      (l) => l.account.bookId !== book.id || l.account.archivedAt !== null,
    )
  )
    throw new FinanceError(
      "CONFLICT",
      "The original supplier or posting accounts are unavailable in this Book.",
    )
  return { original, settlement }
}

async function executeSupplierEntryReversal(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierEntryReversalInput,
  preparedSource?: Awaited<
    ReturnType<typeof resolveSupplierEntryReversalSource>
  >,
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
      const { original } =
        preparedSource ??
        (await resolveSupplierEntryReversalSource(tx, input, book))
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

async function loadSupplierEntryReversalReview(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierEntryReversalInput, "clientCommandId">,
  locked = false,
) {
  const reason = input.reason.trim()
  requireEffectiveDate(input.effectiveAt)
  if (!reason || reason.length > 400)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Give a reversal reason of 1–400 characters.",
    )
  let book: FinanceBook
  if (locked) book = await lockFinanceBook(tx, input)
  else {
    await assertFinanceManager(tx, input)
    const found = await tx.financeBook.findFirst({
      where: { id: input.bookId, tenantId: input.tenantId },
    })
    if (!found) throw new FinanceError("NOT_FOUND", "Financial book not found.")
    book = found
  }
  const source = await resolveSupplierEntryReversalSource(tx, input, book)
  const { original, settlement } = source
  return {
    source,
    review: {
      bookId: book.id,
      currencyCode: book.currencyCode,
      startsAt: book.startsAt.toISOString(),
      closedThrough: book.closedThrough?.toISOString() ?? null,
      entryId: original.id,
      kind: original.kind,
      side: original.side,
      amountMinor: original.amountMinor.toString(),
      supplierId: original.supplier.id,
      supplierName: original.supplier.name,
      supplierCode: original.supplier.code,
      originalDescription: original.description,
      originalEffectiveAt: original.effectiveAt.toISOString(),
      originalActorUserId: original.actorUserId,
      originalJournalId: original.journalEntryId,
      originalSequence: original.journalEntry.sequence.toString(),
      moneyAccountId: original.moneyAccountId,
      settlement,
      effectiveAt: input.effectiveAt.toISOString(),
      reason,
      payableDecreaseMinor:
        original.kind === "OPENING_PAYABLE"
          ? original.amountMinor.toString()
          : "0",
      // Undoing a starting-balance payment puts the amount back on what you owe.
      payableIncreaseMinor:
        original.kind === "OPENING_PAYMENT"
          ? original.amountMinor.toString()
          : "0",
      unallocatedAdvanceDecreaseMinor:
        original.kind === "OPENING_ADVANCE" || original.kind === "ADVANCE"
          ? original.amountMinor.toString()
          : "0",
      recordedMoneyIncreaseMinor:
        original.kind === "ADVANCE" || original.kind === "OPENING_PAYMENT"
          ? original.amountMinor.toString()
          : "0",
      lines: original.journalEntry.lines
        .map((l) => ({
          accountId: l.account.id,
          accountName: l.account.name,
          code: l.account.code,
          kind: l.account.kind,
          purpose: l.account.purpose,
          debitMinor: l.creditMinor.toString(),
          creditMinor: l.debitMinor.toString(),
        }))
        .sort((a, b) => a.accountId.localeCompare(b.accountId)),
      stockEffect: "NONE" as const,
      moneyTransfer: "NOT_PERFORMED" as const,
    },
  }
}
export async function getFinanceSupplierEntryReversalReview(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierEntryReversalInput, "clientCommandId">,
) {
  return (await loadSupplierEntryReversalReview(tx, input)).review
}
export async function reverseFinanceSupplierEntryInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceSupplierEntryReversalInput,
) {
  return executeSupplierEntryReversal(tx, input)
}
/** Fresh original proof stays private to the Book-locked transaction and one command. */
export async function prepareReviewedFinanceSupplierEntryReversalInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceSupplierEntryReversalInput, "clientCommandId">,
) {
  const owned = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    entryId: input.entryId,
    reason: input.reason,
    effectiveAt: new Date(input.effectiveAt),
  }
  const { review, source } = await loadSupplierEntryReversalReview(
    tx,
    owned,
    true,
  )
  let commandId: string | undefined
  let execution: ReturnType<typeof executeSupplierEntryReversal> | undefined
  return {
    review,
    execute: (clientCommandId: string) => {
      if (commandId !== undefined && commandId !== clientCommandId)
        throw new FinanceError(
          "CONFLICT",
          "Prepared supplier correction is bound to one command.",
        )
      commandId = clientCommandId
      return (execution ??= executeSupplierEntryReversal(
        tx,
        { ...owned, clientCommandId },
        source,
      ))
    },
  }
}
