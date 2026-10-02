import { financePostingCommandId } from "./commands"
import type { PriorCostReviewExpectedPosting } from "./reviewed-cost-prior-journal-proof"
import type { ReviewedPurchaseSourceFacts } from "./reviewed-cost-purchase-facts"
import type { ReviewedPurchaseRecognitionFacts } from "./reviewed-cost-recognition-facts"
import { auditReviewedPurchaseRecognitionOwner } from "./reviewed-cost-recognition-rules"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
  validateFinanceLines,
} from "./rules"
import { addQuantities, normalizeQuantity } from "./valuation-math"

const MAX_MINOR = 9223372036854775807n
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function at(date: Date) {
  const value = date.getTime()
  if (!Number.isFinite(value))
    conflict("Purchase source has an invalid owning date.")
  return value
}
function q(value: string) {
  try {
    return normalizeQuantity(value)
  } catch {
    conflict("Purchase source quantity exceeds exact bounds.")
  }
}
function amount(value: bigint) {
  try {
    return financeAmount(value.toString())
  } catch {
    conflict("Purchase source amount exceeds original command bounds.")
  }
}
function unique(ids: string[]) {
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length)
    conflict("Purchase source has missing or duplicate identities.")
}

/** Original receipt/acquisition proof; current carrying cost and review still need proof. */
export function auditReviewedCostPurchaseSource(
  input: ReviewedPurchaseSourceFacts,
) {
  return auditPurchaseSource(input)
}

export function auditReviewedCostRecognizedPurchaseSource(
  input: ReviewedPurchaseSourceFacts,
  recognition: ReviewedPurchaseRecognitionFacts,
) {
  return auditPurchaseSource(input, recognition)
}

function auditPurchaseSource(
  input: ReviewedPurchaseSourceFacts,
  recognition?: ReviewedPurchaseRecognitionFacts,
) {
  const { book, bill, receipt, operation, movement, event, command } = input
  const owner = recognition
    ? auditReviewedPurchaseRecognitionOwner(input, recognition)
    : {
        actorUserId: bill.actorUserId,
        effectiveAt: bill.incurredAt,
        sourceKind: "PURCHASE_BILL",
        sourceId: bill.id,
        commandKind: "RECORD_PURCHASE",
        stockPart: "",
        journalPart: "purchase-journal",
        debitAccountId: null,
        creditAccountId: null,
        credit: { code: "2000", kind: "LIABILITY", purpose: "PAYABLE" },
        snapshot: null,
      }
  if (
    [
      bill.id,
      receipt.id,
      operation.id,
      movement.id,
      movement.balanceSourceId,
      command.id,
    ].some((id) => !id.trim())
  )
    conflict("Original purchase source has missing identities.")
  const effectiveAt = at(owner.effectiveAt)
  if (
    !book.id.trim() ||
    !book.tenantId.trim() ||
    !book.currencyCode.trim() ||
    effectiveAt < at(book.startsAt) ||
    effectiveAt > at(input.through) ||
    bill.kind !== (recognition ? "PURCHASE_ACCRUAL" : "PURCHASE") ||
    bill.corrected ||
    bill.bookId !== book.id ||
    !bill.supplierId ||
    bill.supplierBookId !== book.id ||
    !bill.storeId ||
    bill.storeTenantId !== book.tenantId ||
    bill.currencyCode !== book.currencyCode ||
    !bill.actorUserId.trim() ||
    !bill.description.trim() ||
    receipt.tenantId !== book.tenantId ||
    receipt.bookId !== book.id ||
    receipt.stockOperationId !== operation.id ||
    receipt.stockMovementId !== movement.id ||
    movement.operationId !== operation.id ||
    movement.balanceTenantId !== book.tenantId ||
    movement.balanceStoreId !== bill.storeId ||
    movement.currencyCode !== book.currencyCode ||
    movement.reversalOfMovementId !== null ||
    operation.tenantId !== book.tenantId ||
    operation.storeId !== bill.storeId ||
    operation.type !== "RECEIPT" ||
    operation.source !== "finance_purchase" ||
    operation.actorUserId !== owner.actorUserId ||
    at(operation.effectiveAt) !== effectiveAt ||
    operation.linkedOperationId !== null ||
    operation.correctionOfOperationId !== null ||
    !/^[a-f0-9]{64}$/.test(operation.payloadHash) ||
    operation.ownerCounts.movements !== 1 ||
    operation.ownerCounts.purchaseReceipts !== 1 ||
    Object.entries(operation.ownerCounts).some(
      ([key, count]) =>
        key !== "movements" && key !== "purchaseReceipts" && count !== 0,
    )
  )
    conflict(
      "Original purchase receipt scope, ownership or correction state changed.",
    )
  if (
    bill.lineCount < 1 ||
    bill.lineCount > 10 ||
    bill.lines.length !== bill.lineCount
  )
    conflict(
      "Purchase proof requires every original bill line within its command bound.",
    )
  unique(bill.lines.map((line) => line.id))
  unique(bill.lines.map((line) => line.receipt?.id ?? ""))
  unique(bill.lines.map((line) => line.receipt?.stockMovementId ?? ""))
  unique(bill.lines.map((line) => line.receipt?.stockOperationId ?? ""))
  const lines = [...bill.lines].sort((a, b) => a.position - b.position)
  let total = 0n
  for (const [position, line] of lines.entries()) {
    const owner = line.receipt
    const account = line.account
    if (
      line.position !== position ||
      line.bookId !== book.id ||
      line.billId !== bill.id ||
      account.bookId !== book.id ||
      account.kind !== "ASSET" ||
      account.purpose !== "INVENTORY" ||
      account.code !== "1300" ||
      !owner ||
      owner.billLineId !== line.id ||
      owner.bookId !== book.id ||
      owner.tenantId !== book.tenantId
    )
      conflict(
        "Original purchase bill lines have incomplete or crossed receipt/account ownership.",
      )
    total += amount(line.amountMinor)
  }
  if (amount(bill.totalMinor) !== total)
    conflict("Original purchase bill total does not conserve every line cost.")
  const line = lines.find((row) => row.id === receipt.billLineId)
  if (
    !line ||
    !line.receipt ||
    financePayloadHash(line.receipt) !== financePayloadHash(receipt)
  )
    conflict("Purchase receipt differs from its exact owning bill line.")
  const effect = q(movement.effect)
  const before = q(movement.before)
  const after = q(movement.after)
  if (effect === "0" || addQuantities(before, effect) !== after)
    conflict("Original purchase receipt quantity chain is inconsistent.")
  if (
    command.bookId !== book.id ||
    command.kind !== owner.commandKind ||
    command.actorUserId !== owner.actorUserId ||
    command.resultId !== owner.sourceId ||
    !command.clientCommandId.trim() ||
    command.clientCommandId.length > 128 ||
    !/^[a-f0-9]{64}$/.test(command.payloadHash) ||
    operation.clientOperationId !==
      financePostingCommandId(
        command.clientCommandId,
        recognition
          ? owner.stockPart
          : `purchase-stock:${book.id}:${line.position}`,
      )
  )
    conflict("Purchase receipt has no exact original document command.")
  if (
    !event ||
    !event.id.trim() ||
    event.tenantId !== book.tenantId ||
    event.bookId !== book.id ||
    !event.poolId.trim() ||
    event.poolTenantId !== book.tenantId ||
    event.poolBookId !== book.id ||
    event.poolBalanceSourceId !== movement.balanceSourceId ||
    event.balanceSourceId !== movement.balanceSourceId ||
    event.stockOperationId !== operation.id ||
    event.stockMovementId !== movement.id ||
    event.purchaseReceiptId !== receipt.id ||
    event.productReturnCostId !== null ||
    event.sequence < 1n ||
    event.sequence > MAX_MINOR ||
    event.kind !== "PURCHASE_RECEIPT" ||
    event.sourceKind !== "PURCHASE_RECEIPT" ||
    event.sourceId !== receipt.id ||
    event.sourceCostMinor !== line.amountMinor ||
    event.actorUserId !== owner.actorUserId ||
    at(event.effectiveAt) !== effectiveAt ||
    q(event.effect) !== effect ||
    q(event.before) !== before ||
    q(event.after) !== after
  )
    conflict("Purchase cost event differs from its original receipt/bill cost.")
  if (
    event.valueBeforeMinor === null
      ? event.valueDeltaMinor !== null ||
        event.valueAfterMinor !== null ||
        event.unknownReason === null
      : event.valueBeforeMinor < 0n ||
        event.valueBeforeMinor > MAX_MINOR ||
        event.valueDeltaMinor !== line.amountMinor ||
        event.valueAfterMinor !== event.valueBeforeMinor + line.amountMinor ||
        event.valueAfterMinor > MAX_MINOR ||
        event.unknownReason !== null
  )
    conflict(
      "Original purchase carrying value differs from its known/unknown source state.",
    )
  const { supplierEntry: entry, journal, postingCommand } = input
  if (
    (recognition
      ? bill.originalEntryCount !== 0 || entry !== null
      : bill.originalEntryCount !== 1 ||
        !entry ||
        !entry.id.trim() ||
        entry.bookId !== book.id ||
        entry.supplierId !== bill.supplierId ||
        entry.billId !== bill.id ||
        entry.kind !== "PURCHASE_BILL" ||
        entry.side !== "CREDIT" ||
        entry.amountMinor !== total ||
        entry.actorUserId !== bill.actorUserId ||
        at(entry.effectiveAt) !== effectiveAt ||
        entry.moneyAccountId !== null ||
        entry.paymentId !== null ||
        entry.reversalOfId !== null ||
        entry.reversalCount !== 0) ||
    !journal ||
    !journal.id.trim() ||
    (!recognition && journal.id !== entry?.journalEntryId) ||
    journal.bookId !== book.id ||
    journal.sequence < 1n ||
    journal.sequence > book.lastSequence ||
    journal.sequence > MAX_MINOR ||
    journal.sourceKind !== owner.sourceKind ||
    journal.sourceId !== owner.sourceId ||
    journal.storeId !== bill.storeId ||
    journal.actorUserId !== owner.actorUserId ||
    at(journal.effectiveAt) !== effectiveAt ||
    journal.description !== bill.description.trim() ||
    journal.reversalOfId !== null ||
    journal.reversed ||
    journal.lines.length !== 2
  )
    conflict(
      "Purchase source lacks its unreversed original supplier/journal posting.",
    )
  unique(journal.lines.map((row) => row.id))
  const inventory = journal.lines.find(
    (row) => row.account.id === line.account.id,
  )
  const counteraccount = journal.lines.find(
    (row) =>
      row.account.code === owner.credit.code &&
      row.account.kind === owner.credit.kind &&
      row.account.purpose === owner.credit.purpose,
  )
  if (
    !inventory ||
    !counteraccount ||
    inventory.id === counteraccount.id ||
    (recognition &&
      (inventory.account.id !== owner.debitAccountId ||
        counteraccount.account.id !== owner.creditAccountId)) ||
    inventory.debitMinor !== total ||
    inventory.creditMinor !== 0n ||
    counteraccount.debitMinor !== 0n ||
    counteraccount.creditMinor !== total ||
    journal.lines.some(
      (row) =>
        row.bookId !== book.id ||
        row.entryId !== journal.id ||
        row.account.bookId !== book.id ||
        row.description !== null,
    ) ||
    lines.some((row) => row.account.id !== inventory.account.id)
  )
    conflict(
      "Purchase journal does not debit exact Inventory and credit its original source control.",
    )
  const originalPosting: PriorCostReviewExpectedPosting = {
    entryId: journal.id,
    input: {
      tenantId: book.tenantId,
      bookId: book.id,
      actorUserId: owner.actorUserId,
      clientCommandId: financePostingCommandId(
        command.clientCommandId,
        owner.journalPart,
      ),
      sourceKind: owner.sourceKind,
      sourceId: owner.sourceId,
      description: bill.description.trim(),
      effectiveAt: new Date(owner.effectiveAt),
      storeId: bill.storeId,
      // Both original writers post Inventory first, then the stage's control.
      lines: [
        {
          accountId: inventory.account.id,
          side: "DEBIT",
          amountMinor: total.toString(),
        },
        {
          accountId: counteraccount.account.id,
          side: "CREDIT",
          amountMinor: total.toString(),
        },
      ],
    },
  }
  const { input: posting } = originalPosting
  const journalHash = financePayloadHash({
    sourceKind: posting.sourceKind,
    sourceId: posting.sourceId,
    description: posting.description,
    effectiveAt: posting.effectiveAt,
    storeId: posting.storeId,
    lines: validateFinanceLines(posting.lines),
  })
  if (
    journal.payloadHash !== journalHash ||
    !postingCommand ||
    !postingCommand.id.trim() ||
    postingCommand.bookId !== book.id ||
    postingCommand.kind !== "POST_JOURNAL" ||
    postingCommand.actorUserId !== owner.actorUserId ||
    postingCommand.clientCommandId !==
      financePostingCommandId(command.clientCommandId, owner.journalPart) ||
    postingCommand.payloadHash !== journalHash ||
    postingCommand.entryId !== journal.id
  )
    conflict(
      "Purchase posting differs from its original journal command/fingerprint.",
    )
  const snapshot = {
    ...input,
    ...(recognition ? { recognition: owner.snapshot } : {}),
    movement: { ...movement, effect, before, after },
    bill: { ...bill, lines },
    journal: {
      ...journal,
      lines: [...journal.lines].sort((a, b) => a.id.localeCompare(b.id)),
    },
  }
  return {
    semantics: { movementId: movement.id, kind: "ORIGIN" as const },
    sourceCostMinor: line.amountMinor,
    originalJournalId: journal.id,
    originalPosting,
    snapshot,
    sourceSnapshotHash: financePayloadHash({
      algorithmVersion: recognition
        ? "original-recognized-purchase-source-v1"
        : "original-purchase-source-v1",
      ...snapshot,
    }),
    requiresPhysicalHistoryProof: true as const,
    requiresCoordinatedSnapshotProof: true as const,
    requiresClassificationProof: true as const,
    requiresConfirmationProof: true as const,
  }
}
