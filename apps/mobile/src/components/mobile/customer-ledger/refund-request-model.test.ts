import { expect, test } from "bun:test"
import {
  type RefundDetail,
  type RefundRequestFields,
  minorToInput,
  prepareRefundCancel,
  prepareRefundCompletion,
  prepareRefundDetailsRequest,
  prepareRefundRequest,
  prepareRefundReserve,
  refundBankLabel,
  refundCommandIsCurrent,
  refundDestination,
  refundDestinationLabel,
  refundHistory,
  refundReviewSnapshot,
  refundStateInfo,
  refundStatusInfo,
  refundableSources,
} from "./refund-request-model"
import type { LedgerAccount, LedgerMoneyAccount, LedgerSource } from "./types"

const now = new Date("2026-10-28T10:00:00.000Z")
const approvedAt = new Date("2026-10-28T09:00:00.000Z")
const account: LedgerAccount = {
  id: "a",
  customer: { id: "c", name: "Amina", email: null, phone: null },
  currencyCode: "NGN",
  revision: "7",
  snapshotSequence: "7",
  book: { id: "b", currencyCode: "NGN", startsAt: now },
  totals: {
    debitMinor: "0",
    creditMinor: "800000",
    allocatedMinor: "0",
    outstandingDebtMinor: "0",
    availableCreditMinor: "800000",
    netBalanceMinor: "-800000",
  },
  coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES",
  completeness: "INCOMPLETE_SOURCE_COVERAGE",
} as LedgerAccount
const receipt: LedgerSource = {
  id: "credit",
  sequence: "2",
  kind: "RECEIPT",
  side: "CREDIT",
  amountMinor: "800000",
  usedAmountMinor: "0",
  remainingAmountMinor: "500001",
  sourceKind: "CUSTOMER_RECEIPT",
  sourceId: "receipt",
  effectiveAt: now,
  order: null,
}
const fields: RefundRequestFields = {
  creditEntryId: "credit",
  amount: "5000.01",
  reason: "  Overpaid ORD-119 ",
  bankName: "  Guaranty Trust Bank ",
  accountNumber: "0123 456 789",
  accountName: " Amina Bello ",
  revision: "7",
}
const detail = (overrides: Partial<RefundDetail> = {}): RefundDetail =>
  ({
    id: "r1",
    version: 1,
    status: "REQUESTED",
    amountMinor: "500000",
    creditEntryId: "credit",
    createdAt: now,
    approvedAt: null,
    completedAt: null,
    cancelledAt: null,
    outgoingReference: null,
    refundEntryId: null,
    bookId: "b",
    accountId: "a",
    accountRevision: "8",
    customerId: "c",
    customerName: "Amina",
    currencyCode: "NGN",
    reason: "Overpaid",
    destination: {
      bankCode: "GTB",
      accountNumber: "0123456789",
      accountName: "Amina Bello",
    },
    destinationStatus: "AVAILABLE",
    destinationFingerprint: "f".repeat(64),
    canCancel: true,
    canApprove: true,
    requestedByName: "Adaeze",
    approvedByName: null,
    completedByName: null,
    cancelledByName: null,
    needsDetails: false,
    reviewState: "REQUESTED",
    reviewNote: null,
    reviewedAt: null,
    reviewedByName: null,
    ...overrides,
  }) as RefundDetail
const bank = (id: string, purpose: "BANK" | "CASH"): LedgerMoneyAccount => ({
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

test("request payload is exact minor units with a trimmed destination", () => {
  expect(prepareRefundRequest({ account, fields, sources: [receipt] })).toEqual(
    {
      operation: "requestRefund",
      payload: {
        bookId: "b",
        accountId: "a",
        expectedRevision: "7",
        creditEntryId: "credit",
        amountMinor: "500001",
        reason: "Overpaid ORD-119",
        destination: {
          bankName: "Guaranty Trust Bank",
          accountNumber: "0123456789",
          accountName: "Amina Bello",
        },
      },
    },
  )
})

test("request refuses unrefundable sources, excess and invalid destinations", () => {
  const request =
    (patch: Partial<RefundRequestFields>, sources = [receipt]) =>
    () =>
      prepareRefundRequest({
        account,
        fields: { ...fields, ...patch },
        sources,
      })
  expect(request({ amount: "5000.02" })).toThrow("available credit")
  expect(request({}, [{ ...receipt, kind: "REVERSAL" }])).toThrow(
    "Choose the payment",
  )
  expect(
    refundableSources([{ ...receipt, remainingAmountMinor: "0" }]),
  ).toEqual([])
  expect(request({ bankName: "  " })).toThrow("Enter the bank name.")
  expect(request({ bankName: "G" })).toThrow("2–120")
  expect(request({ bankName: "Bank\u0007" })).toThrow("2–120")
  expect(request({ accountNumber: "12-34" })).toThrow("account number")
  expect(request({ accountName: "A\u0007" })).toThrow("holder")
  expect(request({ reason: "  " })).toThrow("why")
  expect(request({ revision: "07" })).toThrow("revision")
  expect(() =>
    prepareRefundRequest({
      account: { ...account, book: null },
      fields,
      sources: [receipt],
    }),
  ).toThrow("book")
})

const unavailable = {
  destination: null,
  destinationStatus: "UNAVAILABLE",
  canApprove: false,
} as const

test("an earlier code-only request retries with its exact code, never a mapped name", () => {
  const legacy = (patch: Partial<RefundRequestFields>) =>
    prepareRefundRequest({
      account,
      fields: { ...fields, bankName: "", ...patch },
      sources: [receipt],
    }).payload.destination
  // Same keys as the original bankCode-only payload, so its digest matches.
  expect(legacy({ legacyBankCode: " GTB " })).toEqual({
    bankCode: "GTB",
    accountNumber: "0123456789",
    accountName: "Amina Bello",
  })
  expect(() => legacy({ legacyBankCode: "Guaranty Trust" })).toThrow(
    "earlier bank code",
  )
  expect(() =>
    legacy({ legacyBankCode: "GTB", bankName: "Guaranty Trust Bank" }),
  ).toThrow("not both")
  expect(() => legacy({ legacyBankCode: "  " })).toThrow("Enter the bank name.")
  // A new request never sends a code it wasn't given.
  expect(
    prepareRefundRequest({ account, fields, sources: [receipt] }).payload
      .destination,
  ).not.toHaveProperty("bankCode")
})

test("the saved bank shows its name first, then a legacy code, never undefined", () => {
  const named = {
    bankName: "First Bank of Nigeria",
    bankCode: "011",
    accountNumber: "0123456789",
    accountName: "Amina Bello",
  }
  expect(refundBankLabel(named)).toBe("First Bank of Nigeria")
  expect(refundDestinationLabel(named)).toBe(
    "First Bank of Nigeria · 0123456789",
  )
  const coded = { ...named, bankName: undefined }
  expect(refundBankLabel(coded)).toBe("011")
  expect(refundDestinationLabel(coded)).toBe("011 · 0123456789")
  const neither = { accountNumber: "0123456789", accountName: "Amina Bello" }
  expect(refundBankLabel(neither)).toBeNull()
  expect(refundDestinationLabel(neither)).toBe("0123456789")
  expect(refundBankLabel(null)).toBeNull()
  expect(
    refundDestination(
      detail({ destination: named, destinationStatus: "AVAILABLE" }),
    ),
  ).toEqual(named)
  expect(refundDestination(detail(unavailable))).toBeNull()
})

test("reserve sends the reviewed fingerprint and attestation after the identity check", () => {
  const d = detail()
  const reserve = (
    patch: Partial<Parameters<typeof prepareRefundReserve>[0]>,
  ) =>
    prepareRefundReserve({
      detail: d,
      account,
      revision: "8",
      reviewed: refundReviewSnapshot(d),
      identityChecked: true,
      ...patch,
    })
  expect(() => reserve({ identityChecked: false })).toThrow("checks")
  expect(reserve({})).toEqual({
    operation: "reserveRefund",
    payload: {
      bookId: "b",
      accountId: "a",
      expectedRevision: "8",
      requestId: "r1",
      expectedVersion: 1,
      expectedDestinationFingerprint: "f".repeat(64),
      identityReviewAttested: true,
    },
  })
  expect(() =>
    reserve({ detail: detail({ status: "RESERVED", version: 2, approvedAt }) }),
  ).toThrow("Only a requested")
})

test("approval and recording refuse an unavailable destination", () => {
  const d = detail(unavailable)
  expect(() =>
    prepareRefundReserve({
      detail: d,
      account,
      revision: "8",
      reviewed: refundReviewSnapshot(d),
      identityChecked: true,
    }),
  ).toThrow("can't be approved")
  // A server canApprove=false refuses even with a destination present.
  expect(() =>
    prepareRefundReserve({
      detail: detail({ canApprove: false }),
      account,
      revision: "8",
      reviewed: refundReviewSnapshot(detail()),
      identityChecked: true,
    }),
  ).toThrow("can't be approved")
  expect(() =>
    prepareRefundCompletion({
      detail: detail({
        ...unavailable,
        status: "RESERVED",
        version: 2,
        approvedAt,
      }),
      account,
      revision: "9",
      fields: {
        moneyAccountId: "gt",
        reference: "RF1",
        date: "2026-10-28T09:30:00.000Z",
        returnChecked: true,
      },
      moneyAccounts: [bank("gt", "BANK")],
      now,
    }),
  ).toThrow("can't be recorded")
})

test("a changed destination or version since review refuses approval", () => {
  const reviewed = refundReviewSnapshot(detail())
  const reserve = (d: RefundDetail) => () =>
    prepareRefundReserve({
      detail: d,
      account,
      revision: "8",
      reviewed,
      identityChecked: true,
    })
  expect(reserve(detail({ destinationFingerprint: "e".repeat(64) }))).toThrow(
    "changed since you reviewed",
  )
  expect(reserve(detail({ version: 2 }))).toThrow("changed since you reviewed")
})

test("cancelling works without a destination; a hold needs a no-money-sent check", () => {
  expect(
    prepareRefundCancel({
      detail: detail(unavailable),
      account,
      revision: "8",
    }),
  ).toEqual({
    operation: "cancelRefund",
    payload: {
      bookId: "b",
      accountId: "a",
      expectedRevision: "8",
      requestId: "r1",
      expectedVersion: 1,
    },
  })
  const reserved = detail({
    ...unavailable,
    status: "RESERVED",
    version: 2,
    approvedAt,
  })
  expect(() =>
    prepareRefundCancel({ detail: reserved, account, revision: "9" }),
  ).toThrow("no money")
  expect(
    prepareRefundCancel({
      detail: reserved,
      account,
      revision: "9",
      noMoneySent: true,
    }).payload,
  ).toMatchObject({ expectedVersion: 2, expectedRevision: "9" })
  expect(() =>
    prepareRefundCancel({
      detail: detail({ status: "COMPLETED", canCancel: false }),
      account,
      revision: "9",
    }),
  ).toThrow("finished")
  expect(() =>
    prepareRefundCancel({
      detail: detail({ canCancel: false }),
      account,
      revision: "9",
    }),
  ).toThrow("finished")
  expect(() =>
    prepareRefundCancel({
      detail: detail({ accountId: "other" }),
      account,
      revision: "9",
    }),
  ).toThrow("different customer account")
})

test("a details request saves a trimmed note on a requested refund only", () => {
  expect(
    prepareRefundDetailsRequest({
      detail: detail(unavailable),
      account,
      revision: "8",
      note: "  Confirm the account holder's name ",
    }),
  ).toEqual({
    operation: "requestRefundDetails",
    payload: {
      bookId: "b",
      accountId: "a",
      expectedRevision: "8",
      requestId: "r1",
      expectedVersion: 1,
      note: "Confirm the account holder's name",
    },
  })
  const ask =
    (patch: Partial<RefundDetail>, note = "Need ID") =>
    () =>
      prepareRefundDetailsRequest({
        detail: detail(patch),
        account,
        revision: "8",
        note,
      })
  expect(ask({}, "  ")).toThrow("400")
  expect(ask({}, "x".repeat(401))).toThrow("400")
  expect(ask({ status: "RESERVED", approvedAt })).toThrow("Only a requested")
})

test("completion records an actual bank return after approval only", () => {
  const reserved = detail({ status: "RESERVED", version: 2, approvedAt })
  const base = {
    moneyAccountId: "gt",
    reference: " RF26300QX91 ",
    date: "2026-10-28T09:30:00.000Z",
    returnChecked: true,
  }
  const complete = (patch = {}, d = reserved) =>
    prepareRefundCompletion({
      detail: d,
      account,
      revision: "9",
      fields: { ...base, ...patch },
      moneyAccounts: [bank("gt", "BANK"), bank("till", "CASH")],
      now,
    })
  expect(complete()).toEqual({
    operation: "completeRefund",
    payload: {
      bookId: "b",
      accountId: "a",
      expectedRevision: "9",
      requestId: "r1",
      expectedVersion: 2,
      moneyAccountId: "gt",
      outgoingReference: "RF26300QX91",
      effectiveAt: new Date("2026-10-28T09:30:00.000Z"),
    },
  })
  expect(() => complete({ returnChecked: false })).toThrow("Confirm")
  expect(() => complete({ moneyAccountId: "till" })).toThrow("bank account")
  expect(() => complete({ reference: " " })).toThrow("reference")
  expect(() => complete({ date: "2026-10-28T08:59:59.999Z" })).toThrow(
    "before its approval",
  )
  expect(() => complete({ date: "2026-10-28T10:00:00.001Z" })).toThrow("future")
  expect(() => complete({}, detail())).toThrow("Approve and reserve")
})

test("a reviewed command goes stale when the saved request or destination moves", () => {
  const command = prepareRefundReserve({
    detail: detail(),
    account,
    revision: "8",
    reviewed: refundReviewSnapshot(detail()),
    identityChecked: true,
  })
  const saved = refundReviewSnapshot(detail())
  expect(refundCommandIsCurrent(command, saved)).toBe(true)
  expect(refundCommandIsCurrent(command, { ...saved, version: 2 })).toBe(false)
  expect(refundCommandIsCurrent(command, { ...saved, id: "r2" })).toBe(false)
  expect(
    refundCommandIsCurrent(command, {
      ...saved,
      destinationFingerprint: "e".repeat(64),
    }),
  ).toBe(false)
  // Cancelling isn't bound to the destination, only to the saved version.
  const cancel = prepareRefundCancel({
    detail: detail(),
    account,
    revision: "8",
  })
  expect(
    refundCommandIsCurrent(cancel, {
      ...saved,
      destinationFingerprint: "e".repeat(64),
    }),
  ).toBe(true)
})

test("status, history and amounts come from saved values only", () => {
  expect(refundStatusInfo("RESERVED").label).toBe("Reserved")
  expect(refundStatusInfo("PAID_OUT")).toMatchObject({
    label: "PAID_OUT",
    tone: "muted",
  })
  expect(refundHistory(detail()).map((r) => r.key)).toEqual(["requested"])
  expect(refundHistory(detail())[0]?.value).toEndWith(" · Adaeze")
  expect(
    refundHistory(detail({ requestedByName: "  " }))[0]?.value,
  ).not.toContain("·")
  expect(
    refundHistory(
      detail({
        approvedAt,
        completedAt: now,
        outgoingReference: "RF1",
      }),
    ).map((r) => r.key),
  ).toEqual(["requested", "reserved", "completed"])
  expect(minorToInput("500001")).toBe("5000.01")
  expect(minorToInput("500000")).toBe("5000")
  expect(minorToInput("123456789012345607")).toBe("1234567890123456.07")
})

test("needs-details presentation follows the saved review state on a requested refund only", () => {
  const asked = detail({
    needsDetails: true,
    reviewState: "NEEDS_DETAILS",
    reviewNote: "Confirm the holder",
    reviewedAt: approvedAt,
    reviewedByName: "Tunde",
  })
  expect(refundStateInfo(asked)).toMatchObject({
    label: "More details needed",
    tone: "warn",
  })
  expect(
    refundHistory(asked).map((r) => [r.key, r.value.endsWith(" · Tunde")]),
  ).toEqual([
    ["requested", false],
    ["details", true],
  ])
  // Canonical status wins over a review state the server didn't pair with it.
  expect(
    refundStateInfo({ status: "RESERVED", reviewState: "NEEDS_DETAILS" }).label,
  ).toBe("Reserved")
  expect(refundStateInfo(detail()).label).toBe("Requested")
})
