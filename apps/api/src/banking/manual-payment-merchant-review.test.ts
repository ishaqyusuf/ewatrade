import { expect, test } from "bun:test"
import { projectMerchantPaymentFundsReview } from "./manual-payment-merchant-review"

test("actual report funds projection never queries finance data for Sales roles", async () => {
  let financeReads = 0
  const load = async () => {
    financeReads++
    throw new Error("Finance data must not be read")
  }
  for (const role of ["CASHIER", "OPERATOR", "MANAGER", "UNKNOWN"])
    expect(await projectMerchantPaymentFundsReview(role, load)).toEqual({
      customerFundsReview: null,
      customerFundsReviewState: "forbidden",
    })
  expect(financeReads).toBe(0)
})
test("funds preflight failure preserves an explicit unavailable projection, never zero", async () => {
  expect(
    await projectMerchantPaymentFundsReview("OWNER", async () => {
      throw new Error("Transient financial read failure")
    }),
  ).toEqual({
    customerFundsReview: null,
    customerFundsReviewState: "unavailable",
  })
  expect(
    await projectMerchantPaymentFundsReview("ADMIN", async () => null),
  ).toEqual({
    customerFundsReview: null,
    customerFundsReviewState: "not_configured",
  })
})
