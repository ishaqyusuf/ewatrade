import { expect, test } from "bun:test"
import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import { financePostingCommandId } from "./commands"
import { PURCHASE_RECOGNITION_CONTROLS } from "./purchase-recognition-rules"
import type { ReviewedPurchaseSourceFacts } from "./reviewed-cost-purchase-facts"
import { reviewedPurchaseFixture } from "./reviewed-cost-purchase-fixtures"
import { auditReviewedCostRecognizedPurchaseSource } from "./reviewed-cost-purchase-rules"
import type { ReviewedPurchaseRecognitionFacts } from "./reviewed-cost-recognition-facts"
import { financePayloadHash, validateFinanceLines } from "./rules"

function requireValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing original recognition fixture")
  return value
}
function fixture(prior: FinancePurchaseRecognitionStage[] = []) {
  const input = reviewedPurchaseFixture()
  const receiptAt = new Date("2026-09-04T12:00:00Z")
  input.bill.kind = "PURCHASE_ACCRUAL"
  input.bill.originalEntryCount = 0
  input.supplierEntry = null
  input.book.lastSequence = 5n
  input.operation.actorUserId = "receiver"
  input.operation.effectiveAt = receiptAt
  input.operation.clientOperationId = financePostingCommandId(
    "receipt-command",
    "recognition-stock:goods-0",
  )
  const event = requireValue(input.event)
  event.actorUserId = "receiver"
  event.effectiveAt = receiptAt
  input.command = {
    ...input.command,
    actorUserId: "receiver",
    kind: "RECOGNIZE_PURCHASE",
    clientCommandId: "receipt-command",
    resultId: "receipt-stage",
  }
  const journal = requireValue(input.journal)
  journal.sourceKind = "PURCHASE_RECEIPT_RECOGNITION"
  journal.sourceId = "receipt-stage"
  journal.actorUserId = "receiver"
  journal.effectiveAt = receiptAt
  journal.sequence = BigInt(prior.length + 1)
  const credit = requireValue(
    journal.lines.find((line) => line.creditMinor > 0n),
  )
  const creditCode = prior.includes("OWNERSHIP")
    ? "1310"
    : prior.includes("INVOICE")
      ? "1340"
      : "2050"
  credit.account = {
    id: "receipt-credit",
    bookId: "book",
    code: creditCode,
    ...PURCHASE_RECOGNITION_CONTROLS[creditCode],
  }
  journal.payloadHash = financePayloadHash({
    sourceKind: journal.sourceKind,
    sourceId: journal.sourceId,
    description: journal.description,
    effectiveAt: receiptAt,
    storeId: journal.storeId,
    lines: validateFinanceLines([
      { accountId: "inventory", side: "DEBIT", amountMinor: "300" },
      { accountId: credit.account.id, side: "CREDIT", amountMinor: "300" },
    ]),
  })
  input.postingCommand = {
    ...requireValue(input.postingCommand),
    actorUserId: "receiver",
    clientCommandId: financePostingCommandId(
      "receipt-command",
      "recognition-journal",
    ),
    payloadHash: journal.payloadHash,
  }
  const goods = input.bill.lines.map((line, index) => ({
    id: `goods-${index}`,
    tenantId: "tenant",
    bookId: "book",
    recognitionId: "recognition",
    costBillId: "bill",
    costBillLineId: line.id,
    description: `Goods ${index}`,
    balanceSourceId: index === 0 ? "balance" : "balance-two",
    enteredInventoryUnitId: "unit",
    configurationVersionId: "version",
    enteredQuantity: "2",
    categories: [{ name: "stock" }],
  }))
  const registrationCommand = {
    ...input.command,
    id: "registration-command",
    kind: "REGISTER_PURCHASE",
    actorUserId: "actor",
    clientCommandId: "register-command",
    resultId: "recognition",
  }
  registrationCommand.payloadHash = financePayloadHash({
    bookId: "book",
    clientCommandId: "register-command",
    supplierId: "supplier",
    storeId: "store",
    description: "Purchase",
    agreedAt: input.bill.incurredAt,
    lines: goods.map((line, index) => ({
      balanceSourceId: line.balanceSourceId,
      description: line.description,
      amountMinor: requireValue(input.bill.lines[index]).amountMinor.toString(),
      enteredQuantity: "2",
      enteredInventoryUnitId: "unit",
      expectedConfigurationVersionId: "version",
      categories: line.categories,
      position: index,
    })),
  })
  const stageBase = {
    bookId: "book",
    supplierId: "supplier",
    recognitionId: "recognition",
    debitAccountId: "inventory",
    creditAccountId: credit.account.id,
    actorUserId: "receiver",
    effectiveAt: receiptAt,
    reference: "Receipt source",
    reversalOfId: null,
    reversed: false,
    reason: null,
  }
  const recognition: ReviewedPurchaseRecognitionFacts = {
    id: "recognition",
    tenantId: "tenant",
    bookId: "book",
    supplierId: "supplier",
    storeId: "store",
    costBillId: "bill",
    agreedAt: input.bill.incurredAt,
    actorUserId: "actor",
    registrationCommand,
    goods,
    stages: [
      ...prior.map((stage, index) => ({
        ...stageBase,
        id: `prior-${stage}`,
        stage,
        originalStage: stage,
        journalEntryId: `prior-journal-${stage}`,
        sequence: BigInt(index + 1),
        effectiveAt: new Date(`2026-09-0${index + 2}T12:00:00Z`),
      })),
      {
        ...stageBase,
        id: "receipt-stage",
        stage: "RECEIPT",
        originalStage: "RECEIPT",
        journalEntryId: journal.id,
        sequence: journal.sequence,
      },
    ],
    movementGoods: {
      enteredInventoryUnitId: "unit",
      configurationVersionId: "version",
      enteredQuantity: "2",
    },
  }
  return { input, recognition }
}

for (const [name, prior] of [
  ["receipt before invoice", []],
  ["invoice before receipt", ["INVOICE"]],
  ["ownership before receipt", ["OWNERSHIP"]],
  ["invoice then transit then receipt", ["INVOICE", "OWNERSHIP"]],
  ["transit then invoice then receipt", ["OWNERSHIP", "INVOICE"]],
] satisfies Array<[string, FinancePurchaseRecognitionStage[]]>) {
  test(`recognition cost origin: ${name} uses actual receipt date/actor and one immutable allocation`, () => {
    const { input, recognition } = fixture(prior)
    const result = auditReviewedCostRecognizedPurchaseSource(input, recognition)
    expect(result.sourceCostMinor).toBe(100n)
    expect(result.originalJournalId).toBe("journal")
    expect(result.semantics).toEqual({ movementId: "movement", kind: "ORIGIN" })
    const posting = result.originalPosting.input
    expect(posting.actorUserId).toBe("receiver")
    expect(posting.effectiveAt).toEqual(input.operation.effectiveAt)
    expect(posting.sourceKind).toBe("PURCHASE_RECEIPT_RECOGNITION")
    expect(posting.sourceId).toBe("receipt-stage")
    expect(posting.clientCommandId).toBe(
      financePostingCommandId("receipt-command", "recognition-journal"),
    )
    expect(posting.lines.map((line) => line.accountId)).toEqual([
      "inventory",
      "receipt-credit",
    ])
  })
}
test("a proved acquisition preserves unknown historical carrying value", () => {
  const { input, recognition } = fixture()
  const event = requireValue(input.event)
  event.valueBeforeMinor = event.valueDeltaMinor = event.valueAfterMinor = null
  event.unknownReason = "MISSING_OPENING_COST"
  const result = auditReviewedCostRecognizedPurchaseSource(input, recognition)
  expect(result.sourceCostMinor).toBe(100n)
  expect(result.snapshot.event?.valueAfterMinor).toBeNull()
})
test("complete agreement and stage order normalize into one stable retained source hash", () => {
  const { input, recognition } = fixture(["INVOICE", "OWNERSHIP"])
  const original = financePayloadHash({ input, recognition })
  const first = auditReviewedCostRecognizedPurchaseSource(input, recognition)
  expect(financePayloadHash({ input, recognition })).toBe(original)
  recognition.goods.reverse()
  recognition.stages.reverse()
  input.bill.lines.reverse()
  requireValue(input.journal).lines.reverse()
  expect(
    auditReviewedCostRecognizedPurchaseSource(input, recognition)
      .sourceSnapshotHash,
  ).toBe(first.sourceSnapshotHash)
})
type Mutation = (
  input: ReviewedPurchaseSourceFacts,
  recognition: ReviewedPurchaseRecognitionFacts,
) => void
const cases: Array<[string, Mutation]> = [
  [
    "crossed agreement Tenant",
    (_, r) => {
      r.tenantId = "other"
    },
  ],
  [
    "crossed goods Book",
    (_, r) => {
      requireValue(r.goods[1]).bookId = "other"
    },
  ],
  [
    "changed registration cost",
    (i) => {
      requireValue(i.bill.lines[1]).amountMinor += 1n
    },
  ],
  [
    "changed registration quantity",
    (_, r) => {
      requireValue(r.goods[1]).enteredQuantity = "3"
    },
  ],
  [
    "changed registration categories",
    (_, r) => {
      requireValue(r.goods[1]).categories = [{ name: "Different" }]
    },
  ],
  [
    "missing complete goods",
    (_, r) => {
      r.goods.pop()
    },
  ],
  [
    "reused goods identity",
    (_, r) => {
      requireValue(r.goods[1]).id = "goods-0"
    },
  ],
  [
    "uncommitted registration result",
    (_, r) => {
      r.registrationCommand.resultId = "other"
    },
  ],
  [
    "missing registration fingerprint",
    (_, r) => {
      r.registrationCommand.payloadHash = "0".repeat(64)
    },
  ],
  [
    "crossed entered unit",
    (_, r) => {
      r.movementGoods.enteredInventoryUnitId = "other"
    },
  ],
  [
    "crossed configuration",
    (_, r) => {
      r.movementGoods.configurationVersionId = "other"
    },
  ],
  [
    "changed received quantity",
    (_, r) => {
      r.movementGoods.enteredQuantity = "3"
    },
  ],
  [
    "reversed prior stage",
    (_, r) => {
      requireValue(r.stages[0]).reversed = true
    },
  ],
  [
    "duplicate original stage",
    (_, r) => {
      requireValue(r.stages[1]).stage = "INVOICE"
      requireValue(r.stages[1]).originalStage = "INVOICE"
    },
  ],
  [
    "duplicate stage sequence",
    (_, r) => {
      requireValue(r.stages[1]).sequence = 1n
    },
  ],
  [
    "stage before agreement",
    (_, r) => {
      requireValue(r.stages[0]).effectiveAt = new Date("2025-01-01")
    },
  ],
  [
    "wrong original command",
    (i) => {
      i.command.kind = "RECORD_PURCHASE"
    },
  ],
  [
    "invoice treated as receipt",
    (i) => {
      i.command.resultId = "prior-INVOICE"
    },
  ],
  [
    "receipt assigned agreement actor",
    (i) => {
      i.operation.actorUserId = "actor"
    },
  ],
  [
    "receipt assigned agreement date",
    (i) => {
      i.operation.effectiveAt = i.bill.incurredAt
    },
  ],
  [
    "invented supplier liability",
    (i) => {
      i.bill.originalEntryCount = 1
    },
  ],
  [
    "wrong receipt credit control",
    (i) => {
      requireValue(
        requireValue(i.journal).lines.find((line) => line.creditMinor > 0n),
      ).account.code = "2000"
    },
  ],
  [
    "wrong stock command part",
    (i) => {
      i.operation.clientOperationId = financePostingCommandId(
        "receipt-command",
        "purchase-stock:book:0",
      )
    },
  ],
  [
    "cost event assigned agreement actor",
    (i) => {
      requireValue(i.event).actorUserId = "actor"
    },
  ],
  [
    "detached valuation source",
    (i) => {
      requireValue(i.event).purchaseReceiptId = "other"
    },
  ],
  [
    "receipt past declared cutoff",
    (i) => {
      i.through = i.bill.incurredAt
    },
  ],
]
for (const [name, mutate] of cases) {
  test(`recognized purchase proof rejects ${name}`, () => {
    const { input, recognition } = fixture(["INVOICE", "OWNERSHIP"])
    mutate(input, recognition)
    expect(() =>
      auditReviewedCostRecognizedPurchaseSource(input, recognition),
    ).toThrow()
  })
}
