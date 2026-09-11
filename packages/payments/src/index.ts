import { createHmac, timingSafeEqual } from "node:crypto"

import { HostedCheckoutProviderError } from "./hosted-checkout-errors"

export * from "./hosted-checkout-errors"
export * from "./prescription-checkout-handoff"

export type HostedCheckoutInput = {
  amountMinor: number
  callbackUrl: string
  currencyCode: string
  customerEmail: string
  metadata: Record<string, string>
  reference: string
}

export type HostedCheckout = {
  checkoutUrl: string
  expiresAt?: Date
  providerReference: string
}

export type HostedRefundInput = {
  amountMinor: number
  claimedAt: Date
  commandReference: string
  currencyCode: string
  providerReference: string
  reason: string
}

export type HostedRefundResult = {
  providerRefundId: string
  status: "pending" | "succeeded"
}

export interface HostedPaymentProvider {
  readonly key: string
  createCheckout(input: HostedCheckoutInput): Promise<HostedCheckout>
  reconcileRefund(input: HostedRefundInput): Promise<HostedRefundResult | null>
  refund(input: HostedRefundInput): Promise<HostedRefundResult>
}

export type NormalizedPaymentEvent = {
  amountMinor: number
  currencyCode: string
  eventId: string
  providerReference: string
  status: "failed" | "paid" | "refund_failed" | "refund_succeeded"
}

export interface PaymentWebhookAdapter {
  parse(body: string): NormalizedPaymentEvent | null
  verify(body: string, signature: string | null): boolean
}

export class PaystackHostedPaymentProvider implements HostedPaymentProvider {
  readonly key = "paystack"
  readonly #fetch: typeof fetch
  readonly #secretKey: string

  constructor(input: { fetch?: typeof fetch; secretKey: string }) {
    this.#fetch = input.fetch ?? fetch
    this.#secretKey = input.secretKey
  }

  async createCheckout(input: HostedCheckoutInput) {
    let response: Response
    try {
      response = await this.#fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          body: JSON.stringify({
            amount: input.amountMinor,
            callback_url: input.callbackUrl,
            currency: input.currencyCode,
            email: input.customerEmail,
            metadata: input.metadata,
            reference: input.reference,
          }),
          headers: {
            Authorization: `Bearer ${this.#secretKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      )
    } catch {
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider outcome is unknown.",
      )
    }
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string
      data?: { authorization_url?: string; reference?: string }
      message?: string
      status?: boolean
    }
    const normalizedFailure = `${payload.code ?? ""} ${payload.message ?? ""}`
      .trim()
      .toLowerCase()
    const ambiguousResponse =
      response.status >= 500 ||
      [408, 409, 425, 429].includes(response.status) ||
      normalizedFailure.includes("duplicate")
    if ((!response.ok || payload.status === false) && !ambiguousResponse) {
      throw new HostedCheckoutProviderError(
        "DEFINITE_FAILURE",
        "The payment provider rejected checkout initialization.",
      )
    }
    if (ambiguousResponse)
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider outcome is unknown.",
      )
    if (!payload.status || !payload.data?.authorization_url)
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider outcome is unknown.",
      )
    return {
      checkoutUrl: payload.data.authorization_url,
      providerReference: payload.data.reference ?? input.reference,
    }
  }

  async refund(input: HostedRefundInput) {
    const response = await this.#fetch("https://api.paystack.co/refund", {
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currencyCode,
        merchant_note: input.commandReference,
        transaction: input.providerReference,
      }),
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    })
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { id?: number | string; status?: string }
      message?: string
      status?: boolean
    }
    if (!response.ok || !payload.status) {
      throw new Error(payload.message ?? `Refund failed (${response.status}).`)
    }
    return {
      providerRefundId: String(payload.data?.id ?? input.providerReference),
      status:
        payload.data?.status === "processed" ||
        payload.data?.status === "success"
          ? ("succeeded" as const)
          : ("pending" as const),
    }
  }

  async reconcileRefund(input: HostedRefundInput) {
    const from = new Date(input.claimedAt.getTime() - 24 * 60 * 60_000)
      .toISOString()
      .slice(0, 10)
    for (let page = 1; page <= 100; page += 1) {
      const url = new URL("https://api.paystack.co/refund")
      url.searchParams.set("from", from)
      url.searchParams.set("page", String(page))
      url.searchParams.set("perPage", "100")
      const response = await this.#fetch(url, {
        headers: { Authorization: `Bearer ${this.#secretKey}` },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        data?: Array<{
          amount?: number
          currency?: string
          id?: number | string
          merchant_note?: string
          status?: string
        }>
        message?: string
        status?: boolean
      }
      if (!response.ok || !payload.status) {
        throw new Error(
          payload.message ??
            `Refund reconciliation failed (${response.status}).`,
        )
      }
      const refund = payload.data?.find(
        (candidate) =>
          candidate.amount === input.amountMinor &&
          candidate.currency === input.currencyCode &&
          candidate.merchant_note === input.commandReference,
      )
      if (refund?.id) {
        return {
          providerRefundId: String(refund.id),
          status:
            refund.status === "processed" || refund.status === "success"
              ? ("succeeded" as const)
              : ("pending" as const),
        }
      }
      if ((payload.data?.length ?? 0) < 100) return null
    }
    throw new Error("Refund reconciliation exceeded the provider page limit.")
  }
}

export class PaystackWebhookAdapter implements PaymentWebhookAdapter {
  readonly #secretKey: string

  constructor(secretKey: string) {
    this.#secretKey = secretKey
  }

  verify(body: string, signature: string | null) {
    if (!signature) return false
    const expected = createHmac("sha512", this.#secretKey)
      .update(body)
      .digest("hex")
    const expectedBytes = Buffer.from(expected)
    const receivedBytes = Buffer.from(signature)
    return (
      expectedBytes.length === receivedBytes.length &&
      timingSafeEqual(expectedBytes, receivedBytes)
    )
  }

  parse(body: string): NormalizedPaymentEvent | null {
    let value: unknown
    try {
      value = JSON.parse(body)
    } catch {
      return null
    }
    if (!value || typeof value !== "object") return null
    const payload = value as Record<string, unknown>
    const event = String(payload.event ?? "")
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {}
    const transaction =
      data.transaction && typeof data.transaction === "object"
        ? (data.transaction as Record<string, unknown>)
        : {}
    const providerReference = String(
      data.reference ??
        data.transaction_reference ??
        transaction.reference ??
        "",
    ).trim()
    if (!providerReference) return null
    const amountMinor = Number(data.amount ?? transaction.amount ?? 0)
    const currencyCode = String(
      data.currency ?? transaction.currency ?? "NGN",
    ).toUpperCase()
    const refundId = String(data.refund_reference ?? data.id ?? "").trim()
    const status = String(data.status ?? "").toLowerCase()

    if (event === "charge.success" && status === "success") {
      return {
        amountMinor,
        currencyCode,
        eventId: `${event}:${providerReference}`,
        providerReference,
        status: "paid",
      }
    }
    if (event === "charge.failed") {
      return {
        amountMinor,
        currencyCode,
        eventId: `${event}:${providerReference}`,
        providerReference,
        status: "failed",
      }
    }
    if (event === "refund.processed") {
      return {
        amountMinor,
        currencyCode,
        eventId: `${event}:${refundId || providerReference}`,
        providerReference,
        status: "refund_succeeded",
      }
    }
    if (event === "refund.failed") {
      return {
        amountMinor,
        currencyCode,
        eventId: `${event}:${refundId || providerReference}`,
        providerReference,
        status: "refund_failed",
      }
    }
    return null
  }
}

export function createDeterministicHostedPaymentProvider(): HostedPaymentProvider {
  return {
    key: "deterministic-fake",
    async createCheckout(input) {
      return {
        checkoutUrl: `https://payments.example.test/checkout/${input.reference}`,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        providerReference: input.reference,
      }
    },
    async refund(input) {
      return {
        providerRefundId: `refund:${input.providerReference}:${input.amountMinor}`,
        status: "succeeded",
      }
    },
    async reconcileRefund(input) {
      return {
        providerRefundId: `refund:${input.providerReference}:${input.amountMinor}`,
        status: "succeeded",
      }
    },
  }
}

export function getConfiguredHostedPaymentProvider(): HostedPaymentProvider {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim()
  if (secretKey) return new PaystackHostedPaymentProvider({ secretKey })
  if (process.env.NODE_ENV !== "production") {
    return createDeterministicHostedPaymentProvider()
  }
  throw new Error(
    "A production hosted payment provider is not configured; checkout fails closed.",
  )
}
