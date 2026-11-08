import { createHmac, timingSafeEqual } from "node:crypto"
import { Webhook } from "standardwebhooks"
import { z } from "zod"
import { HostedCheckoutProviderError } from "../hosted-checkout-errors"
import {
  type WebBillingEnvironment,
  type WebBillingProduct,
  webBillingProducts,
} from "./config"

const record = z.record(z.string(), z.unknown())
function object(value: unknown) {
  return record.parse(value)
}
function date(value: unknown) {
  return new Date(z.iso.datetime({ offset: true }).parse(value))
}

export function hostedCheckoutUrl(
  value: unknown,
  provider: "paystack" | "polar",
  environment: WebBillingEnvironment,
) {
  const url = new URL(z.string().min(1).max(4096).parse(value))
  const hosts =
    provider === "paystack"
      ? ["checkout.paystack.com"]
      : environment === "sandbox"
        ? ["sandbox.polar.sh"]
        : ["polar.sh"]
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
    readonly provider: "paystack" | "polar",
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
    this.base =
      provider === "paystack"
        ? "https://api.paystack.co"
        : environment === "sandbox"
          ? "https://sandbox-api.polar.sh/v1"
          : "https://api.polar.sh/v1"
  }

  private async request(path: string, body?: Record<string, unknown>) {
    let response: Response
    try {
      response = await this.transport(`${this.base}${path}`, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${this.secret}`,
          "Content-Type": "application/json",
          ...(this.provider === "polar" ? { "Polar-Version": "2026-10" } : {}),
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
  }) {
    const { product, checkoutId, accountId, email, returnUrl } = input
    z.uuid().parse(checkoutId)
    z.uuid().parse(accountId)
    z.email().parse(email)
    if (
      webBillingProducts({ WEB_BILLING_PRODUCTS: JSON.stringify([product]) })
        .length !== 1
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
    const productData = await this.request(
      `/products/${encodeURIComponent(product.productId)}`,
    )
    const prices = z
      .array(record)
      .parse(productData.prices)
      .filter((p) => p.is_archived !== true)
    if (
      productData.id !== product.productId ||
      productData.is_archived === true ||
      productData.is_recurring !== true ||
      productData.recurring_interval !== "month" ||
      productData.recurring_interval_count !== 1 ||
      prices.length !== 1 ||
      prices[0]?.amount_type !== "fixed" ||
      prices[0]?.price_amount !== product.amountMinor ||
      prices[0]?.price_currency !== product.currency.toLowerCase()
    )
      throw new Error(
        "Polar product does not match the approved monthly offer.",
      )
    const result = await this.request("/checkouts/", {
      products: [product.productId],
      external_customer_id: accountId,
      customer_email: email,
      metadata: { purpose: "owner_subscription", checkoutId, accountId },
      allow_discount_codes: false,
      allow_trial: false,
      currency: product.currency.toLowerCase(),
      success_url: returnUrl,
      return_url: returnUrl,
    })
    const metadata = record.safeParse(result.metadata)
    if (
      result.currency !== product.currency.toLowerCase() ||
      result.amount !== product.amountMinor ||
      result.product_id !== product.productId ||
      result.external_customer_id !== accountId ||
      result.allow_trial !== false ||
      result.trial_end !== null ||
      result.allow_discount_codes !== false ||
      result.discount_amount !== 0 ||
      result.is_payment_required !== true ||
      !metadata.success ||
      metadata.data.checkoutId !== checkoutId ||
      metadata.data.accountId !== accountId ||
      metadata.data.purpose !== "owner_subscription"
    )
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "Polar returned a checkout with unexpected offer or owner details.",
      )
    const expiresAt = date(result.expires_at)
    if (expiresAt.getTime() <= Date.now())
      throw new HostedCheckoutProviderError(
        "OUTCOME_UNKNOWN",
        "Polar returned an expired checkout.",
      )
    return {
      checkoutUrl: hostedCheckoutUrl(
        result.url,
        this.provider,
        this.environment,
      ),
      providerSessionId: z.uuid().parse(result.id),
      expiresAt,
    }
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

export function verifyPolarSubscriptionWebhook(
  body: string,
  headers: Record<string, string>,
  secret: string,
  format: "standard" | "legacy" = "standard",
) {
  // Polar-generated secrets since 8 Sep 2026 use Standard Webhooks. Older or
  // custom secrets use the full UTF-8 string as the HMAC key, including prefix.
  const webhook =
    format === "standard"
      ? new Webhook(secret)
      : new Webhook(secret, { format: "raw" })
  return object(webhook.verify(body, headers))
}
