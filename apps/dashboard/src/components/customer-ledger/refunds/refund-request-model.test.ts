import { describe, expect, test } from "bun:test"
import { financeCommandDigestSource } from "@ewatrade/utils/finance-command-identity"
import { refundBankLabel } from "./refund-model"
import {
  type RefundRequestFields,
  prepareRefundRequest,
  refundRequestRecovery,
  refundRequestReviewIsCurrent,
} from "./refund-request-model"

const account = { id: "acc_1", bookId: "book_1", revision: "12" }
const source = { id: "ent_9", remainingAmountMinor: "500000" }
const fields: RefundRequestFields = {
  sourceId: "ent_9",
  amount: "2500.50",
  reason: " Order cancelled ",
  bankName: " First Bank ",
  accountNumber: " 0012345678 ",
  accountName: " ISHAQ YUSUF ",
}

describe("new refund request", () => {
  test("builds the exact request, keeping the account number's leading zeros", () => {
    expect(prepareRefundRequest(fields, { account, source })).toEqual({
      payload: {
        bookId: "book_1",
        accountId: "acc_1",
        expectedRevision: "12",
        creditEntryId: "ent_9",
        amountMinor: "250050",
        reason: "Order cancelled",
        destination: {
          bankName: "First Bank",
          accountNumber: "0012345678",
          accountName: "ISHAQ YUSUF",
        },
      },
    })
  })
  test("refuses a missing source, too much money and unusable details", () => {
    const problem = (change: Partial<RefundRequestFields>, from = source) =>
      "problem" in
      prepareRefundRequest(
        { ...fields, ...change },
        {
          account,
          source: from,
        },
      )
    expect(
      "problem" in prepareRefundRequest(fields, { account, source: undefined }),
    ).toBe(true)
    expect(problem({ sourceId: "ent_other" })).toBe(true)
    expect(problem({ amount: "5000.01" })).toBe(true)
    expect(problem({ amount: "5000" })).toBe(false)
    for (const change of [
      { amount: "0" },
      { amount: "1.234" },
      { reason: "  " },
      { bankName: "B" },
      { accountNumber: "0012 3456" },
      { accountNumber: "12345" },
      { accountName: "I" },
    ])
      expect(problem(change)).toBe(true)
  })
  test("a different destination is a different retry identity", () => {
    const first = prepareRefundRequest(fields, { account, source })
    const other = prepareRefundRequest(
      { ...fields, accountNumber: "0012345679" },
      { account, source },
    )
    if (!("payload" in first) || !("payload" in other))
      throw new Error("Both requests should be valid.")
    const salt = "salt-1"
    expect(
      financeCommandDigestSource("requestRefund", first.payload, salt),
    ).not.toBe(financeCommandDigestSource("requestRefund", other.payload, salt))
    expect(
      financeCommandDigestSource("requestRefund", first.payload, salt),
    ).toBe(
      financeCommandDigestSource(
        "requestRefund",
        structuredClone(first.payload),
        salt,
      ),
    )
  })
  test("a review goes stale when the account or source changes", () => {
    const prepared = prepareRefundRequest(fields, { account, source })
    if (!("payload" in prepared)) throw new Error("Request should be valid.")
    const payload = prepared.payload
    expect(
      refundRequestReviewIsCurrent(payload, { revision: "12", source }),
    ).toBe(true)
    expect(
      refundRequestReviewIsCurrent(payload, { revision: "13", source }),
    ).toBe(false)
    expect(
      refundRequestReviewIsCurrent(payload, {
        revision: "12",
        source: { ...source, remainingAmountMinor: "250049" },
      }),
    ).toBe(false)
    expect(
      refundRequestReviewIsCurrent(payload, {
        revision: "12",
        source: undefined,
      }),
    ).toBe(false)
  })
})

describe("bank label", () => {
  test("prefers the typed bank name, falling back to an older saved code", () => {
    expect(refundBankLabel({ bankName: "GTBank", bankCode: "058" })).toBe(
      "GTBank",
    )
    expect(refundBankLabel({ bankCode: "058" })).toBe("Bank code 058")
    expect(refundBankLabel({ bankName: "  " })).toBe("Bank not given")
  })
})

describe("an unconfirmed earlier send", () => {
  test("only an earlier refund request with its revision can be rebuilt", () => {
    expect(refundRequestRecovery(null)).toEqual({ kind: "none" })
    expect(
      refundRequestRecovery({
        operation: "requestRefund",
        recoveryMetadata: { expectedSnapshotSequence: "12" },
      }),
    ).toEqual({ kind: "own", expectedRevision: "12" })
    expect(refundRequestRecovery({ operation: "requestRefund" })).toEqual({
      kind: "own-unrebuildable",
    })
    expect(
      refundRequestRecovery({
        operation: "completeRefund",
        recoveryMetadata: { expectedSnapshotSequence: "12" },
      }),
    ).toEqual({ kind: "other" })
  })
  test("a rebuilt retry keeps the original revision, not the current one", () => {
    const rebuilt = prepareRefundRequest(fields, {
      account: { ...account, revision: "12" },
      source,
    })
    const fresh = prepareRefundRequest(fields, {
      account: { ...account, revision: "13" },
      source,
    })
    if (!("payload" in rebuilt) || !("payload" in fresh))
      throw new Error("Both should be valid.")
    expect(
      financeCommandDigestSource("requestRefund", rebuilt.payload, "s"),
    ).not.toBe(financeCommandDigestSource("requestRefund", fresh.payload, "s"))
  })
})
