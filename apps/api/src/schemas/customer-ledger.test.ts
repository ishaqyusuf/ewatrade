import { expect, test } from "bun:test"
import {
  customerLedgerAccountsSchema,
  customerLedgerApplyCreditSchema,
  customerLedgerCommandStatusSchema,
  customerLedgerEnsureAccountSchema,
  customerLedgerEntryDetailSchema,
  customerLedgerOpeningSchema,
  customerLedgerReceiptSchema,
  customerLedgerRefundCreditSchema,
  customerLedgerReleaseAllocationSchema,
  customerLedgerReverseEntrySchema,
  customerLedgerSourcesSchema,
  customerLedgerStatementSchema,
} from "./customer-ledger"

const command = { bookId: "book", clientCommandId: "command" }

test("customer ledger inputs reject caller actor and tenant overrides", () => {
  expect(
    customerLedgerOpeningSchema.safeParse({
      ...command,
      accountId: "account",
      direction: "DEBT",
      amountMinor: "1000",
      reason: "Opening debt",
      tenantId: "other-tenant",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerEnsureAccountSchema.safeParse({
      customerId: "customer",
      currencyCode: "NGN",
      actorUserId: "other-user",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerCommandStatusSchema.safeParse({
      accountId: "account",
      clientCommandId: "command",
      tenantId: "other-tenant",
    }).success,
  ).toBe(false)
})

test("receipt method is allowlisted and effective time remains server-owned", () => {
  const receipt = {
    ...command,
    accountId: "account",
    moneyAccountId: "cash",
    amountMinor: "5000",
    method: "CASH",
    description: "Customer deposit",
  }
  expect(customerLedgerReceiptSchema.safeParse(receipt).success).toBe(true)
  expect(
    customerLedgerReceiptSchema.safeParse({
      ...receipt,
      method: "CHEQUE",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerReceiptSchema.safeParse({
      ...receipt,
      effectiveAt: "2020-01-01T00:00:00.000Z",
    }).success,
  ).toBe(false)
})

test("money and reviewed revisions reject malformed or out-of-range values", () => {
  const apply = {
    ...command,
    accountId: "account",
    expectedRevision: "12",
    creditEntryId: "credit",
    chargeEntryId: "charge",
    amountMinor: "1000",
  }
  expect(customerLedgerApplyCreditSchema.safeParse(apply).success).toBe(true)
  for (const amountMinor of ["0", "-1", "1.25", "1e4", "100000000000001"]) {
    expect(
      customerLedgerApplyCreditSchema.safeParse({
        ...apply,
        amountMinor,
      }).success,
    ).toBe(false)
  }
  expect(
    customerLedgerApplyCreditSchema.safeParse({
      ...apply,
      expectedRevision: "10000000000000000000",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerReleaseAllocationSchema.safeParse({
      ...command,
      accountId: "account",
      expectedRevision: "0",
      allocationId: "allocation",
      amountMinor: "500",
      reason: "Release the settled amount",
    }).success,
  ).toBe(true)
})

test("held-credit refund requires a valid method, reason, sequence and date", () => {
  const refund = {
    ...command,
    accountId: "account",
    expectedRevision: "3",
    creditEntryId: "credit",
    amountMinor: "500",
    moneyAccountId: "cash",
    method: "CASH",
    reason: "Return unused held funds",
    effectiveAt: "2026-10-01T10:00:00.000Z",
  }
  expect(customerLedgerRefundCreditSchema.safeParse(refund).success).toBe(true)
  for (const invalid of [
    { ...refund, method: "UNKNOWN" },
    { ...refund, reason: "   " },
    { ...refund, effectiveAt: "not-a-date" },
    { ...refund, expectedRevision: "-1" },
    { ...refund, actorUserId: "caller" },
  ]) {
    expect(customerLedgerRefundCreditSchema.safeParse(invalid).success).toBe(
      false,
    )
  }
})

test("customer entry reversal requires a strict stable command and finite reviewed date", () => {
  const reversal = {
    ...command,
    accountId: "account",
    entryId: "entry",
    expectedRevision: "4",
    reason: "Correct the duplicate entry",
    effectiveAt: "2026-10-01T10:00:00.000Z",
  }
  expect(customerLedgerReverseEntrySchema.safeParse(reversal).success).toBe(
    true,
  )
  for (const invalid of [
    { ...reversal, expectedRevision: "-1" },
    { ...reversal, expectedRevision: "10000000000000000000" },
    { ...reversal, reason: "   " },
    { ...reversal, reason: "x".repeat(401) },
    { ...reversal, effectiveAt: "not-a-date" },
    { ...reversal, effectiveAt: Number.POSITIVE_INFINITY },
    { ...reversal, actorUserId: "caller" },
    { ...reversal, tenantId: "caller-tenant" },
  ]) {
    expect(customerLedgerReverseEntrySchema.safeParse(invalid).success).toBe(
      false,
    )
  }
})

test("read inputs keep account, currency and bounded cursor fields strict", () => {
  expect(
    customerLedgerAccountsSchema.safeParse({
      customerId: "customer",
      currencyCode: "NGN",
      afterCurrency: "USD",
      limit: 20,
    }).success,
  ).toBe(true)
  expect(
    customerLedgerAccountsSchema.safeParse({
      customerId: "customer",
      currencyCode: "ngn",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerAccountsSchema.safeParse({
      customerId: "customer",
      limit: 100,
    }).success,
  ).toBe(false)
  expect(
    customerLedgerStatementSchema.safeParse({
      accountId: "account",
      afterSequence: "12",
      limit: 50,
    }).success,
  ).toBe(false)
  expect(
    customerLedgerStatementSchema.safeParse({ accountId: "account" }).success,
  ).toBe(true)
  expect(
    customerLedgerStatementSchema.safeParse({
      accountId: "account",
      snapshotSequence: "20",
      afterSequence: "12",
      limit: 50,
    }).success,
  ).toBe(true)
  expect(
    customerLedgerStatementSchema.safeParse({
      accountId: "account",
      afterSequence: "1.2",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerStatementSchema.safeParse({
      accountId: "account",
      cursor: "caller-selected",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerSourcesSchema.safeParse({
      accountId: "account",
      side: "CREDIT",
    }).success,
  ).toBe(true)
  expect(
    customerLedgerSourcesSchema.safeParse({
      accountId: "account",
      side: "CREDIT",
      expectedRevision: "3",
      afterSequence: "10",
      limit: 50,
    }).success,
  ).toBe(true)
  expect(
    customerLedgerSourcesSchema.safeParse({
      accountId: "account",
      side: "CREDIT",
      afterSequence: "10",
    }).success,
  ).toBe(false)
})

test("opening and customer identity schemas require exact valid values", () => {
  expect(
    customerLedgerOpeningSchema.safeParse({
      ...command,
      accountId: "account",
      direction: "CREDIT",
      amountMinor: "2500",
      reason: "Opening advance",
    }).success,
  ).toBe(true)
  expect(
    customerLedgerOpeningSchema.safeParse({
      ...command,
      accountId: "account",
      direction: "OTHER",
      amountMinor: "2500",
      reason: "Opening advance",
    }).success,
  ).toBe(false)
  expect(
    customerLedgerEnsureAccountSchema.safeParse({
      customerId: "customer",
      currencyCode: "US",
    }).success,
  ).toBe(false)
})

test("entry detail pagination pins allocation continuation to reviewed revision", () => {
  expect(
    customerLedgerEntryDetailSchema.safeParse({
      accountId: "account",
      entryId: "entry",
    }).success,
  ).toBe(true)
  expect(
    customerLedgerEntryDetailSchema.safeParse({
      accountId: "account",
      entryId: "entry",
      expectedRevision: "4",
      afterAllocationId: "allocation-1",
      limit: 50,
    }).success,
  ).toBe(true)
  for (const invalid of [
    { accountId: "account", entryId: "entry", afterAllocationId: "a" },
    { accountId: "account", entryId: "entry", expectedRevision: "01" },
    { accountId: "account", entryId: "entry", limit: 51 },
    { accountId: "account", entryId: "entry", tenantId: "caller" },
  ]) {
    expect(customerLedgerEntryDetailSchema.safeParse(invalid).success).toBe(
      false,
    )
  }
})
