import { expect, test } from "bun:test"
import { z } from "zod"
import {
  generalCustomerAccountsInput,
  generalCustomerSourcesInput,
  generalCustomerStatementInput,
  generalCustomerAccountAnswer,
  generalCustomerSourcesAnswers,
  generalCustomerStatementAnswer,
} from "./general-customer-funds"

test("funds tools retain strict scope, bounded pages and canonical continuation guards", () => {
  expect(
    generalCustomerAccountsInput.safeParse({
      customerId: "customer",
      afterCurrency: "NGN",
    }).success,
  ).toBe(true)
  expect(
    generalCustomerAccountsInput.safeParse({
      customerId: "customer",
      tenantId: "foreign",
    }).success,
  ).toBe(false)
  for (const schema of [
    generalCustomerSourcesInput,
    generalCustomerStatementInput,
  ]) {
    expect(z.toJSONSchema(schema).type).toBe("object")
    expect(
      schema.safeParse({
        accountId: "account",
        side: "CREDIT",
        afterSequence: "3",
      }).success,
    ).toBe(false)
    expect(schema.safeParse({ accountId: "account", limit: 50 }).success).toBe(
      false,
    )
  }
  expect(
    generalCustomerSourcesInput.parse({
      accountId: "account",
      side: "CREDIT",
      expectedRevision: "4",
      afterSequence: "3",
    }).limit,
  ).toBe(10)
  expect(
    generalCustomerStatementInput.safeParse({
      accountId: "account",
      afterSequence: "3",
    }).success,
  ).toBe(false)
  expect(
    generalCustomerStatementInput.parse({
      accountId: "account",
      snapshotSequence: "4",
      afterSequence: "3",
    }).limit,
  ).toBe(10)
  expect(
    generalCustomerSourcesInput.safeParse({
      accountId: "account",
      side: "CREDIT",
      actorUserId: "foreign",
    }).success,
  ).toBe(false)
})

test("account answer keeps exact balances and missing Book separate from refundable cash", () => {
  const account = {
    customer: { name: "QA customer" },
    currencyCode: "NGN",
    revision: "4",
    snapshotSequence: "3",
    book: null,
    totals: {
      availableCreditMinor: "9007199254740993",
      outstandingDebtMinor: "123",
      netBalanceMinor: "-9007199254740870",
    },
  } as Parameters<typeof generalCustomerAccountAnswer>[0]
  const answer = generalCustomerAccountAnswer(account)
  expect(answer.value).toContain("90,071,992,547,409.93")
  expect(answer.detail).toContain("No matching Finance Book")
  expect(answer.detail).toContain(
    "not proof of cash collected or refundable funds",
  )
})

test("source answers describe the bounded list and do not promise payout eligibility", () => {
  const page = {
    side: "CREDIT",
    currencyCode: "NGN",
    currentRevision: "4",
    nextCursor: "3",
    sources: [
      {
        kind: "RECEIPT",
        sequence: "3",
        remainingAmountMinor: "750",
        amountMinor: "1000",
        usedAmountMinor: "250",
        effectiveAt: new Date("2026-09-01"),
        order: null,
      },
    ],
  } as Parameters<typeof generalCustomerSourcesAnswers>[0]
  const answers = generalCustomerSourcesAnswers(page)
  expect(answers).toHaveLength(2)
  expect(answers[0]?.value).toBe("1 on this page")
  expect(answers[0]?.detail).toContain("same account, side and revision")
  expect(answers[0]?.detail).toContain("eligibility must be revalidated")
  expect(answers[1]?.value).toContain("7.50")
})

test("statement answer distinguishes snapshot-wide totals from displayed entries", () => {
  const page = {
    accountId: "account",
    customerId: "customer",
    currentRevision: "17",
    coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
    completeness: "INCOMPLETE_SOURCE_COVERAGE",
    entries: [],
    currencyCode: "NGN",
    snapshotSequence: "17",
    nextCursor: "10",
    totals: {
      debitMinor: "1000",
      creditMinor: "750",
      allocatedMinor: "0",
      outstandingDebtMinor: "1000",
      availableCreditMinor: "750",
      netBalanceMinor: "250",
    },
  } as Parameters<typeof generalCustomerStatementAnswer>[0]
  const answer = generalCustomerStatementAnswer(page)
  expect(answer.value).toBe("0 entries on this page")
  expect(answer.detail).toContain("Snapshot 17")
  expect(answer.detail).toContain("keep this snapshot")
  expect(answer.detail).toContain(
    "Entries on this page alone are not the account balance",
  )
})
