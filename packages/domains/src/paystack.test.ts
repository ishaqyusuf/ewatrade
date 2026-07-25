import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"

import { parsePaystackRefundEvent, verifyPaystackSignature } from "./paystack"

describe("Paystack webhooks", () => {
  test("accepts only the SHA-512 signature for the raw body", () => {
    const body = JSON.stringify({ event: "charge.success" })
    const signature = createHmac("sha512", "secret").update(body).digest("hex")

    expect(
      verifyPaystackSignature({ body, secretKey: "secret", signature }),
    ).toBe(true)
    expect(
      verifyPaystackSignature({
        body: `${body} `,
        secretKey: "secret",
        signature,
      }),
    ).toBe(false)
  })

  test("parses Paystack's documented refund webhook shape", () => {
    expect(
      parsePaystackRefundEvent({
        data: {
          refund_reference: "refund_1",
          status: "processed",
          transaction_reference: "domain_payment_1",
        },
        event: "refund.processed",
      }),
    ).toEqual({
      event: "refund.processed",
      paymentReference: "domain_payment_1",
      providerEventId: "refund.processed:refund_1",
      status: "processed",
    })
  })

  test("accepts the legacy nested transaction refund shape", () => {
    expect(
      parsePaystackRefundEvent({
        data: {
          status: "processed",
          transaction: { reference: "domain_payment_1" },
        },
        event: "refund.processed",
      })?.paymentReference,
    ).toBe("domain_payment_1")
  })
})
