import { describe, expect, test } from "bun:test"
import type { ReviewedPurchaseSourceFacts } from "./reviewed-cost-purchase-facts"
import { reviewedPurchaseFixture as fixture } from "./reviewed-cost-purchase-fixtures"
import { auditReviewedCostPurchaseSource } from "./reviewed-cost-purchase-rules"
import { financePayloadHash } from "./rules"

const date = new Date("2026-09-01T12:00:00Z")
function requireValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing purchase source fixture value")
  return value
}
describe("original reviewed purchase acquisition proof", () => {
  test("proves the line cost, original posted liability and immutable source facts", () => {
    const input = fixture()
    const before = financePayloadHash(input)
    const result = auditReviewedCostPurchaseSource(input)
    expect(result.semantics).toEqual({ movementId: "movement", kind: "ORIGIN" })
    expect(result.sourceCostMinor).toBe(100n)
    expect(result.originalJournalId).toBe("journal")
    expect(result.requiresPhysicalHistoryProof).toBe(true)
    expect(result.requiresCoordinatedSnapshotProof).toBe(true)
    expect(result.requiresClassificationProof).toBe(true)
    expect(result.requiresConfirmationProof).toBe(true)
    expect(financePayloadHash(input)).toBe(before)
  })
  test("a known receipt does not fabricate a known previous carrying value", () => {
    const input = fixture()
    const event = requireValue(input.event)
    event.valueBeforeMinor = null
    event.valueDeltaMinor = null
    event.valueAfterMinor = null
    event.unknownReason = "PRIOR_UNKNOWN_COST"
    const result = auditReviewedCostPurchaseSource(input)
    expect(result.sourceCostMinor).toBe(100n)
    expect(result.snapshot.event?.valueAfterMinor).toBeNull()
  })
  test("normalizes decimal/order variants and binds actual source facts", () => {
    const input = fixture()
    const hash = auditReviewedCostPurchaseSource(input).sourceSnapshotHash
    input.bill.lines.reverse()
    requireValue(input.journal).lines.reverse()
    input.movement.effect = "2.000"
    input.movement.before = "0.000"
    input.movement.after = "2.000"
    expect(auditReviewedCostPurchaseSource(input).sourceSnapshotHash).toBe(hash)
    input.command.payloadHash = "c".repeat(64)
    expect(auditReviewedCostPurchaseSource(input).sourceSnapshotHash).not.toBe(
      hash,
    )
  })
  const cases: Array<[string, (input: ReviewedPurchaseSourceFacts) => void]> = [
    [
      "crossed receipt Tenant",
      (x) => {
        x.receipt.tenantId = "foreign"
      },
    ],
    [
      "wrong currency",
      (x) => {
        x.bill.currencyCode = "USD"
      },
    ],
    [
      "crossed supplier Book",
      (x) => {
        x.bill.supplierBookId = "foreign"
      },
    ],
    [
      "unowned movement",
      (x) => {
        x.operation.ownerCounts.purchaseReceipts = 0
      },
    ],
    [
      "extra movement",
      (x) => {
        x.operation.ownerCounts.movements = 2
      },
    ],
    [
      "overlapping Product source",
      (x) => {
        x.operation.ownerCounts.productFulfillments = 1
      },
    ],
    [
      "source correction",
      (x) => {
        x.operation.ownerCounts.corrections = 1
      },
    ],
    [
      "unowned receipt label",
      (x) => {
        x.operation.source = "ordinary"
      },
    ],
    [
      "reversal movement",
      (x) => {
        x.movement.reversalOfMovementId = "original"
      },
    ],
    [
      "before Book start",
      (x) => {
        x.book.startsAt = new Date(date.getTime() + 1)
      },
    ],
    [
      "past declared history",
      (x) => {
        x.through = new Date(date.getTime() - 1)
      },
    ],
    [
      "invalid date",
      (x) => {
        x.bill.incurredAt = new Date(Number.NaN)
      },
    ],
    [
      "incomplete bill lines",
      (x) => {
        x.bill.lineCount = 3
      },
    ],
    [
      "overlarge bill",
      (x) => {
        x.bill.lineCount = 11
      },
    ],
    [
      "duplicated bill line",
      (x) => {
        x.bill.lines.push(requireValue(x.bill.lines[0]))
        x.bill.lineCount++
      },
    ],
    [
      "crossed line Book",
      (x) => {
        requireValue(x.bill.lines[1]).bookId = "foreign"
      },
    ],
    [
      "missing other receipt",
      (x) => {
        requireValue(x.bill.lines[1]).receipt = null
      },
    ],
    [
      "wrong Inventory account",
      (x) => {
        requireValue(x.bill.lines[0]).account.purpose = "OTHER"
      },
    ],
    [
      "nonconserved bill total",
      (x) => {
        x.bill.totalMinor = 301n
      },
    ],
    [
      "zero source line",
      (x) => {
        requireValue(x.bill.lines[0]).amountMinor = 0n
      },
    ],
    [
      "negative source line",
      (x) => {
        requireValue(x.bill.lines[0]).amountMinor = -1n
      },
    ],
    [
      "fabricated bill result",
      (x) => {
        x.command.resultId = "other-bill"
      },
    ],
    [
      "wrong original command",
      (x) => {
        x.command.kind = "RECORD_EXPENSE"
      },
    ],
    [
      "wrong operation command",
      (x) => {
        x.operation.clientOperationId = "fake"
      },
    ],
    [
      "missing cost event",
      (x) => {
        x.event = null
      },
    ],
    [
      "crossed event Book",
      (x) => {
        requireValue(x.event).bookId = "foreign"
      },
    ],
    [
      "incorrect recorded cost",
      (x) => {
        requireValue(x.event).sourceCostMinor = 101n
      },
    ],
    [
      "fake current value",
      (x) => {
        requireValue(x.event).valueAfterMinor = 101n
      },
    ],
    [
      "mixed unknown value",
      (x) => {
        requireValue(x.event).valueBeforeMinor = null
      },
    ],
    [
      "detached cost source",
      (x) => {
        requireValue(x.event).purchaseReceiptId = "other"
      },
    ],
    [
      "changed quantity",
      (x) => {
        x.movement.after = "3"
      },
    ],
    [
      "negative origin",
      (x) => {
        x.movement.effect = "-2"
      },
    ],
    [
      "source bill correction",
      (x) => {
        x.bill.corrected = true
      },
    ],
    [
      "missing original liability",
      (x) => {
        x.supplierEntry = null
      },
    ],
    [
      "duplicate original liability",
      (x) => {
        x.bill.originalEntryCount = 2
      },
    ],
    [
      "wrong supplier",
      (x) => {
        requireValue(x.supplierEntry).supplierId = "other"
      },
    ],
    [
      "incorrect payable total",
      (x) => {
        requireValue(x.supplierEntry).amountMinor = 299n
      },
    ],
    [
      "reversed supplier source",
      (x) => {
        requireValue(x.supplierEntry).reversalCount = 1
      },
    ],
    [
      "fabricated paid source",
      (x) => {
        requireValue(x.supplierEntry).moneyAccountId = "cash"
      },
    ],
    [
      "missing journal",
      (x) => {
        x.journal = null
      },
    ],
    [
      "uncommitted journal sequence",
      (x) => {
        requireValue(x.journal).sequence = 2n
      },
    ],
    [
      "reversed journal",
      (x) => {
        requireValue(x.journal).reversed = true
      },
    ],
    [
      "wrong journal source",
      (x) => {
        requireValue(x.journal).sourceId = "other"
      },
    ],
    [
      "wrong journal actor",
      (x) => {
        requireValue(x.journal).actorUserId = "other"
      },
    ],
    [
      "extra journal line",
      (x) => {
        const j = requireValue(x.journal)
        j.lines.push(requireValue(j.lines[0]))
      },
    ],
    [
      "wrong Inventory debit",
      (x) => {
        requireValue(requireValue(x.journal).lines[0]).debitMinor = 299n
      },
    ],
    [
      "wrong Payable credit",
      (x) => {
        requireValue(requireValue(x.journal).lines[1]).creditMinor = 299n
      },
    ],
    [
      "cash counterpart",
      (x) => {
        requireValue(requireValue(x.journal).lines[1]).account.purpose = "CASH"
      },
    ],
    [
      "journal fingerprint drift",
      (x) => {
        requireValue(x.journal).payloadHash = "d".repeat(64)
      },
    ],
    [
      "missing posting command",
      (x) => {
        x.postingCommand = null
      },
    ],
    [
      "wrong posting command result",
      (x) => {
        requireValue(x.postingCommand).entryId = "other"
      },
    ],
    [
      "posting command fingerprint drift",
      (x) => {
        requireValue(x.postingCommand).payloadHash = "d".repeat(64)
      },
    ],
  ]
  for (const [label, mutate] of cases)
    test(`rejects ${label}`, () => {
      const input = fixture()
      mutate(input)
      expect(() => auditReviewedCostPurchaseSource(input)).toThrow()
    })
})
