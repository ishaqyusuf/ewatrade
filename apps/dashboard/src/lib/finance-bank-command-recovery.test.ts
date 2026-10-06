import { describe, expect, test } from "bun:test"
import {
  isFinanceCommandRecoveryMetadata,
  validatePendingFinanceCommand,
} from "@ewatrade/utils/finance-command-identity"
import {
  createPendingFinanceCommand,
  matchesPendingFinanceCommand,
} from "./finance-command-recovery"

const scope = { actorUserId: "actor", tenantId: "tenant", bookId: "book" }
const metadata = {
  accountId: "bank",
  expectedBankRevision: "1",
  expectedSnapshotSequence: "2",
  bankReview: {
    statementId: "statement",
    action: "MATCH" as const,
    bankRowIds: ["row"],
    journalLineIds: ["line"],
  },
}
const payload = {
  bookId: "book",
  accountId: "bank",
  expectedRevision: "1",
  expectedSnapshotSequence: "2",
  bankRowIds: ["row"],
  journalLineIds: ["line"],
  reason: "Original explanation",
}
describe("bank matching recovery identity", () => {
  test("retains bounded identities only and rejects sensitive or malformed metadata", () => {
    expect(isFinanceCommandRecoveryMetadata(metadata)).toBe(true)
    for (const extra of [
      { reason: "sensitive" },
      { amountMinor: "100" },
      { bankRowIds: [] },
      { journalLineIds: Array(51).fill("line") },
      { bankRowIds: ["row", "row"] },
      { statementId: "x".repeat(129) },
      { action: "UNMATCH" },
    ])
      expect(
        isFinanceCommandRecoveryMetadata({
          ...metadata,
          bankReview: { ...metadata.bankReview, ...extra },
        }),
      ).toBe(false)
    expect(
      isFinanceCommandRecoveryMetadata({
        ...metadata,
        expectedSnapshotSequence: "9223372036854775808",
      }),
    ).toBe(false)
    expect(
      isFinanceCommandRecoveryMetadata({
        ...metadata,
        expectedBankRevision: undefined,
      }),
    ).toBe(false)
  })
  test("exact retry preserves reason, both revisions and operation; metadata cannot switch commands", async () => {
    const pending = await createPendingFinanceCommand(scope, {
      operation: "matchBankStatement",
      payload,
      recoveryMetadata: metadata,
    })
    expect(validatePendingFinanceCommand(pending, scope)).toEqual(pending)
    expect(() =>
      validatePendingFinanceCommand(
        { ...pending, operation: "recordMoney" },
        scope,
      ),
    ).toThrow()
    expect(
      await matchesPendingFinanceCommand(pending, {
        operation: "matchBankStatement",
        payload,
      }),
    ).toBe(true)
    for (const change of [
      { reason: "New explanation" },
      { expectedRevision: "2" },
      { expectedSnapshotSequence: "3" },
      { bankRowIds: ["other"] },
    ])
      expect(
        await matchesPendingFinanceCommand(pending, {
          operation: "matchBankStatement",
          payload: { ...payload, ...change },
        }),
      ).toBe(false)
    expect(JSON.stringify(pending)).not.toContain("Original explanation")
  })
  test("release retains original match revision without reason or financial payload", () => {
    const release = {
      ...metadata,
      bankReview: {
        statementId: "statement",
        action: "UNMATCH",
        matchId: "match",
        matchRevision: "2",
      },
    }
    expect(isFinanceCommandRecoveryMetadata(release)).toBe(true)
    for (const change of [
      { matchRevision: undefined },
      { matchRevision: "01" },
      { matchRevision: "9223372036854775808" },
      { bankRowIds: ["row"] },
    ])
      expect(
        isFinanceCommandRecoveryMetadata({
          ...release,
          bankReview: { ...release.bankReview, ...change },
        }),
      ).toBe(false)
  })
})

describe("original purchase payment recovery", () => {
  test("requires the exact owning payment, reason and accounting timestamp without storing financial payload", async () => {
    const purchase = {
      bookId: "book",
      paymentId: "payment",
      reason: "Correct original source",
      effectiveAt: new Date("2026-09-02T12:30:00.123Z"),
    }
    const pending = await createPendingFinanceCommand(scope, {
      operation: "reversePurchasePayment",
      payload: purchase,
      recoveryMetadata: { entryId: "payment", accountId: "bank" },
    })
    expect(validatePendingFinanceCommand(pending, scope)).toEqual(pending)
    expect(
      await matchesPendingFinanceCommand(pending, {
        operation: "reversePurchasePayment",
        payload: purchase,
      }),
    ).toBe(true)
    for (const change of [
      { paymentId: "bank-journal" },
      { reason: "Other" },
      { effectiveAt: new Date("2026-09-02T12:30:00.124Z") },
    ])
      expect(
        await matchesPendingFinanceCommand(pending, {
          operation: "reversePurchasePayment",
          payload: { ...purchase, ...change },
        }),
      ).toBe(false)
    expect(
      await matchesPendingFinanceCommand(pending, {
        operation: "reverseSupplierEntry",
        payload: purchase,
      }),
    ).toBe(false)
    for (const key of ["reason", "effectiveAt", "paymentId", "billId"])
      expect(
        isFinanceCommandRecoveryMetadata({
          ...pending.recoveryMetadata,
          [key]: "private",
        }),
      ).toBe(false)
    expect(JSON.stringify(pending)).not.toContain(purchase.reason)
    expect(JSON.stringify(pending)).not.toContain(
      purchase.effectiveAt.toISOString(),
    )
  })
})
