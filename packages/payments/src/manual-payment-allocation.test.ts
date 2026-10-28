import { expect, test } from "bun:test"
import { reviewManualPaymentAllocation } from "./manual-payment-allocation"
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
