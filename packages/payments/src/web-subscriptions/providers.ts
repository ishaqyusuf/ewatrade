import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { HostedCheckoutProviderError } from "../hosted-checkout-errors"
import {
  type WebBillingEnvironment,
  type WebBillingProduct,
  webBillingProducts,
} from "./config"

const record = z.record(z.string(), z.unknown())

export function hostedCheckoutUrl(
  value: unknown,
  provider: "paystack",
  environment: WebBillingEnvironment,
) {
  const url = new URL(z.string().min(1).max(4096).parse(value))
  const hosts = ["checkout.paystack.com"]
  if (
    provider !== "paystack" ||
    !["sandbox", "production"].includes(environment)
  )
    throw new Error("Unsupported payment provider.")
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.includes(url.hostname)
  )
    throw new Error("The provider returned an invalid checkout destination.")
  return url.toString()
}

export class WebSubscriptionClient {
  readonly base: string
  constructor(
    readonly provider: "paystack",
    readonly environment: WebBillingEnvironment,
    private readonly secret: string,
    private readonly transport: typeof fetch = fetch,
  ) {
    if (environment !== "production" && environment !== "sandbox")
      throw new Error("A valid billing environment is required.")
    if (!secret.trim())
      throw new Error("A payment provider credential is required.")
    if (
      provider === "paystack" &&
      !secret.startsWith(environment === "production" ? "sk_live_" : "sk_test_")
    )
      throw new Error(
        "Paystack credential does not match the billing environment.",
      )
    if (provider !== "paystack")
      throw new Error("Unsupported payment provider.")
    this.base = "https://api.paystack.co"
  }

  async request(path: string, body?: Record<string, unknown>) {
    let response: Response
    try {
      response = await this.transport(`${this.base}${path}`, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${this.secret}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider outcome is unknown. Reconcile before retrying.",
      )
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const uncertain =
        response.status >= 500 || [408, 409, 425, 429].includes(response.status)
      throw new HostedCheckoutProviderError(
        uncertain ? "OUTCOME_UNKNOWN" : "DEFINITE_FAILURE",
        "The payment provider could not complete this request.",
      )
    }
    const parsed = record.safeParse(payload)
    if (!parsed.success)
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "The payment provider returned an incomplete response.",
      )
    const data = parsed.data
    if (this.provider === "paystack") {
      if (data.status !== true)
        throw new HostedCheckoutProviderError(
          "OUTCOME_UNKNOWN",
          "Paystack did not confirm the request outcome.",
        )
      const result = record.safeParse(data.data)
      if (!result.success)
        throw new HostedCheckoutProviderError(
          "OUTCOME_UNKNOWN",
          "Paystack returned an incomplete response.",
        )
      return result.data
    }
    return data
  }

  async createCheckout(input: {
    product: WebBillingProduct
    checkoutId: string
    accountId: string
    email: string
    returnUrl: string
    usdApproved?: boolean
  }) {
    const { product, checkoutId, accountId, email, returnUrl } = input
    z.uuid().parse(checkoutId)
    z.uuid().parse(accountId)
    z.email().parse(email)
    if (
      webBillingProducts({
        WEB_BILLING_PRODUCTS: JSON.stringify([product]),
        PAYSTACK_USD_ENABLED: input.usdApproved === true ? "true" : "false",
      }).length !== 1
    )
      throw new Error(
        "The checkout product does not follow the approved pricing policy.",
      )
    const callback = new URL(returnUrl)
    if (
      callback.protocol !== "https:" ||
      callback.username ||
      callback.password
    )
      throw new Error("Billing return URL must be HTTPS.")
    if (product.provider !== this.provider)
      throw new Error("Checkout provider does not match the product.")
    if (this.provider === "paystack") {
      // Passing a plan overrides amount at Paystack. Verify the saved plan first.
      const plan = await this.request(
        `/plan/${encodeURIComponent(product.productId)}`,
      )
      if (
        plan.plan_code !== product.productId ||
        plan.interval !== "monthly" ||
        plan.amount !== product.amountMinor ||
        plan.currency !== product.currency ||
        plan.domain !== (this.environment === "production" ? "live" : "test") ||
        (plan.invoice_limit !== undefined && plan.invoice_limit !== 0)
      )
        throw new Error(
          "Paystack plan does not match the approved monthly offer.",
        )
      const reference = `ewasub-${checkoutId}`
      const result = await this.request("/transaction/initialize", {
        amount: product.amountMinor,
        currency: product.currency,
        email,
        plan: product.productId,
        reference,
        callback_url: returnUrl,
        channels: ["card"],
        metadata: { purpose: "owner_subscription", checkoutId, accountId },
      })
      if (result.reference !== reference)
        throw new HostedCheckoutProviderError(
          "OUTCOME_UNKNOWN",
          "Paystack returned an unexpected payment reference.",
        )
      return {
        checkoutUrl: hostedCheckoutUrl(
          result.authorization_url,
          this.provider,
          this.environment,
        ),
        providerSessionId: reference,
        expiresAt: null,
      }
    }
    throw new Error("Unsupported payment provider.")
  }
}

export function verifyPaystackSubscriptionWebhook(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!secret.trim() || !signature || !/^[a-f0-9]{128}$/i.test(signature))
    return false
  const expected = createHmac("sha512", secret).update(body).digest()
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
}
