import { expect, test } from "bun:test"
import {
  financeBillPaymentSchema,
  financeCashAdjustmentReversalSchema,
  financeExpenseSchema,
  financeMoneySchema,
  financePeriodCloseChecklistSchema,
} from "./finance"

test("owner-funded payments cannot also claim a business money account", () => {
  const payment = {
    bookId: "book",
    billId: "bill",
    clientCommandId: "owner-payment",
    funding: "OWNER_CAPITAL",
    amountMinor: "1000",
    effectiveAt: "2026-02-01",
  }
  expect(financeBillPaymentSchema.safeParse(payment).success).toBe(true)
  expect(
    financeBillPaymentSchema.safeParse({ ...payment, accountId: "cash" })
      .success,
  ).toBe(false)
  expect(
    financeBillPaymentSchema.safeParse({
      ...payment,
      funding: "BUSINESS_ACCOUNT",
    }).success,
  ).toBe(false)
  expect(
    financeBillPaymentSchema.safeParse({
      ...payment,
      funding: "BUSINESS_ACCOUNT",
      accountId: "cash",
    }).success,
  ).toBe(true)
  expect(
    financeExpenseSchema.safeParse({
      bookId: "book",
      clientCommandId: "expense",
      payeeName: "Supplier",
      description: "Transport",
      incurredAt: "2026-02-01",
      lines: [
        { accountId: "expense", description: "Transport", amountMinor: "1000" },
      ],
      payment: {
        funding: "OWNER_CAPITAL",
        amountMinor: "1000",
        effectiveAt: "2026-02-01",
      },
    }).success,
  ).toBe(true)
})

const contribution = {
  bookId: "book",
  clientCommandId: "command",
  accountId: "cash",
  amountMinor: "1000",
  description: "Owner contribution",
  effectiveAt: "2026-01-01",
  kind: "OWNER_CONTRIBUTION",
}

test("malformed money returns validation failures without throwing a BigInt error", () => {
  for (const amountMinor of [
    "",
    "1.5",
    "1e4",
    "no",
    "-1",
    "0",
    "100000000000001",
  ]) {
    expect(
      financeMoneySchema.safeParse({ ...contribution, amountMinor }).success,
    ).toBe(false)
  }
  expect(financeMoneySchema.safeParse(contribution).success).toBe(true)
})

test("money workflows require transfer destination and reject actor overrides", () => {
  expect(
    financeMoneySchema.safeParse({ ...contribution, kind: "TRANSFER" }).success,
  ).toBe(false)
  expect(
    financeMoneySchema.safeParse({
      ...contribution,
      kind: "TRANSFER",
      destinationAccountId: "bank",
    }).success,
  ).toBe(true)
  expect(
    financeMoneySchema.safeParse({ ...contribution, tenantId: "other" })
      .success,
  ).toBe(false)
  expect(
    financeMoneySchema.safeParse({ ...contribution, kind: "JOURNAL" }).success,
  ).toBe(false)
})

const cashAdjustmentReversal = {
  bookId: "book",
  clientCommandId: "reverse-command",
  entryId: "adjustment-entry",
  expectedSnapshotSequence: "12",
  reason: "The adjustment was entered in error",
  effectiveAt: "2026-10-01T10:00:00.000Z",
}

test("cash adjustment reversals require reviewed sequence, reason, and date", () => {
  expect(
    financeCashAdjustmentReversalSchema.safeParse(cashAdjustmentReversal)
      .success,
  ).toBe(true)
  for (const invalid of [
    { ...cashAdjustmentReversal, expectedSnapshotSequence: undefined },
    { ...cashAdjustmentReversal, expectedSnapshotSequence: "not-a-sequence" },
    { ...cashAdjustmentReversal, reason: undefined },
    { ...cashAdjustmentReversal, reason: "   " },
    { ...cashAdjustmentReversal, effectiveAt: "not-a-date" },
    { ...cashAdjustmentReversal, effectiveAt: undefined },
    { ...cashAdjustmentReversal, tenantId: "caller-chosen-tenant" },
    { ...cashAdjustmentReversal, actorUserId: "caller-chosen-actor" },
  ]) {
    expect(financeCashAdjustmentReversalSchema.safeParse(invalid).success).toBe(
      false,
    )
  }
})

const periodCloseThrough = new Date("2025-12-31T23:59:59.999Z")

test("strict checklist input permits only Book and cutoff, never caller authority or verdict", () => {
  expect(
    financePeriodCloseChecklistSchema.parse({
      bookId: "book",
      through: periodCloseThrough.toISOString(),
    }).through,
  ).toEqual(periodCloseThrough)
  for (const extra of [
    { tenantId: "other" },
    { actorUserId: "owner" },
    { snapshotSequence: "9" },
    { operationallyReconciled: true },
    { checks: [] },
  ]) {
    expect(
      financePeriodCloseChecklistSchema.safeParse({
        bookId: "book",
        through: periodCloseThrough,
        ...extra,
      }).success,
    ).toBe(false)
  }
})
