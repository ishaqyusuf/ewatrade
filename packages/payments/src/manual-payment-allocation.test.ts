import { expect, test } from "bun:test"
import {
  projectManualPaymentAttemptAmounts,
  reviewManualPaymentAllocation,
} from "./manual-payment-allocation"
test("larger explicit installment and excess conserve the reported transfer", () => {
  expect(
    reviewManualPaymentAllocation({
      claimedAmountMinor: 12000,
      requestedAmountMinor: 3000,
      orderBalanceMinor: 10000,
      proposal: {
        orderAmountMinor: 10000,
        excessTreatment: "REFUND_REQUESTED",
      },
    }),
  ).toMatchObject({
    proposedOrderAmountMinor: 10000,
    excessAmountMinor: 2000,
    increasedInstallment: true,
    excessTreatment: "REFUND_REQUESTED",
    remainingOrderMinor: 0,
  })
  expect(
    reviewManualPaymentAllocation({
      claimedAmountMinor: 5000,
      requestedAmountMinor: 3000,
      orderBalanceMinor: 10000,
      proposal: { orderAmountMinor: 5000, excessTreatment: "KEEP_CREDIT" },
    }),
  ).toMatchObject({
    excessAmountMinor: 0,
    excessTreatment: null,
    remainingOrderMinor: 5000,
  })
})
test("allocation cannot invent money, overpay the Order or silently divert a due payment", () => {
  for (const orderAmountMinor of [0, 4000, 12000, 10000.5])
    expect(() =>
      reviewManualPaymentAllocation({
        claimedAmountMinor: 12000,
        requestedAmountMinor: 3000,
        orderBalanceMinor: 10000,
        proposal: { orderAmountMinor, excessTreatment: "KEEP_CREDIT" },
      }),
    ).toThrow()
})

test("an ordinary larger installment remains reportable on an Order above the per-transfer ceiling", () => {
  expect(
    reviewManualPaymentAllocation({
      claimedAmountMinor: 5000,
      requestedAmountMinor: 3000,
      orderBalanceMinor: 200_000_000,
      proposal: { orderAmountMinor: 5000, excessTreatment: "BUSINESS_REVIEW" },
    }),
  ).toMatchObject({
    proposedOrderAmountMinor: 5000,
    excessAmountMinor: 0,
    remainingOrderMinor: 199_995_000,
  })
})

test("credit reduces this installment even when the Order still owes more", () => {
  expect(
    projectManualPaymentAttemptAmounts({
      requestedMinor: 5000,
      balanceMinor: 12000,
      appliedMinor: BigInt(3000),
      receivedMinor: BigInt(0),
    }),
  ).toEqual({
    attemptAppliedMinor: 3000,
    attemptReceivedMinor: 0,
    remainingTransferMinor: 2000,
  })
  expect(
    projectManualPaymentAttemptAmounts({
      requestedMinor: 5000,
      balanceMinor: 10000,
      appliedMinor: BigInt(3000),
      receivedMinor: BigInt(2000),
    }).remainingTransferMinor,
  ).toBe(0)
  expect(
    projectManualPaymentAttemptAmounts({
      requestedMinor: 5000,
      balanceMinor: 1000,
      appliedMinor: BigInt(0),
      receivedMinor: BigInt(0),
    }).remainingTransferMinor,
  ).toBe(1000)
  expect(() =>
    projectManualPaymentAttemptAmounts({
      requestedMinor: 5000,
      balanceMinor: 10000,
      appliedMinor: BigInt("9007199254740992"),
      receivedMinor: BigInt(0),
    }),
  ).toThrow()
})
