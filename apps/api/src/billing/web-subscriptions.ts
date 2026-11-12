import type { PrismaClient } from "@ewatrade/db"
import {
  applyOwnerWebCharge,
  bindOwnerWebSubscription,
  findOwnerBillingAccount,
  findOwnerWebCheckout,
  findPendingOwnerWebCheckout,
  findWebChargeCheckout,
  findWebSubscriptionCheckout,
  finishOwnerWebCheckout,
  getOrCreateOwnerBillingAccount,
  getOwnerBillingCatalogState,
  latestOwnerWebCheckout,
  markOwnerWebNonRenewing,
  ownerBillingRuntime,
  prepareOwnerWebCheckout,
  recordWebRefund,
  revokeOwnerWebCharge,
} from "@ewatrade/db/owner-billing"
import { ruleRejectedError } from "@ewatrade/errors"
import {
  type BillingEnvironment,
  HostedCheckoutProviderError,
  type WebPlanId,
  WebSubscriptionClient,
  isWebCheckoutEnabled,
  isWebProviderConfigured,
  isWebReconciliationConfigured,
  paystackRecord,
  verifiedPaystackCharge,
  verifiedPaystackSubscription,
  webBillingCountry,
  webBillingEnvironment,
  webBillingProduct,
  webBillingProducts,
} from "@ewatrade/payments/web-subscriptions"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { getStoreCheckoutLegalGate } from "./store-checkout-legal"

function webBillingRuleError(message: string) {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message,
    cause: ruleRejectedError(new Error(message), "billing.webSubscription"),
  })
}

function paymentClient(env: BillingEnvironment = process.env) {
  const environment = webBillingEnvironment(env)
  if (!environment || !isWebProviderConfigured("paystack", env))
    throw new Error("Paystack subscriptions are not configured.")
  return new WebSubscriptionClient(
    "paystack",
    environment,
    env.PAYSTACK_SUBSCRIPTION_SECRET_KEY ?? "",
  )
}

async function billingCountry(
  db: PrismaClient,
  accountId: string,
  tenantId: string,
  env: BillingEnvironment,
) {
  const business = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { countryCode: true, currencyCode: true },
  })
  if (!business) return null
  return webBillingCountry({ accountId, business }, env)
}

function billingReturnUrl(env: BillingEnvironment) {
  const url = new URL(env.WEB_BILLING_RETURN_URL ?? "")
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/settings/billing"
  )
    throw new Error("Invalid billing return configuration.")
  return url.toString()
}

/**
 * Paystack refuses reserved .test addresses, which every QA identity uses.
 * In a QA Test Mode checkout the payer becomes a per-account example.com
 * address (reserved, never delivered). Real owners always keep their email.
 */
export function paystackPayerEmail(
  email: string,
  accountId: string,
  qaTestCheckout: boolean,
) {
  return qaTestCheckout && /\.test$/i.test(email)
    ? `qa-${accountId}@example.com`
    : email
}

export async function createWebSubscriptionCheckout(
  db: PrismaClient,
  input: {
    actorUserId: string
    tenantId: string
    email: string
    planId: WebPlanId
  },
  env: BillingEnvironment = process.env,
) {
  if (!isWebCheckoutEnabled(env) || !isWebProviderConfigured("paystack", env))
    throw webBillingRuleError(
      "Online payments are not available yet. No payment has been taken.",
    )
  // QA sessions cannot reach the Account terms procedures, so a QA business
  // skips the terms step in Test Mode only, where no real money moves.
  const qaTestCheckout =
    webBillingEnvironment(env) === "sandbox" &&
    (
      await db.tenant.findUnique({
        where: { id: input.tenantId },
        select: { dataClassification: true },
      })
    )?.dataClassification === "QA"
  const legal = qaTestCheckout
    ? { purchaseAvailable: true }
    : await getStoreCheckoutLegalGate(db, input.actorUserId, true)
  if (!legal.purchaseAvailable)
    throw webBillingRuleError(
      "Accept the current terms before starting payment.",
    )
  const account = await getOrCreateOwnerBillingAccount(db, input.actorUserId)
  const country = await billingCountry(db, account.id, input.tenantId, env)
  const product = webBillingProduct(input.planId, country, env)
  const environment = webBillingEnvironment(env)
  if (
    !country ||
    !product ||
    !environment ||
    (country !== "NG" && env.PAYSTACK_INTERNATIONAL_ENABLED !== "true")
  )
    throw webBillingRuleError(
      "Payment is not configured for your billing country yet. No payment has been taken.",
    )
  const returnUrl = billingReturnUrl(env)
  const prepared = await prepareOwnerWebCheckout(db, {
    ...input,
    actorUserId: input.actorUserId,
    accountId: account.id,
    country,
    product,
    environment,
    returnUrl,
  })
  if (!prepared.dispatch)
    return {
      checkoutUrl: prepared.session.checkoutUrl,
      checkoutId: prepared.session.id,
    }
  try {
    const checkout = await paymentClient(env).createCheckout({
      product,
      accountId: account.id,
      checkoutId: prepared.session.id,
      email: paystackPayerEmail(input.email, account.id, qaTestCheckout),
      returnUrl,
      usdApproved: env.PAYSTACK_USD_ENABLED === "true",
    })
    const saved = await finishOwnerWebCheckout(db, {
      id: prepared.session.id,
      accountId: account.id,
      state: "ready",
      checkoutUrl: checkout.checkoutUrl,
    })
    return { checkoutUrl: saved.checkoutUrl, checkoutId: prepared.session.id }
  } catch (error) {
    const state =
      error instanceof HostedCheckoutProviderError &&
      error.code === "DEFINITE_FAILURE"
        ? "failed"
        : "uncertain"
    await finishOwnerWebCheckout(db, {
      id: prepared.session.id,
      accountId: account.id,
      state,
    })
    throw webBillingRuleError(
      state === "uncertain"
        ? "The payment provider response is unconfirmed. Check payment status before trying again."
        : "Checkout could not be opened. No payment was confirmed.",
    )
  }
}

function assertEnvironment(
  facts: { environment: string },
  env: BillingEnvironment,
) {
  if (facts.environment !== webBillingEnvironment(env))
    throw new Error("Payment environment mismatch.")
}

function assertWebReconciliationConfigured(env: BillingEnvironment) {
  if (!isWebReconciliationConfigured(env))
    throw webBillingRuleError("Subscription processing is unavailable.")
}

async function reconcileCharge(
  db: PrismaClient,
  checkoutId: string,
  reference: string,
  subscriptionCode: string | undefined,
  env: BillingEnvironment,
) {
  const checkout = await findOwnerWebCheckout(db, checkoutId)
  if (!checkout) throw new Error("Unknown subscription checkout.")
  const { facts } = checkout
  assertEnvironment(facts, env)
  const transaction = await paymentClient(env).request(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  )
  const charge = verifiedPaystackCharge({
    transaction,
    reference,
    product: facts.product,
    environment: facts.environment,
    now: new Date(),
    ...(!subscriptionCode
      ? { initialBinding: { checkoutId, accountId: facts.accountId } }
      : {}),
  })
  const result = await applyOwnerWebCharge(db, {
    ...charge,
    checkoutId,
    accountId: facts.accountId,
    now: new Date(),
    subscriptionCode,
  })
  return result
}

/** Reference comes from a signed webhook or an owner-bound stored checkout. */
export async function reconcileInitialWebCheckout(
  db: PrismaClient,
  checkoutId: string,
  env: BillingEnvironment = process.env,
) {
  assertWebReconciliationConfigured(env)
  return reconcileCharge(db, checkoutId, `ewasub-${checkoutId}`, undefined, env)
}

export async function getWebBillingSettings(
  db: PrismaClient,
  actorUserId: string,
  tenantId: string,
  env: BillingEnvironment = process.env,
) {
  if (!webBillingEnvironment(env)) return null
  const account = await findOwnerBillingAccount(db, actorUserId)
  const runtime = ownerBillingRuntime(env)
  const state =
    account && runtime
      ? await getOwnerBillingCatalogState(db, {
          accountId: account.id,
          tenantId,
          environment: runtime.environment,
        })
      : null
  const pending = account
    ? await findPendingOwnerWebCheckout(db, account.id)
    : null
  const country = account
    ? await billingCountry(db, account.id, tenantId, env)
    : null
  return {
    pending: Boolean(pending),
    hasSubscription: state?.hasSubscription ?? false,
    covered: state?.enrolled ?? false,
    canManage: state?.subscriptionProvider === "paystack",
    prices: webBillingProducts(env)
      .filter((p) => country && p.countries.includes(country))
      .map((p) => ({
        planId: p.planId,
        label: `${new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).format(p.amountMinor / 100)} / month`,
      })),
  }
}

export async function checkWebSubscriptionPayment(
  db: PrismaClient,
  actorUserId: string,
  env: BillingEnvironment = process.env,
) {
  assertWebReconciliationConfigured(env)
  const account = await findOwnerBillingAccount(db, actorUserId)
  if (!account) throw new Error("No checkout was found for this owner.")
  const session = await latestOwnerWebCheckout(db, account.id)
  if (!session) throw new Error("No checkout was found for this owner.")
  if (session.status === "COMPLETED")
    return {
      message:
        "Payment is recorded. Apply the subscription to this business if it is not covered yet.",
    }
  await reconcileInitialWebCheckout(db, session.id, env)
  return {
    message:
      "Payment verified. Apply the subscription to this business to use your plan.",
  }
}

export async function manageWebSubscription(
  db: PrismaClient,
  actorUserId: string,
) {
  const account = await findOwnerBillingAccount(db, actorUserId)
  if (!account) throw new Error("No Paystack subscription was found.")
  const current = await db.ownerBillingSubscription.findUnique({
    where: { accountId: account.id },
  })
  if (current?.provider !== "OTHER")
    throw new Error("Manage this subscription with its payment provider.")
  const session = await latestOwnerWebCheckout(db, account.id)
  if (!session) throw new Error("No Paystack subscription was found.")
  const checkout = await findOwnerWebCheckout(db, session.id)
  const code = checkout?.facts.subscriptionCode
  if (!code)
    throw new Error(
      "Your payment is recorded; subscription management is still being confirmed.",
    )
  assertEnvironment(checkout.facts, process.env)
  const result = await paymentClient().request(
    `/subscription/${encodeURIComponent(code)}/manage/link`,
  )
  const url = new URL(z.string().parse(result.link))
  if (
    url.protocol !== "https:" ||
    url.hostname !== "paystack.com" ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith("/manage/subscriptions/")
  )
    throw new Error(
      "The provider returned an invalid subscription management link.",
    )
  return { url: url.toString() }
}

/** Authentication happens before this function. Nothing is granted from event labels alone. */
export async function processPaystackSubscriptionEvent(
  db: PrismaClient,
  payload: unknown,
  env: BillingEnvironment = process.env,
) {
  assertWebReconciliationConfigured(env)
  const event = z
    .object({ event: z.string(), data: z.unknown() })
    .parse(payload)
  if (
    ![
      "charge.success",
      "subscription.create",
      "invoice.update",
      "invoice.payment_failed",
      "subscription.not_renew",
      "subscription.disable",
      "refund.processed",
    ].includes(event.event)
  )
    return
  const data = paystackRecord(event.data)
  if (event.event === "charge.success") {
    const match = /^ewasub-([0-9a-f-]{36})$/.exec(String(data.reference))
    if (!match?.[1]) return // Other Paystack uses and renewal charges have their own receipts.
    const checkout = await findOwnerWebCheckout(db, match[1])
    if (!checkout) return // May belong to another EwaTrade deployment using this key.
    await reconcileInitialWebCheckout(db, match[1], env)
    return
  }
  if (event.event === "subscription.create") {
    const code = z
      .string()
      .regex(/^SUB_[A-Za-z0-9]+$/)
      .parse(data.subscription_code)
    const remote = await paymentClient(env).request(
      `/subscription/${encodeURIComponent(code)}`,
    )
    const plan = paystackRecord(remote.plan)
    const product = webBillingProducts(env).find(
      (p) => p.productId === plan.plan_code,
    )
    if (!product) return
    const environment = webBillingEnvironment(env)
    if (!environment) throw new Error("Payment environment missing.")
    const facts = verifiedPaystackSubscription({
      subscription: remote,
      code,
      product,
      environment,
    })
    await bindOwnerWebSubscription(db, {
      ...facts,
      productId: product.productId,
      subscriptionCode: code,
      environment,
    })
    return
  }
  if (
    [
      "invoice.update",
      "invoice.payment_failed",
      "subscription.not_renew",
      "subscription.disable",
    ].includes(event.event)
  ) {
    const subscription = event.event.startsWith("invoice.")
      ? paystackRecord(data.subscription)
      : data
    const code = z
      .string()
      .regex(/^SUB_[A-Za-z0-9]+$/)
      .parse(subscription.subscription_code)
    const checkout = await findWebSubscriptionCheckout(db, code)
    if (!checkout) throw new Error("Subscription binding has not arrived yet.")
    assertEnvironment(checkout.facts, env)
    const remote = await paymentClient(env).request(
      `/subscription/${encodeURIComponent(code)}`,
    )
    const facts = verifiedPaystackSubscription({
      subscription: remote,
      code,
      product: checkout.facts.product,
      environment: checkout.facts.environment,
    })
    if (facts.customerCode !== checkout.facts.customerCode)
      throw new Error("Subscription payer mismatch.")
    if (
      event.event === "invoice.update" &&
      data.paid === true &&
      data.status === "success"
    ) {
      const transaction = paystackRecord(data.transaction)
      await reconcileCharge(
        db,
        checkout.session.id,
        z.string().min(1).parse(transaction.reference),
        code,
        env,
      )
    }
    if (facts.cancelAtPeriodEnd)
      await markOwnerWebNonRenewing(
        db,
        checkout.session.id,
        checkout.facts.accountId,
      )
    // A failed invoice or subscription date never extends a paid period.
    return
  }
  if (event.event === "refund.processed") {
    const refundId = z
      .union([z.string().min(1), z.number().int().positive()])
      .parse(data.id)
    const refund = await paymentClient(env).request(
      `/refund/${encodeURIComponent(String(refundId))}`,
    )
    if (refund.status !== "processed")
      throw new Error("Refund is not confirmed.")
    const transaction = paystackRecord(refund.transaction)
    const reference = z.string().min(1).parse(transaction.reference)
    await recordWebRefund(db, reference, new Date())
    const checkout = await findWebChargeCheckout(db, reference)
    if (!checkout) return
    assertEnvironment(checkout.facts, env)
    if (
      refund.currency !== checkout.facts.product.currency ||
      refund.amount !== checkout.facts.product.amountMinor
    )
      throw new Error("Refund requires manual review.")
    await revokeOwnerWebCharge(db, {
      checkoutId: checkout.session.id,
      accountId: checkout.facts.accountId,
      reference,
      now: new Date(),
    })
  }
}
