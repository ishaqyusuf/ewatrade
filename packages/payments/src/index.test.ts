import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"

import {
  HostedCheckoutProviderError,
  PaystackHostedPaymentProvider,
  PaystackWebhookAdapter,
  createDeterministicHostedPaymentProvider,
} from "./index"

describe("hosted payment provider contract", () => {
  test("creates a provider-hosted URL without collecting card data", async () => {
    const checkout =
      await createDeterministicHostedPaymentProvider().createCheckout({
        amountMinor: 4200,
        callbackUrl: "https://store.example/return",
        currencyCode: "NGN",
        customerEmail: "customer@example.test",
        metadata: { orderId: "order-1" },
        reference: "payment-1",
      })
    expect(checkout.checkoutUrl).toContain("payment-1")
  })

  test("classifies an explicit checkout rejection as a definite failure", async () => {
    const provider = new PaystackHostedPaymentProvider({
      fetch: (async () =>
        new Response(JSON.stringify({ status: false }), {
          status: 400,
        })) as unknown as typeof fetch,
      secretKey: "test-secret",
    })

    await expect(
      provider.createCheckout({
        amountMinor: 4200,
        callbackUrl: "https://store.example/return",
        currencyCode: "NGN",
        customerEmail: "customer@example.test",
        metadata: { orderId: "order-1" },
        reference: "payment-1",
      }),
    ).rejects.toEqual(
      new HostedCheckoutProviderError(
        "DEFINITE_FAILURE",
        "The payment provider rejected checkout initialization.",
      ),
    )
  })

  test("classifies a transport failure as an unknown checkout outcome", async () => {
    const provider = new PaystackHostedPaymentProvider({
      fetch: (async () => {
        throw new TypeError("socket closed after dispatch")
      }) as unknown as typeof fetch,
      secretKey: "test-secret",
    })

    await expect(
      provider.createCheckout({
        amountMinor: 4200,
        callbackUrl: "https://store.example/return",
        currencyCode: "NGN",
        customerEmail: "customer@example.test",
        metadata: { orderId: "order-1" },
        reference: "payment-1",
      }),
    ).rejects.toEqual(
      new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider outcome is unknown.",
      ),
    )
  })

  test("keeps a server failure outcome unknown", async () => {
    const provider = new PaystackHostedPaymentProvider({
      fetch: (async () =>
        new Response(JSON.stringify({ status: false }), {
          status: 503,
        })) as unknown as typeof fetch,
      secretKey: "test-secret",
    })

    await expect(
      provider.createCheckout({
        amountMinor: 4200,
        callbackUrl: "https://store.example/return",
        currencyCode: "NGN",
        customerEmail: "customer@example.test",
        metadata: { orderId: "order-1" },
        reference: "payment-1",
      }),
    ).rejects.toEqual(
      new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider outcome is unknown.",
      ),
    )
  })

  test("verifies and normalizes signed callbacks", () => {
    const body = JSON.stringify({
      data: {
        amount: 4200,
        currency: "NGN",
        reference: "payment-1",
        status: "success",
      },
      event: "charge.success",
    })
    const secretKey = "test-secret"
    const signature = createHmac("sha512", secretKey).update(body).digest("hex")
    const adapter = new PaystackWebhookAdapter(secretKey)
    expect(adapter.verify(body, signature)).toBe(true)
    expect(adapter.parse(body)).toEqual({
      amountMinor: 4200,
      currencyCode: "NGN",
      eventId: "charge.success:payment-1",
      providerReference: "payment-1",
      status: "paid",
    })
  })

  test("tags provider refunds and reconciles an unknown outcome without redispatch", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = []
    const provider = new PaystackHostedPaymentProvider({
      fetch: (async (url, init) => {
        calls.push({
          body: typeof init?.body === "string" ? init.body : undefined,
          method: init?.method,
          url: String(url),
        })
        return new Response(
          JSON.stringify(
            init?.method === "POST"
              ? { data: { id: 42, status: "pending" }, status: true }
              : {
                  data: [
                    {
                      amount: 2_500,
                      currency: "NGN",
                      id: 42,
                      merchant_note: "ewatrade-refund:refund-1",
                      status: "processed",
                    },
                  ],
                  status: true,
                },
          ),
        )
      }) as typeof fetch,
      secretKey: "test-secret",
    })
    const input = {
      amountMinor: 2_500,
      claimedAt: new Date("2026-08-09T12:00:00.000Z"),
      commandReference: "ewatrade-refund:refund-1",
      currencyCode: "NGN",
      providerReference: "payment-1",
      reason: "Customer cancellation",
    }

    await provider.refund(input)
    await expect(provider.reconcileRefund(input)).resolves.toEqual({
      providerRefundId: "42",
      status: "succeeded",
    })

    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      merchant_note: "ewatrade-refund:refund-1",
    })
    expect(calls[1]?.method).toBeUndefined()
    expect(calls[1]?.url).toContain("from=2026-08-08")
    expect(calls[1]?.url).not.toContain("transaction=")
  })
})
