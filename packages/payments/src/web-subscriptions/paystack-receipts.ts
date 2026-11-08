import { createHash } from "node:crypto"
import { z } from "zod"
import type { WebBillingEnvironment, WebBillingProduct } from "./config"

const object = z.record(z.string(), z.unknown())
export function paystackRecord(value: unknown) {
  return object.parse(value)
}
export function paystackDigest(value: string) {
  return createHash("sha256").update(`owner-paystack:${value}`).digest("hex")
}

export function paidMonthlyPeriod(paidAt: Date) {
  const end = new Date(paidAt)
  const day = end.getUTCDate()
  end.setUTCDate(1)
  end.setUTCMonth(end.getUTCMonth() + 1)
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate()
  end.setUTCDate(Math.min(day, last))
  return end
}

/** Input must be the server's verify-transaction response, never a callback. */
export function verifiedPaystackCharge(input: {
  transaction: unknown
  reference: string
  product: WebBillingProduct
  environment: WebBillingEnvironment
  initialBinding?: { checkoutId: string; accountId: string }
  now: Date
}) {
  const data = paystackRecord(input.transaction)
  const customer = paystackRecord(data.customer)
  const authorization = paystackRecord(data.authorization)
  const plan = object.safeParse(data.plan_object)
  const planObject = object.safeParse(data.plan)
  const planCode =
    plan.success && typeof plan.data.plan_code === "string"
      ? plan.data.plan_code
      : planObject.success
        ? planObject.data.plan_code
        : data.plan
  const paidAt = new Date(
    z.iso.datetime({ offset: true }).parse(data.paid_at ?? data.paidAt),
  )
  if (
    data.reference !== input.reference ||
    data.status !== "success" ||
    data.domain !== (input.environment === "production" ? "live" : "test") ||
    data.amount !== input.product.amountMinor ||
    data.currency !== input.product.currency ||
    planCode !== input.product.productId ||
    authorization.reusable !== true ||
    authorization.channel !== "card" ||
    paidAt > input.now ||
    (typeof data.refunded === "boolean" && data.refunded) ||
    (typeof data.amount_refunded === "number" && data.amount_refunded > 0)
  )
    throw new Error("The verified payment does not match this subscription.")
  if (input.initialBinding) {
    const metadata = paystackRecord(data.metadata)
    if (
      metadata.purpose !== "owner_subscription" ||
      metadata.checkoutId !== input.initialBinding.checkoutId ||
      metadata.accountId !== input.initialBinding.accountId
    )
      throw new Error("The verified payment belongs to another checkout.")
  }
  return {
    reference: input.reference,
    paidAt,
    expiresAt: paidMonthlyPeriod(paidAt),
    customerCode: z
      .string()
      .regex(/^CUS_[A-Za-z0-9]+$/)
      .parse(customer.customer_code),
    authorizationDigest: paystackDigest(
      z
        .string()
        .regex(/^AUTH_[A-Za-z0-9]+$/)
        .parse(authorization.authorization_code),
    ),
  }
}

/** A subscription being active or having a future debit date is not paid proof. */
export function verifiedPaystackSubscription(input: {
  subscription: unknown
  code: string
  product: WebBillingProduct
  environment: WebBillingEnvironment
}) {
  const data = paystackRecord(input.subscription)
  const plan = paystackRecord(data.plan)
  const customer = paystackRecord(data.customer)
  const auth = paystackRecord(data.authorization)
  if (
    data.subscription_code !== input.code ||
    plan.plan_code !== input.product.productId ||
    plan.interval !== "monthly" ||
    plan.amount !== input.product.amountMinor ||
    plan.currency !== input.product.currency ||
    plan.domain !== (input.environment === "production" ? "live" : "test") ||
    data.amount !== input.product.amountMinor
  )
    throw new Error("The provider subscription does not match the paid offer.")
  return {
    code: z
      .string()
      .regex(/^SUB_[A-Za-z0-9]+$/)
      .parse(data.subscription_code),
    customerCode: z
      .string()
      .regex(/^CUS_[A-Za-z0-9]+$/)
      .parse(customer.customer_code),
    authorizationDigest: paystackDigest(
      z
        .string()
        .regex(/^AUTH_[A-Za-z0-9]+$/)
        .parse(auth.authorization_code),
    ),
    cancelAtPeriodEnd: ["non-renewing", "cancelled", "complete"].includes(
      String(data.status),
    ),
    status: z
      .enum(["active", "non-renewing", "attention", "cancelled", "complete"])
      .parse(data.status),
  }
}
