import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { normalizeStockCategorySelectors } from "@ewatrade/utils/inventory-categories"
import {
  PURCHASE_RECOGNITION_CONTROLS,
  purchaseRecognitionPosting,
} from "./purchase-recognition-rules"
import type { ReviewedPurchaseSourceFacts } from "./reviewed-cost-purchase-facts"
import type { ReviewedPurchaseRecognitionFacts } from "./reviewed-cost-recognition-facts"
import { FinanceError, financePayloadHash } from "./rules"

function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Purchase recognition differs from its original agreement, goods or dated stages.",
  )
}
function date(value: Date) {
  const time = value.getTime()
  if (!Number.isFinite(time)) conflict()
  return time
}
function identities(values: string[]) {
  if (
    values.some((value) => !value.trim()) ||
    new Set(values).size !== values.length
  )
    conflict()
}
function quantity(value: string) {
  try {
    return parseExactDecimal(value, { allowZero: false, maxScale: 18 })
  } catch {
    conflict()
  }
}

/** Stage journals are independently loaded/verified before this retained proof. */
export function auditReviewedPurchaseRecognitionOwner(
  input: ReviewedPurchaseSourceFacts,
  recognition: ReviewedPurchaseRecognitionFacts,
) {
  const { book, bill, receipt, movement, command, journal } = input
  const registration = recognition.registrationCommand
  if (
    !recognition.id.trim() ||
    recognition.tenantId !== book.tenantId ||
    recognition.bookId !== book.id ||
    recognition.supplierId !== bill.supplierId ||
    recognition.storeId !== bill.storeId ||
    recognition.costBillId !== bill.id ||
    recognition.actorUserId !== bill.actorUserId ||
    date(recognition.agreedAt) !== date(bill.incurredAt) ||
    date(recognition.agreedAt) < date(book.startsAt) ||
    recognition.goods.length !== bill.lineCount ||
    recognition.goods.length < 1 ||
    recognition.goods.length > 10 ||
    bill.lines.length !== recognition.goods.length ||
    recognition.stages.length < 1 ||
    recognition.stages.length > 3 ||
    !registration.id.trim() ||
    registration.bookId !== book.id ||
    registration.kind !== "REGISTER_PURCHASE" ||
    registration.actorUserId !== bill.actorUserId ||
    registration.resultId !== recognition.id ||
    !registration.clientCommandId.trim() ||
    registration.clientCommandId.length > 128 ||
    registration.id === command.id
  )
    conflict()
  identities(recognition.goods.map((line) => line.id))
  identities(recognition.goods.map((line) => line.costBillLineId))
  identities(recognition.goods.map((line) => line.balanceSourceId))
  const goods = [...recognition.goods].sort((a, b) => {
    const left = bill.lines.find((line) => line.id === a.costBillLineId)
    const right = bill.lines.find((line) => line.id === b.costBillLineId)
    if (!left || !right) conflict()
    return left.position - right.position
  })
  const registeredLines = goods.map((line, position) => {
    const cost = bill.lines.find((row) => row.id === line.costBillLineId)
    if (
      !cost ||
      cost.position !== position ||
      line.tenantId !== book.tenantId ||
      line.bookId !== book.id ||
      line.recognitionId !== recognition.id ||
      line.costBillId !== bill.id ||
      !line.description.trim() ||
      line.description.length > 200 ||
      !line.enteredInventoryUnitId.trim() ||
      !line.configurationVersionId.trim()
    )
      conflict()
    let categories: typeof line.categories
    try {
      categories = normalizeStockCategorySelectors(line.categories)
    } catch {
      conflict()
    }
    if (!categories.length) conflict()
    return {
      balanceSourceId: line.balanceSourceId,
      description: line.description,
      amountMinor: cost.amountMinor.toString(),
      enteredQuantity: quantity(line.enteredQuantity),
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      expectedConfigurationVersionId: line.configurationVersionId,
      categories,
      position,
    }
  })
  if (
    registration.payloadHash !==
    financePayloadHash({
      bookId: book.id,
      clientCommandId: registration.clientCommandId,
      supplierId: recognition.supplierId,
      storeId: recognition.storeId,
      description: bill.description,
      agreedAt: recognition.agreedAt,
      lines: registeredLines,
    })
  )
    conflict()

  identities(recognition.stages.map((stage) => stage.id))
  identities(recognition.stages.map((stage) => stage.journalEntryId))
  const stages = [...recognition.stages].sort((a, b) =>
    a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0,
  )
  const prior = new Set<(typeof stages)[number]["stage"]>()
  let previousDate = date(recognition.agreedAt)
  let previousSequence = 0n
  let receiptPosting: ReturnType<typeof purchaseRecognitionPosting> | undefined
  for (const stage of stages) {
    if (
      stage.bookId !== book.id ||
      stage.supplierId !== bill.supplierId ||
      stage.recognitionId !== recognition.id ||
      stage.originalStage !== stage.stage ||
      stage.reversalOfId !== null ||
      stage.reversed ||
      stage.reason !== null ||
      !stage.actorUserId.trim() ||
      !stage.reference.trim() ||
      stage.reference.length > 160 ||
      !stage.debitAccountId.trim() ||
      !stage.creditAccountId.trim() ||
      stage.sequence <= previousSequence ||
      stage.sequence > book.lastSequence ||
      date(stage.effectiveAt) < previousDate
    )
      conflict()
    const posting = purchaseRecognitionPosting(stage.stage, prior)
    if (stage.stage === "RECEIPT") receiptPosting = posting
    prior.add(stage.stage)
    previousSequence = stage.sequence
    previousDate = date(stage.effectiveAt)
  }
  const stage = stages.find((row) => row.stage === "RECEIPT")
  const selected = goods.find(
    (line) => line.costBillLineId === receipt.billLineId,
  )
  if (
    !stage ||
    !selected ||
    !receiptPosting ||
    !journal ||
    stage.journalEntryId !== journal.id ||
    stage.sequence !== journal.sequence ||
    command.resultId !== stage.id ||
    command.actorUserId !== stage.actorUserId ||
    selected.balanceSourceId !== movement.balanceSourceId ||
    selected.enteredInventoryUnitId !==
      recognition.movementGoods.enteredInventoryUnitId ||
    selected.configurationVersionId !==
      recognition.movementGoods.configurationVersionId ||
    quantity(selected.enteredQuantity) !==
      quantity(recognition.movementGoods.enteredQuantity)
  )
    conflict()
  const credit = PURCHASE_RECOGNITION_CONTROLS[receiptPosting.credit]
  return {
    actorUserId: stage.actorUserId,
    effectiveAt: stage.effectiveAt,
    sourceKind: "PURCHASE_RECEIPT_RECOGNITION",
    sourceId: stage.id,
    commandKind: "RECOGNIZE_PURCHASE",
    stockPart: `recognition-stock:${selected.id}`,
    journalPart: "recognition-journal",
    debitAccountId: stage.debitAccountId,
    creditAccountId: stage.creditAccountId,
    credit: {
      code: receiptPosting.credit,
      kind: credit.kind,
      purpose: credit.purpose,
    },
    snapshot: { ...recognition, goods, stages },
  }
}
