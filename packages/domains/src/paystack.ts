import { createHmac, timingSafeEqual } from "node:crypto"

type Fetch = typeof fetch

export type PaystackCheckout = {
  accessCode: string
  authorizationUrl: string
  reference: string
}

export class PaystackClient {
  readonly #fetch: Fetch
  readonly #secretKey: string

  constructor(params: { fetch?: Fetch; secretKey: string }) {
    this.#fetch = params.fetch ?? fetch
    this.#secretKey = params.secretKey
  }

  async initializeTransaction(params: {
    amountMinor: number
    callbackUrl: string
    currencyCode: string
    email: string
    metadata: Record<string, unknown>
    reference: string
  }): Promise<PaystackCheckout> {
    const response = await this.#fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        body: JSON.stringify({
          amount: params.amountMinor,
          callback_url: params.callbackUrl,
          currency: params.currencyCode,
          email: params.email,
          metadata: params.metadata,
          reference: params.reference,
        }),
        headers: {
          Authorization: `Bearer ${this.#secretKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    )
    const payload = (await response.json().catch(() => ({}))) as {
      data?: {
        access_code?: string
        authorization_url?: string
        reference?: string
      }
      message?: string
      status?: boolean
    }

    if (!response.ok || payload.status !== true || !payload.data) {
      throw new Error(
        payload.message ??
          `Paystack initialization failed (${response.status}).`,
      )
    }

    const accessCode = payload.data.access_code
    const authorizationUrl = payload.data.authorization_url
    const reference = payload.data.reference

    if (!accessCode || !authorizationUrl || !reference) {
      throw new Error("Paystack returned an incomplete checkout session.")
    }

    return { accessCode, authorizationUrl, reference }
  }

  async refundTransaction(params: {
    amountMinor: number
    currencyCode: string
    reference: string
  }) {
    const response = await this.#fetch("https://api.paystack.co/refund", {
      body: JSON.stringify({
        amount: params.amountMinor,
        currency: params.currencyCode,
        transaction: params.reference,
      }),
      headers: {
        Authorization: `Bearer ${this.#secretKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    })
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { id?: number; status?: string }
      message?: string
      status?: boolean
    }

    if (!response.ok || payload.status !== true) {
      throw new Error(
        payload.message ?? `Paystack refund failed (${response.status}).`,
      )
    }

    return {
      providerRefundId: payload.data?.id?.toString() ?? null,
      status: payload.data?.status ?? "pending",
    }
  }
}

export function verifyPaystackSignature(params: {
  body: string
  secretKey: string
  signature: string | null
}) {
  if (!params.signature) {
    return false
  }

  const expected = createHmac("sha512", params.secretKey)
    .update(params.body)
    .digest("hex")
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(params.signature)

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

export function parsePaystackRefundEvent(value: unknown) {
  if (!value || typeof value !== "object") return null
  const eventPayload = value as Record<string, unknown>
  const event = String(eventPayload.event ?? "")
  if (!event.startsWith("refund.")) return null

  const data =
    eventPayload.data && typeof eventPayload.data === "object"
      ? (eventPayload.data as Record<string, unknown>)
      : {}
  const transaction =
    data.transaction && typeof data.transaction === "object"
      ? (data.transaction as Record<string, unknown>)
      : {}
  const paymentReference = String(
    data.transaction_reference ?? transaction.reference ?? "",
  ).trim()

  if (!paymentReference) return null

  const refundReference = String(data.refund_reference ?? data.id ?? "").trim()
  const status = String(data.status ?? event.slice("refund.".length))
    .trim()
    .toLowerCase()

  return {
    event,
    paymentReference,
    providerEventId: `${event}:${refundReference || paymentReference}`,
    status,
  }
}
