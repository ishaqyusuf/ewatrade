import { expect, test } from "bun:test"
import type {
  LedgerAccount,
  LedgerMoneyAccount,
  LedgerSource,
} from "../../components/mobile/customer-ledger/types"
import {
  type LedgerFields,
  customerLedgerReviewTotals,
  eligibleLedgerMoneyAccounts,
  prepareCustomerLedgerCommand,
} from "./command-input"
const now = new Date("2026-10-02T10:00:00.000Z")
const account: LedgerAccount = {
  id: "a",
  customer: { id: "c", name: "Amina", email: null, phone: null },
  currencyCode: "NGN",
  revision: "3",
  snapshotSequence: "3",
  book: { id: "b", currencyCode: "NGN", startsAt: now },
  totals: {
    debitMinor: "2400000",
    creditMinor: "600000",
    allocatedMinor: "0",
    outstandingDebtMinor: "2400000",
    availableCreditMinor: "600000",
    netBalanceMinor: "1800000",
  },
  coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
}
const fields: LedgerFields = {
  amount: "6000.01",
  reason: "Customer receipt",
  reference: "",
  direction: "DEBT",
  method: "CASH",
  moneyAccountId: "cash",
  creditEntryId: "credit",
  chargeEntryId: "debt",
  revision: "3",
  date: now.toISOString(),
}
const money = (
  id: string,
  purpose: LedgerMoneyAccount["purpose"],
): LedgerMoneyAccount => ({
  id,
  bookId: "b",
  code: id,
  name: id,
  kind: "ASSET",
  purpose,
  archivedAt: null,
  createdAt: now,
  debitMinor: "0",
  creditMinor: "0",
  balanceMinor: "0",
})
const credit: LedgerSource = {
  id: "credit",
  sequence: "2",
  kind: "RECEIPT",
  side: "CREDIT",
  amountMinor: "600001",
  usedAmountMinor: "0",
  remainingAmountMinor: "600001",
  sourceKind: "CUSTOMER_RECEIPT",
  sourceId: "receipt",
  effectiveAt: now,
  order: null,
}
const charge: LedgerSource = {
  ...credit,
  id: "debt",
  sequence: "1",
  kind: "OPENING_DEBT",
  side: "DEBIT",
  amountMinor: "2400000",
  remainingAmountMinor: "2400000",
}
test("receipt and applying credit remain different commands and exact minor amounts", () => {
  const receipt = prepareCustomerLedgerCommand({
    mode: "receipt",
    account,
    fields,
    moneyAccounts: [money("cash", "CASH")],
  })
  expect(receipt.operation).toBe("recordReceipt")
  expect(receipt.payload).toMatchObject({
    amountMinor: "600001",
    moneyAccountId: "cash",
  })
  expect(receipt.payload).not.toHaveProperty("expectedRevision")
  const applied = prepareCustomerLedgerCommand({
    mode: "apply",
    account,
    fields,
    credits: [credit],
    charges: [charge],
  })
  expect(applied.operation).toBe("applyCredit")
  expect(applied.payload).toMatchObject({
    amountMinor: "600001",
    expectedRevision: "3",
    creditEntryId: "credit",
    chargeEntryId: "debt",
  })
  expect(applied.payload).not.toHaveProperty("moneyAccountId")
  expect(applied.payload).not.toHaveProperty("method")
})
test("method guards exclude archived accounts and cash from card collection", () => {
  const cash = money("cash", "CASH")
  const bank = money("bank", "BANK")
  const clearing = money("clearing", "CLEARING")
  expect(
    eligibleLedgerMoneyAccounts([cash, bank, clearing], "CASH").map(
      (a) => a.id,
    ),
  ).toEqual(["cash"])
  expect(
    eligibleLedgerMoneyAccounts([cash, bank, clearing], "BANK_TRANSFER").map(
      (a) => a.id,
    ),
  ).toEqual(["bank"])
  expect(
    eligibleLedgerMoneyAccounts([cash, bank, clearing], "CARD").map(
      (a) => a.id,
    ),
  ).toEqual(["bank", "clearing"])
  expect(
    eligibleLedgerMoneyAccounts(
      [{ ...bank, archivedAt: now }],
      "BANK_TRANSFER",
    ),
  ).toEqual([])
  expect(() =>
    prepareCustomerLedgerCommand({
      mode: "receipt",
      account,
      fields: { ...fields, method: "CARD" },
      moneyAccounts: [cash],
    }),
  ).toThrow("money account")
})
test("source caps use exact integers and reject missing or exhausted credits", () => {
  expect(() =>
    prepareCustomerLedgerCommand({
      mode: "apply",
      account,
      fields,
      credits: [{ ...credit, remainingAmountMinor: "600000" }],
      charges: [charge],
    }),
  ).toThrow("remaining balance")
  expect(() =>
    prepareCustomerLedgerCommand({
      mode: "apply",
      account,
      fields,
      credits: [credit],
      charges: [{ ...charge, remainingAmountMinor: "1" }],
    }),
  ).toThrow("remaining balance")
  expect(() =>
    prepareCustomerLedgerCommand({
      mode: "refund",
      account,
      fields,
      moneyAccounts: [money("cash", "CASH")],
      credits: [],
    }),
  ).toThrow("available credit")
})
test("refund retains the exact UTC time so same-day receipts can be corrected", () => {
  const result = prepareCustomerLedgerCommand({
    mode: "refund",
    account,
    fields,
    credits: [credit],
    moneyAccounts: [money("cash", "CASH")],
  })
  expect(result.operation).toBe("refundUnusedCredit")
  expect(result.payload).toMatchObject({
    effectiveAt: now,
    expectedRevision: "3",
    amountMinor: "600001",
  })
  expect(() =>
    prepareCustomerLedgerCommand({
      mode: "refund",
      account,
      fields: { ...fields, date: "2026-02-30T10:00:00.000Z" },
      credits: [credit],
      moneyAccounts: [money("cash", "CASH")],
    }),
  ).toThrow("valid ISO")
  expect(() =>
    prepareCustomerLedgerCommand({ mode: "reverse", account, fields }),
  ).toThrow("standalone correction")
})

test("applying credit preserves net balance while a receipt only increases held credit", () => {
  const applied = prepareCustomerLedgerCommand({
    mode: "apply",
    account,
    fields: { ...fields, amount: "6000" },
    credits: [credit],
    charges: [charge],
  })
  expect(customerLedgerReviewTotals(account, applied)).toEqual({
    outstandingDebtMinor: "1800000",
    availableCreditMinor: "0",
    netBalanceMinor: "1800000",
  })
  const receipt = prepareCustomerLedgerCommand({
    mode: "receipt",
    account,
    fields: { ...fields, amount: "2500" },
    moneyAccounts: [money("cash", "CASH")],
  })
  expect(customerLedgerReviewTotals(account, receipt)).toEqual({
    outstandingDebtMinor: "2400000",
    availableCreditMinor: "850000",
    netBalanceMinor: "1550000",
  })
  const refund = prepareCustomerLedgerCommand({
    mode: "refund",
    account,
    fields: { ...fields, amount: "2500" },
    credits: [credit],
    moneyAccounts: [money("cash", "CASH")],
  })
  expect(customerLedgerReviewTotals(account, refund)).toEqual({
    outstandingDebtMinor: "2400000",
    availableCreditMinor: "350000",
    netBalanceMinor: "2050000",
  })
})
