import { expect, test } from "bun:test"
import { manualPaymentVerification } from "./manual-payment-presentation"

test("confirmed provenance requires a saved canonical financial payment", () => {
  const facts = {
    status: "CONFIRMED",
    canonicalPaymentId: null,
    decidedAt: new Date(),
    receivedAt: new Date(),
    receivedAmountMinor: 100,
  }
  expect(manualPaymentVerification(facts).state).toBe("unverified")
  expect(
    manualPaymentVerification({
      ...facts,
      canonicalPaymentId: "canonical-payment",
    }),
  ).toMatchObject({
    state: "confirmed",
    source: "merchant_bank_check",
    canonicalPaymentId: "canonical-payment",
  })
})
