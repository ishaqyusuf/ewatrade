import { expect, test } from "bun:test"
import {
  type PayoutReviewInput,
  canApprovePayouts,
  canDraftPayouts,
  decideBeneficiaryVerification,
  decidePayoutDispatch,
  decidePayoutReview,
  decideStepUp,
  payoutPolicy,
  payoutReference,
  payoutStatusFromProvider,
  stepUpMaxAgeMs,
} from "./payout-intent"

test("a payee is verified only by exact resolution and a confirmed real name", () => {
  const entered = { bankCode: "058", accountNumber: "0123456789" }
  const resolved = {
    bankCode: "058",
    accountNumber: "0123456789",
    accountName: "MUSA SUPPLIES LTD",
  }
  expect(
    decideBeneficiaryVerification({
      entered,
      resolved,
      confirmedName: "MUSA SUPPLIES LTD",
    }),
  ).toEqual({
    ok: true,
    accountName: "MUSA SUPPLIES LTD",
    accountSuffix: "6789",
    bankCode: "058",
  })
  expect(
    decideBeneficiaryVerification({ entered, resolved, confirmedName: null }),
  ).toMatchObject({ code: "NAME_NOT_CONFIRMED" })
  // Similar is not the same: no fuzzy name acceptance.
  expect(
    decideBeneficiaryVerification({
      entered,
      resolved,
      confirmedName: "Musa Supplies Ltd",
    }),
  ).toMatchObject({ code: "NAME_NOT_CONFIRMED" })
  // An empty or blank provider name is not an identity, even if "confirmed".
  for (const accountName of ["", "   "])
    expect(
      decideBeneficiaryVerification({
        entered,
        resolved: { ...resolved, accountName },
        confirmedName: accountName,
      }),
    ).toMatchObject({ code: "UNRESOLVED_ACCOUNT" })
  expect(
    decideBeneficiaryVerification({
      entered,
      resolved: null,
      confirmedName: null,
    }),
  ).toMatchObject({ code: "UNRESOLVED_ACCOUNT" })
  expect(
    decideBeneficiaryVerification({
      entered,
      resolved: { ...resolved, accountNumber: "0123456780" },
      confirmedName: "MUSA SUPPLIES LTD",
    }),
  ).toMatchObject({ code: "RESOLUTION_MISMATCH" })
  expect(
    decideBeneficiaryVerification({
      entered: { bankCode: "058", accountNumber: "01234-56789" },
      resolved,
      confirmedName: "MUSA SUPPLIES LTD",
    }),
  ).toMatchObject({ code: "INVALID_ACCOUNT" })
})

test("Owners and Admins approve; Managers only draft", () => {
  expect(["OWNER", "ADMIN"].map(canApprovePayouts)).toEqual([true, true])
  expect(
    ["MANAGER", "CASHIER", "OPERATOR", null].map(canApprovePayouts),
  ).toEqual([false, false, false, false])
  expect(["OWNER", "ADMIN", "MANAGER"].map(canDraftPayouts)).toEqual([
    true,
    true,
    true,
  ])
  expect(["CASHIER", "OPERATOR"].map(canDraftPayouts)).toEqual([false, false])
})

const reviewInput: PayoutReviewInput = {
  beneficiary: {
    id: "ben-musa",
    version: 2,
    status: "VERIFIED",
    accountName: "MUSA SUPPLIES LTD",
    accountSuffix: "6789",
    bankName: "GTBank",
    currencyCode: "NGN",
  },
  debitAccount: {
    id: "acc-paystack",
    name: "Paystack balance",
    currencyCode: "NGN",
  },
  source: { purpose: "supplier_bill", id: "bill-77" },
  amountMinor: 50_000_000,
  feeMinor: 5_000,
  currencyCode: "NGN",
  actor: { role: "ADMIN" },
  payoutsStopped: false,
}

test("the review shows the supplier bill payout with the business paying the fee", () => {
  const result = decidePayoutReview(reviewInput)
  expect(result).toMatchObject({
    ok: true,
    review: {
      payee: "MUSA SUPPLIES LTD",
      accountSuffix: "6789",
      bank: "GTBank",
      debitAccount: "Paystack balance",
      amountMinor: 50_000_000,
      feeMinor: 5_000,
      payeeReceivesMinor: 50_000_000,
      totalDebitMinor: 50_005_000,
      currencyCode: "NGN",
      purpose: "supplier_bill",
      sourceId: "bill-77",
      feeExpenseCategory: "Bank & transfer charges",
    },
  })
  expect(payoutPolicy.feeBearer).toBe("business")
  // No app amount limit: a large payout is reviewable as is.
  expect(
    decidePayoutReview({ ...reviewInput, amountMinor: 9_000_000_000 }).ok,
  ).toBe(true)
  // Any change to payee version, bill, account or amount changes the digest.
  const digest = (input: PayoutReviewInput) => {
    const value = decidePayoutReview(input)
    return value.ok ? value.digest : null
  }
  const base = digest(reviewInput)
  for (const changed of [
    {
      ...reviewInput,
      beneficiary: { ...reviewInput.beneficiary, version: 3 },
    },
    { ...reviewInput, amountMinor: 50_000_001 },
    { ...reviewInput, source: { purpose: "supplier_bill", id: "bill-78" } },
    {
      ...reviewInput,
      debitAccount: { ...reviewInput.debitAccount, id: "acc-other" },
    },
  ])
    expect(digest(changed)).not.toBe(base)
})

test("review refuses stops, Managers, other purposes, unverified payees and inexact money", () => {
  expect(
    decidePayoutReview({ ...reviewInput, payoutsStopped: true }),
  ).toMatchObject({ code: "PAYOUTS_STOPPED" })
  expect(
    decidePayoutReview({ ...reviewInput, actor: { role: "MANAGER" } }),
  ).toMatchObject({ code: "FORBIDDEN" })
  expect(
    decidePayoutReview({
      ...reviewInput,
      source: { purpose: "staff_salary", id: "pay-1" },
    }),
  ).toMatchObject({ code: "PURPOSE_NOT_ALLOWED" })
  expect(
    decidePayoutReview({
      ...reviewInput,
      beneficiary: { ...reviewInput.beneficiary, status: "UNVERIFIED" },
    }),
  ).toMatchObject({ code: "BENEFICIARY_UNVERIFIED" })
  for (const amountMinor of [0, -1, 0.5, Number.NaN])
    expect(decidePayoutReview({ ...reviewInput, amountMinor })).toMatchObject({
      code: "INVALID_AMOUNT",
    })
  // Individually safe values whose total is not exactly representable.
  expect(
    decidePayoutReview({
      ...reviewInput,
      amountMinor: Number.MAX_SAFE_INTEGER,
      feeMinor: 2,
    }),
  ).toMatchObject({ code: "INVALID_AMOUNT" })
  expect(
    decidePayoutReview({ ...reviewInput, currencyCode: "GHS" }),
  ).toMatchObject({ code: "CURRENCY_MISMATCH" })
})

test("the in-app step-up is fresh, by the approver, for this exact review", () => {
  const now = new Date("2026-10-12T12:00:00.000Z")
  const stepUp = {
    userId: "owner-u",
    reviewDigest: "digest-a",
    verifiedAt: new Date(now.getTime() - 60_000),
  }
  const decide = (overrides: Partial<Parameters<typeof decideStepUp>[0]>) =>
    decideStepUp({
      reviewDigest: "digest-a",
      approverUserId: "owner-u",
      stepUp,
      now,
      ...overrides,
    })
  expect(decide({})).toEqual({ ok: true })
  expect(decide({ stepUp: null })).toMatchObject({ code: "STEP_UP_REQUIRED" })
  expect(decide({ reviewDigest: "digest-b" })).toMatchObject({
    code: "STEP_UP_MISMATCH",
  })
  expect(decide({ approverUserId: "manager-u" })).toMatchObject({
    code: "STEP_UP_MISMATCH",
  })
  expect(
    decide({
      stepUp: {
        ...stepUp,
        verifiedAt: new Date(now.getTime() - stepUpMaxAgeMs - 1),
      },
    }),
  ).toMatchObject({ code: "STEP_UP_STALE" })
  expect(decide({ now: new Date(Number.NaN) })).toMatchObject({
    code: "STEP_UP_STALE",
  })
})

test("one reference per payout; retries reuse it only when the provider has none", () => {
  const reference = payoutReference("payout-intent-1")
  expect(reference).toBe(payoutReference("payout-intent-1"))
  expect(reference).not.toBe(payoutReference("payout-intent-2"))
  expect(reference).toMatch(/^[a-z0-9_-]{16,50}$/)
  const dispatch = (
    overrides: Partial<Parameters<typeof decidePayoutDispatch>[0]>,
  ) =>
    decidePayoutDispatch({
      status: "APPROVED",
      submissionCount: 0,
      lookup: null,
      payoutsStopped: false,
      ...overrides,
    })
  expect(dispatch({})).toEqual({ action: "submit" })
  // A timeout or crash is looked up first, never sent with a new reference.
  for (const status of ["SUBMITTING", "UNKNOWN"] as const) {
    expect(dispatch({ status, submissionCount: 1 })).toEqual({
      action: "verify_by_reference",
    })
    expect(
      dispatch({ status, submissionCount: 1, lookup: "inconclusive" }),
    ).toEqual({ action: "verify_by_reference" })
    expect(dispatch({ status, submissionCount: 1, lookup: "found" })).toEqual({
      action: "verify_by_reference",
    })
    expect(
      dispatch({ status, submissionCount: 1, lookup: "not_found" }),
    ).toEqual({ action: "resubmit_same_reference" })
  }
  for (const status of ["PENDING", "RECEIVED"] as const)
    expect(dispatch({ status, submissionCount: 1 })).toEqual({
      action: "verify_by_reference",
    })
  for (const status of [
    "SUCCEEDED",
    "FAILED",
    "REVERSED",
    "ABANDONED",
    "BLOCKED",
    "REJECTED",
  ] as const)
    expect(dispatch({ status, submissionCount: 1 })).toEqual({
      action: "none",
      reason: "settled",
    })
})

test("the payouts stop blocks new sends but never lookups", () => {
  expect(
    decidePayoutDispatch({
      status: "APPROVED",
      submissionCount: 0,
      lookup: null,
      payoutsStopped: true,
    }),
  ).toEqual({ action: "none", reason: "stopped" })
  expect(
    decidePayoutDispatch({
      status: "UNKNOWN",
      submissionCount: 1,
      lookup: "not_found",
      payoutsStopped: true,
    }),
  ).toEqual({ action: "none", reason: "stopped" })
  expect(
    decidePayoutDispatch({
      status: "PENDING",
      submissionCount: 1,
      lookup: null,
      payoutsStopped: true,
    }),
  ).toEqual({ action: "verify_by_reference" })
})

test("provider statuses map without treating approval states as settlement", () => {
  expect(
    [
      "pending",
      "received",
      "success",
      "failed",
      "reversed",
      "abandoned",
      "blocked",
      "rejected",
      "mystery",
    ].map(payoutStatusFromProvider),
  ).toEqual([
    "PENDING",
    "RECEIVED",
    "SUCCEEDED",
    "FAILED",
    "REVERSED",
    "ABANDONED",
    "BLOCKED",
    "REJECTED",
    null,
  ])
})
