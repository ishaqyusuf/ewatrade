import { expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"
import {
  customerAccountsReadAnswers,
  purchaseBillReadAnswers,
  purchaseRecognitionReadAnswers,
} from "./finance-funds-answers"

const now = "2026-10-15T14:00:00.000Z"
const at = new Date(now)
const render = (answers: ReturnType<typeof customerAccountsReadAnswers>) => {
  const parts = answers.map((data) => ({ type: "data-general-answer", data }))
  for (const part of parts)
    expect(generalStoredPartSchema.safeParse(part).success).toBe(true)
  const reply = renderWhatsAppFinalReply(parts)
  expect(reply.kind).toBe("reply")
  return reply.chunks.join("\n")
}
const accountPage: Parameters<typeof customerAccountsReadAnswers>[0] = {
  customer: { name: "Amina" },
  coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
  nextCursor: "USD",
  accounts: ["NGN", "USD"].map((currencyCode) => ({
    id: currencyCode,
    customerId: "customer-one",
    currencyCode,
    revision: "4",
    snapshotSequence: "19",
    createdAt: at,
  })),
}
const event: Parameters<
  typeof purchaseRecognitionReadAnswers
>[0]["events"][number] = {
  stage: "INVOICE",
  effectiveAt: at,
  reversalOfId: null,
  reversalId: null,
  reason: null,
}
const recognition: Parameters<typeof purchaseRecognitionReadAnswers>[0] = {
  supplierName: "North supplier",
  description: "Agreed goods",
  amountMinor: "9007199254740993",
  currencyCode: "NGN",
  agreedAt: at,
  corrected: true,
  invoiceBillId: "historical-bill",
  events: [event],
}
const bill: Parameters<typeof purchaseBillReadAnswers>[0] = {
  payeeName: "North supplier",
  description: "Original goods",
  currencyCode: "NGN",
  totalMinor: "10000",
  paidMinor: "4000",
  cashPaidMinor: "1000",
  activeAllocatedMinor: "3000",
  releasedAllocationMinor: "500",
  outstandingMinor: "6000",
  voidedAt: null,
  currentSupplierTotals: {
    payableMinor: "20000",
    advanceMinor: "8000",
    throughJournalSequence: "999",
  },
  coverage: {
    receipts: "SEPARATE_RECOGNITION_SOURCE",
    valuation: "SEPARATE_RECOGNITION_SOURCE",
    cogs: "NOT_IMPLEMENTED",
  },
  recognitionId: "recognition-one",
  paymentsHasMore: false,
  supplierEntriesHasMore: false,
  allocationsHasMore: false,
  payments: [
    {
      amountMinor: "1000",
      effectiveAt: at,
      reversedAt: null,
      account: { name: "Bank" },
    },
  ],
  supplierEntries: [],
  allocations: [
    {
      amountMinor: "3500",
      effectiveAt: at,
      releases: [{ amountMinor: "500" }],
      releasesHasMore: false,
    },
  ],
}

test("customer account discovery keeps currencies/revisions and never invents debt or balances", () => {
  const text = render(
    customerAccountsReadAnswers(accountPage, { afterCurrency: "EUR" }, now),
  )
  expect(text).toContain("Continuation page")
  expect(text).toContain("NGN customer account")
  expect(text).toContain("USD customer account")
  expect(text).toContain("revision 4")
  expect(text).toContain("snapshot 19")
  expect(text).toContain("Balances have not been read")
  expect(text).toContain("More accounts available")
  expect(text).toContain("never add different currencies together")
  expect(text).not.toContain("₦0")
  const empty = render(
    customerAccountsReadAnswers(
      { ...accountPage, accounts: [], nextCursor: null },
      {},
      now,
    ),
  )
  expect(empty).toContain("0 account identities")
  expect(empty).toContain("absent account never proves zero debt")
})

test("purchase agreement separates active originals, corrected originals and correction events", () => {
  const result = purchaseRecognitionReadAnswers(
    {
      ...recognition,
      events: [
        { ...event, reversalId: "correction" },
        { ...event, reversalOfId: "original", reason: "Wrong invoice" },
        { ...event, stage: "OWNERSHIP" },
        { ...event, stage: "RECEIPT" },
      ],
    },
    now,
  )
  expect(result[0]?.value).toBe("₦90,071,992,547,409.93 agreed")
  const text = render(result)
  expect(text).toContain("INVOICE: no active recorded event")
  expect(text).toContain("OWNERSHIP: active recorded event")
  expect(text).toContain("RECEIPT: active recorded event")
  expect(text).toContain("Corrected original event")
  expect(text).toContain("Correction event")
  expect(text).toContain("Wrong invoice")
  expect(text).toContain("not current payable or stock evidence")
  expect(text).not.toContain("historical-bill")
})

test("recognition event display is bounded while stage status uses all saved events", () => {
  const result = purchaseRecognitionReadAnswers(
    {
      ...recognition,
      events: [
        ...Array.from({ length: 20 }, () => ({
          ...event,
          reversalId: "corrected",
        })),
        { ...event, stage: "OWNERSHIP" },
      ],
    },
    now,
  )
  expect(result).toHaveLength(21)
  expect(result[0]?.detail).toContain("20 of 21 saved events shown")
  expect(result[0]?.detail).toContain("OWNERSHIP: active recorded event")
  render(result)
})

test("purchase bill preserves exact complete bill/supplier controls and original history statuses separately", () => {
  const result = purchaseBillReadAnswers(
    {
      ...bill,
      payments: [
        {
          amountMinor: "1000",
          effectiveAt: at,
          reversedAt: at,
          account: { name: "Bank" },
        },
      ],
    },
    now,
  )
  const text = render(result)
  expect(result[0]?.value).toBe("₦60.00 outstanding")
  expect(text).toContain("recorded cash payments ₦10.00")
  expect(text).toContain("active advances applied ₦30.00")
  expect(text).toContain("released allocations ₦5.00")
  expect(result[1]?.value).toBe("₦200.00 payable")
  expect(text).toContain("Supplier advance ₦80.00 is separate")
  expect(text).toContain("not this bill's totals")
  expect(text).toContain("This payment was reversed")
  expect(text).toContain("Original supplier advance allocation")
  expect(text).toContain("not inferred remaining allocation or new cash paid")
  expect(text).toContain("separate recognition record")
  expect(text).toContain("not proof of bank/provider settlement")
})

test("void and history flags preserve refusal and missing-history facts without page sums", () => {
  const originalPayment = {
    amountMinor: "1000",
    effectiveAt: at,
    reversedAt: null,
    account: { name: "Bank" },
  }
  const originalAllocation = {
    amountMinor: "3500",
    effectiveAt: at,
    releases: [],
    releasesHasMore: true,
  }
  const result = purchaseBillReadAnswers(
    {
      ...bill,
      voidedAt: at,
      outstandingMinor: "0",
      payments: Array.from({ length: 12 }, () => originalPayment),
      allocations: Array.from({ length: 11 }, () => originalAllocation),
    },
    now,
  )
  expect(result).toHaveLength(22)
  expect(result[0]?.value).toBe("₦0.00 outstanding")
  expect(result[0]?.detail).toContain("Voided bill; cannot be paid")
  expect(result[1]?.detail).toContain("History is incomplete")
  expect(result[1]?.detail).toContain("10 recent payments and 10 allocations")
  render(result)
})

test("invalid amount/currency fails instead of rounding or choosing a default currency", () => {
  for (const amountMinor of [
    "1.01",
    "9007199254740993.5",
    "1e4",
    "999999999999999999999",
  ])
    expect(() =>
      purchaseRecognitionReadAnswers({ ...recognition, amountMinor }, now),
    ).toThrow("Exact recorded money unavailable")
  expect(() =>
    purchaseBillReadAnswers({ ...bill, currencyCode: "" }, now),
  ).toThrow("Exact recorded money unavailable")
  const family = "👨‍👩‍👧‍👦"
  const long = purchaseRecognitionReadAnswers(
    {
      ...recognition,
      supplierName: family.repeat(200),
      description: family.repeat(200),
      events: [],
    },
    now,
  )
  expect(long[0]?.title).toBe(`${family.repeat(14)}…`)
  render(long)
})
