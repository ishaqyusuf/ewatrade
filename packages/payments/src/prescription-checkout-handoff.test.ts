import { describe, expect, test } from "bun:test"

import { HostedCheckoutProviderError } from "./hosted-checkout-errors"
import { PaystackHostedPaymentProvider } from "./index"
import {
  PrescriptionCheckoutHandoffError,
  createPrescriptionHostedCheckoutHandoff,
} from "./prescription-checkout-handoff"

const input = {
  acceptanceToken: "customer-action-capability-token",
  clientPaymentId: "store-conversation-payment:operation-3",
  statusToken: "status-token-that-is-long-enough",
}

function preparedCheckout() {
  return {
    amountMinor: 25_000,
    currencyCode: "NGN",
    customerEmail: "qa@example.com",
    intentId: "intent-1",
    providerReference: "rxpay_operation3",
    replay: true,
    statusToken: input.statusToken,
    tenantDataClassification: "LIVE" as const,
  }
}

function provider(
  createCheckout: () => Promise<{
    checkoutUrl: string
    providerReference: string
  }>,
) {
  return {
    createCheckout,
    key: "paystack",
    reconcileRefund: async () => null,
    refund: async () => ({
      providerRefundId: "refund-1",
      status: "pending" as const,
    }),
  }
}

describe("Prescription checkout handoff", () => {
  test("blocks a QA checkout before the provider and records a redacted audit", async () => {
    let providerCalls = 0
    const audits: unknown[] = []
    await expect(
      createPrescriptionHostedCheckoutHandoff(input, {
        attachCheckout: async () => undefined,
        claimCheckout: async () => ({ kind: "claimed" as const }),
        prepareCheckout: async () => ({
          ...preparedCheckout(),
          tenantDataClassification: "QA" as const,
        }),
        recordProviderBlocked: async (audit) => {
          audits.push(audit)
        },
        releaseCheckoutClaim: async () => ({ released: true }),
        provider: provider(async () => {
          providerCalls += 1
          throw new Error("unexpected provider call")
        }),
      }),
    ).rejects.toMatchObject({ code: "QA_LIVE_EFFECT_BLOCKED" })
    expect(providerCalls).toBe(0)
    expect(audits).toEqual([
      {
        intentId: "intent-1",
        operation: "payment",
        outcome: "QA_LIVE_EFFECT_BLOCKED",
      },
    ])
  })

  test("returns an already attached checkout without calling the provider", async () => {
    let providerCalls = 0
    const result = await createPrescriptionHostedCheckoutHandoff(input, {
      attachCheckout: async () => undefined,
      claimCheckout: async () => ({
        checkoutUrl: "https://checkout.paystack.com/existing-session",
        kind: "ready" as const,
      }),
      prepareCheckout: async () => preparedCheckout(),
      releaseCheckoutClaim: async () => ({ released: true }),
      provider: provider(async () => {
        providerCalls += 1
        throw new Error("unexpected provider call")
      }),
    })

    expect(result.checkoutUrl).toBe(
      "https://checkout.paystack.com/existing-session",
    )
    expect(providerCalls).toBe(0)
  })

  test("allows only one provider initialization across concurrent retries", async () => {
    let checkoutUrl: string | null = null
    let claimed = false
    let providerCalls = 0
    let releaseProvider: () => void = () => undefined
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve
    })
    const dependencies = {
      attachCheckout: async (attachment: { checkoutUrl: string }) => {
        checkoutUrl = attachment.checkoutUrl
        return {} as never
      },
      claimCheckout: async () => {
        if (checkoutUrl) {
          return { checkoutUrl, kind: "ready" as const }
        }
        if (claimed) return { kind: "initializing" as const }
        claimed = true
        return { kind: "claimed" as const }
      },
      prepareCheckout: async () => preparedCheckout(),
      releaseCheckoutClaim: async () => ({ released: true }),
      provider: provider(async () => {
        providerCalls += 1
        await providerGate
        return {
          checkoutUrl: "https://checkout.paystack.com/session-1",
          providerReference: "rxpay_operation3",
        }
      }),
      storefrontUrl: "https://chat.ewatrade.com",
    }

    const first = createPrescriptionHostedCheckoutHandoff(input, dependencies)
    while (providerCalls === 0) await Promise.resolve()
    await expect(
      createPrescriptionHostedCheckoutHandoff(input, dependencies),
    ).rejects.toEqual(
      new PrescriptionCheckoutHandoffError(
        "INITIALIZING",
        "Checkout is being prepared. Try again shortly.",
      ),
    )
    releaseProvider()
    await expect(first).resolves.toMatchObject({
      checkoutUrl: "https://checkout.paystack.com/session-1",
    })
    expect(providerCalls).toBe(1)
  })

  test("retries the local attachment without creating a second provider session", async () => {
    let attachCalls = 0
    let providerCalls = 0
    const result = await createPrescriptionHostedCheckoutHandoff(input, {
      attachCheckout: async () => {
        attachCalls += 1
        if (attachCalls === 1) throw new Error("transient database failure")
      },
      claimCheckout: async () => ({ kind: "claimed" as const }),
      prepareCheckout: async () => preparedCheckout(),
      releaseCheckoutClaim: async () => ({ released: true }),
      provider: provider(async () => {
        providerCalls += 1
        return {
          checkoutUrl: "https://checkout.paystack.com/session-1",
          providerReference: "rxpay_operation3",
        }
      }),
    })

    expect(result.checkoutUrl).toBe("https://checkout.paystack.com/session-1")
    expect(attachCalls).toBe(2)
    expect(providerCalls).toBe(1)
  })

  test("keeps an uncertain provider outcome claimed instead of risking a duplicate", async () => {
    let providerCalls = 0
    let releaseCalls = 0
    const dependencies = {
      attachCheckout: async () => undefined,
      claimCheckout: async () => ({ kind: "claimed" as const }),
      prepareCheckout: async () => preparedCheckout(),
      releaseCheckoutClaim: async () => {
        releaseCalls += 1
        return { released: true }
      },
      provider: provider(async () => {
        providerCalls += 1
        throw new HostedCheckoutProviderError(
          "OUTCOME_UNKNOWN",
          "The payment provider outcome is unknown.",
        )
      }),
    }

    await expect(
      createPrescriptionHostedCheckoutHandoff(input, dependencies),
    ).rejects.toEqual(
      new PrescriptionCheckoutHandoffError(
        "INITIALIZING",
        "Checkout is being reconciled. Try again shortly.",
      ),
    )
    await expect(
      createPrescriptionHostedCheckoutHandoff(input, {
        ...dependencies,
        claimCheckout: async () => ({ kind: "initializing" as const }),
      }),
    ).rejects.toMatchObject({ code: "INITIALIZING" })
    expect(providerCalls).toBe(1)
    expect(releaseCalls).toBe(0)
  })

  test("never releases the claim after an ambiguous provider server response", async () => {
    let releaseCalls = 0
    const paystack = new PaystackHostedPaymentProvider({
      fetch: (async () =>
        new Response(JSON.stringify({ status: false }), {
          status: 503,
        })) as unknown as typeof fetch,
      secretKey: "test-secret",
    })

    await expect(
      createPrescriptionHostedCheckoutHandoff(input, {
        attachCheckout: async () => undefined,
        claimCheckout: async () => ({ kind: "claimed" as const }),
        prepareCheckout: async () => preparedCheckout(),
        provider: paystack,
        releaseCheckoutClaim: async () => {
          releaseCalls += 1
          return { released: true }
        },
      }),
    ).rejects.toMatchObject({ code: "INITIALIZING" })
    expect(releaseCalls).toBe(0)
  })

  test("releases a definitely rejected initialization so the customer can retry", async () => {
    let releaseCalls = 0
    await expect(
      createPrescriptionHostedCheckoutHandoff(input, {
        attachCheckout: async () => undefined,
        claimCheckout: async () => ({ kind: "claimed" as const }),
        prepareCheckout: async () => preparedCheckout(),
        provider: provider(async () => {
          throw new HostedCheckoutProviderError(
            "DEFINITE_FAILURE",
            "The payment provider rejected checkout initialization.",
          )
        }),
        releaseCheckoutClaim: async () => {
          releaseCalls += 1
          return { released: true }
        },
      }),
    ).rejects.toEqual(
      new PrescriptionCheckoutHandoffError(
        "PROVIDER_UNAVAILABLE",
        "Checkout is temporarily unavailable. Try again.",
      ),
    )
    expect(releaseCalls).toBe(1)
  })

  test("keeps the claim when definite-failure release cannot be confirmed", async () => {
    await expect(
      createPrescriptionHostedCheckoutHandoff(input, {
        attachCheckout: async () => undefined,
        claimCheckout: async () => ({ kind: "claimed" as const }),
        prepareCheckout: async () => preparedCheckout(),
        provider: provider(async () => {
          throw new HostedCheckoutProviderError(
            "DEFINITE_FAILURE",
            "The payment provider rejected checkout initialization.",
          )
        }),
        releaseCheckoutClaim: async () => {
          throw new Error("database unavailable")
        },
      }),
    ).rejects.toEqual(
      new PrescriptionCheckoutHandoffError(
        "INITIALIZING",
        "Checkout is being reconciled. Try again shortly.",
      ),
    )
  })
})
