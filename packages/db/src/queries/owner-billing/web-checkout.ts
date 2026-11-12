import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { RETAIL_OPS_SUBSCRIPTION_PLANS } from "../retail-ops-subscription-plans"
import { runOwnerBillingTransaction } from "./prisma-repository"
import {
  findPendingOwnerWebCheckout,
  loadOwnerWebSession,
  matchingOwnerWebCheckouts,
  saveOwnerWebSession,
  updateOwnerWebSession,
} from "./web-checkout-journal"

const productSchema = z.object({
  provider: z.literal("paystack"),
  planId: z.enum(["starter", "growth", "pro"]),
  productId: z.string().regex(/^PLN_[A-Za-z0-9]+$/),
  currency: z.enum(["NGN", "USD"]),
  amountMinor: z.number().int().positive(),
  referenceNgnMinor: z.number().int().positive(),
  countries: z.array(z.string()),
})
const sessionSchema = z.object({
  accountId: z.uuid(),
  environment: z.enum(["sandbox", "production"]),
  product: productSchema,
  country: z.string().length(2),
  state: z.enum(["preparing", "ready", "uncertain", "failed", "paid"]),
  customerCode: z.string().optional(),
  authorizationDigest: z.string().optional(),
  subscriptionCode: z.string().nullable().default(null),
})
export type WebCheckoutFacts = z.infer<typeof sessionSchema>
export type WebCheckoutProduct = z.infer<typeof productSchema>

function digest(value: string) {
  return createHash("sha256").update(`owner-paystack:${value}`).digest("hex")
}
export function readWebCheckoutFacts(metadata: unknown) {
  const parsed = z.object({ ownerWeb: sessionSchema }).safeParse(metadata)
  return parsed.success ? parsed.data.ownerWeb : null
}

async function assertOwner(
  tx: Prisma.TransactionClient,
  accountId: string,
  actorUserId: string,
  tenantId: string,
  environment: WebCheckoutFacts["environment"],
) {
  // QA businesses may only pay in Paystack Test Mode, never with live money.
  const classifications = environment === "sandbox" ? ["LIVE", "QA"] : ["LIVE"]
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT a."id" FROM "OwnerBillingAccount" a
    JOIN "User" u ON u."id" = a."ownerUserId"
    JOIN "Membership" m ON m."userId" = u."id" AND m."tenantId" = ${tenantId}
    JOIN "Tenant" t ON t."id" = m."tenantId"
      AND t."dataClassification"::text = ANY(${classifications})
    WHERE a."id" = ${accountId} AND a."ownerUserId" = ${actorUserId}
      AND m."role" = 'OWNER' AND m."status" = 'ACTIVE' AND t."isActive" = true
      AND t."qaPurgeStartedAt" IS NULL
    FOR SHARE OF u, m, t`
  if (rows.length !== 1)
    throw new Error(
      "Only the current business owner can pay for this business.",
    )
}

/** Account lock serializes preparations across ALL businesses owned by this payer. */
export async function prepareOwnerWebCheckout(
  db: PrismaClient,
  input: {
    accountId: string
    actorUserId: string
    tenantId: string
    environment: WebCheckoutFacts["environment"]
    product: WebCheckoutProduct
    country: string
    returnUrl: string
  },
) {
  return runOwnerBillingTransaction(db, input.accountId, async (tx) => {
    await assertOwner(
      tx,
      input.accountId,
      input.actorUserId,
      input.tenantId,
      input.environment,
    )
    const current = await tx.ownerBillingSubscription.findUnique({
      where: { accountId: input.accountId },
    })
    if (
      current &&
      ((current.status !== "CANCELLED" &&
        current.currentPeriodEndsAt > new Date()) ||
        (current.provider === "OTHER" && !current.cancelAtPeriodEnd))
    )
      throw new Error(
        "Manage or cancel your existing subscription before starting another payment.",
      )
    const legacyStore = await tx.tenantSubscription.findFirst({
      where: {
        tenantId: input.tenantId,
        provider: { in: ["APP_STORE", "PLAY_STORE"] },
        status: { in: ["ACTIVE", "PAST_DUE"] },
        currentPeriodEndsAt: { gt: new Date() },
      },
      select: { id: true },
    })
    if (legacyStore)
      throw new Error(
        "Manage the existing store subscription before starting a web payment.",
      )
    const pending = await findPendingOwnerWebCheckout(tx, input.accountId)
    if (pending) {
      const facts = readWebCheckoutFacts(pending.metadata)
      if (
        facts?.environment === input.environment &&
        facts.product.productId === input.product.productId &&
        facts.product.amountMinor === input.product.amountMinor &&
        facts.product.currency === input.product.currency &&
        facts.country === input.country &&
        facts.state === "ready" &&
        pending.checkoutUrl
      )
        return { session: pending, facts, dispatch: false }
      throw new Error(
        "A payment is already pending. Check its status before starting another.",
      )
    }
    const plan = RETAIL_OPS_SUBSCRIPTION_PLANS.find(
      (p) => p.id === input.product.planId,
    )
    if (!plan) throw new Error("Unknown subscription plan.")
    const savedPlan = await tx.subscriptionPlan.upsert({
      where: { key: plan.id },
      update: {},
      create: {
        key: plan.id,
        name: plan.name,
        limits: plan.limits,
        isActive: true,
      },
      select: { id: true },
    })
    const id = randomUUID()
    const facts: WebCheckoutFacts = {
      accountId: input.accountId,
      environment: input.environment,
      product: input.product,
      country: input.country,
      state: "preparing",
      subscriptionCode: null,
    }
    const session = await tx.billingCheckoutSession.create({
      data: {
        id,
        tenantId: input.tenantId,
        planId: savedPlan.id,
        provider: "OTHER",
        requestedByUserId: input.actorUserId,
        surface: "dashboard",
        status: "CREATED",
        providerSessionId: `ewasub-${id}`,
        externalId: `owner-web:${id}`,
        successUrl: input.returnUrl,
        metadata: { ownerWeb: facts },
      },
    })
    await saveOwnerWebSession(tx, session)
    return { session, facts, dispatch: true }
  })
}

export async function finishOwnerWebCheckout(
  db: PrismaClient,
  input: {
    id: string
    accountId: string
    state: "ready" | "uncertain" | "failed"
    checkoutUrl?: string
  },
) {
  return runOwnerBillingTransaction(db, input.accountId, async (tx) => {
    const row = await loadOwnerWebSession(tx, input.id)
    if (!row) throw new Error("Unknown checkout.")
    const facts = readWebCheckoutFacts(row.metadata)
    if (!facts || facts.accountId !== input.accountId)
      throw new Error("Checkout binding mismatch.")
    // A webhook may complete before the initialize response arrives.
    if (row.status === "COMPLETED") return row
    if (facts.state !== "preparing")
      throw new Error("Checkout dispatch was already resolved.")
    return updateOwnerWebSession(tx, row, {
      status: input.state === "failed" ? "FAILED" : "PENDING",
      checkoutUrl: input.state === "ready" ? (input.checkoutUrl ?? null) : null,
      metadata: { ownerWeb: { ...facts, state: input.state } },
    })
  })
}

export async function findOwnerWebCheckout(db: PrismaClient, id: string) {
  const session = await loadOwnerWebSession(db, id)
  const facts = readWebCheckoutFacts(session?.metadata)
  return session?.provider === "OTHER" && facts ? { session, facts } : null
}

/** No raw provider payloads, authorization codes, card details or email tokens are retained. */
export async function applyOwnerWebCharge(
  db: PrismaClient,
  input: {
    checkoutId: string
    accountId: string
    reference: string
    customerCode: string
    authorizationDigest: string
    paidAt: Date
    expiresAt: Date
    now: Date
    subscriptionCode?: string
  },
) {
  return runOwnerBillingTransaction(db, input.accountId, async (tx) => {
    const row = await loadOwnerWebSession(tx, input.checkoutId)
    if (!row) throw new Error("Unknown checkout.")
    const facts = readWebCheckoutFacts(row.metadata)
    if (
      !facts ||
      row.provider !== "OTHER" ||
      facts.accountId !== input.accountId ||
      (facts.customerCode && facts.customerCode !== input.customerCode) ||
      (input.subscriptionCode &&
        facts.subscriptionCode !== input.subscriptionCode) ||
      (!input.subscriptionCode && row.providerSessionId !== input.reference) ||
      input.expiresAt <= input.paidAt ||
      input.expiresAt.getTime() > input.paidAt.getTime() + 32 * 86400000
    )
      throw new Error("Payment binding mismatch.")
    const owner = await tx.$queryRaw<{ id: string }[]>`
      SELECT a."id" FROM "OwnerBillingAccount" a JOIN "User" u ON u."id" = a."ownerUserId"
      WHERE a."id" = ${input.accountId} AND a."ownerUserId" = ${row.requestedByUserId} FOR SHARE OF u`
    if (owner.length !== 1)
      throw new Error("Subscription owner is unavailable.")
    const purchaseDigest = digest(row.id)
    const orderDigest = digest(input.reference)
    const refunded = await tx.billingProviderEvent.findUnique({
      where: {
        provider_eventId: {
          provider: "OTHER",
          eventId: `owner-paystack-refund:${orderDigest}`,
        },
      },
    })
    if (refunded)
      throw new Error("This payment was refunded and cannot grant access.")
    const eventId = `owner-paystack-charge:${orderDigest}`
    const existing = await tx.billingProviderEvent.findUnique({
      where: { provider_eventId: { provider: "OTHER", eventId } },
    })
    if (existing) {
      const payload = z
        .object({ accountId: z.string(), checkoutId: z.string() })
        .parse(existing.payload)
      if (
        payload.accountId !== input.accountId ||
        payload.checkoutId !== row.id
      )
        throw new Error("Payment already belongs to another owner.")
      return { applied: false, tenantId: row.tenantId }
    }
    const current = await tx.ownerBillingSubscription.findUnique({
      where: { accountId: input.accountId },
    })
    if (
      current &&
      current.status !== "CANCELLED" &&
      current.currentPeriodEndsAt > input.now &&
      (current.provider !== "OTHER" ||
        current.purchaseDigest !== purchaseDigest)
    )
      throw new Error(
        "An existing subscription already occupies this owner account.",
      )
    const binding = await tx.ownerBillingPurchase.findUnique({
      where: { provider_purchaseDigest: { provider: "OTHER", purchaseDigest } },
    })
    if (
      binding &&
      (binding.accountId !== input.accountId ||
        binding.environment !== facts.environment)
    )
      throw new Error("Payment already belongs to another owner.")
    // An older renewal cannot displace the latest paid period or undo its refund.
    const newer = !binding || input.expiresAt > binding.expiresAt
    if (newer) {
      await tx.ownerBillingPurchase.upsert({
        where: {
          provider_purchaseDigest: { provider: "OTHER", purchaseDigest },
        },
        create: {
          provider: "OTHER",
          purchaseDigest,
          accountId: input.accountId,
          environment: facts.environment,
          productId: facts.product.productId,
          latestOrderDigest: orderDigest,
          expiresAt: input.expiresAt,
          verifiedAt: input.now,
        },
        update: {
          latestOrderDigest: orderDigest,
          expiresAt: input.expiresAt,
          verifiedAt: input.now,
        },
      })
      await tx.ownerBillingSubscription.upsert({
        where: { accountId: input.accountId },
        create: {
          accountId: input.accountId,
          provider: "OTHER",
          environment: facts.environment,
          purchaseDigest,
          planId: facts.product.planId,
          status: "ACTIVE",
          currentPeriodEndsAt: input.expiresAt,
          verifiedAt: input.now,
        },
        update: {
          provider: "OTHER",
          environment: facts.environment,
          purchaseDigest,
          planId: facts.product.planId,
          status: "ACTIVE",
          currentPeriodEndsAt: input.expiresAt,
          verifiedAt: input.now,
          cancelledAt: null,
          cancellationReason: null,
        },
      })
    }
    await tx.billingProviderEvent.create({
      data: {
        provider: "OTHER",
        eventId,
        type: "owner_paystack_charge",
        status: "PROCESSED",
        processedAt: input.now,
        payload: {
          accountId: input.accountId,
          checkoutId: row.id,
          orderDigest,
          amountMinor: facts.product.amountMinor,
          currency: facts.product.currency,
          paidAt: input.paidAt.toISOString(),
          expiresAt: input.expiresAt.toISOString(),
        },
      },
    })
    await updateOwnerWebSession(tx, row, {
      status: "COMPLETED",
      completedAt: row.completedAt ?? input.now,
      checkoutUrl: null,
      metadata: {
        ownerWeb: {
          ...facts,
          state: "paid",
          customerCode: input.customerCode,
          authorizationDigest: input.authorizationDigest,
        },
      },
    })
    return { applied: newer, tenantId: row.tenantId }
  })
}

export async function bindOwnerWebSubscription(
  db: PrismaClient,
  input: {
    customerCode: string
    authorizationDigest: string
    productId: string
    subscriptionCode: string
    environment: WebCheckoutFacts["environment"]
  },
) {
  const matches = await matchingOwnerWebCheckouts(db, input)
  if (matches.length !== 1 || !matches[0])
    throw new Error(
      "The subscription cannot be uniquely matched to a paid checkout.",
    )
  const row = matches[0]
  const facts = sessionSchema.parse(
    z.object({ ownerWeb: sessionSchema }).parse(row.metadata).ownerWeb,
  )
  return runOwnerBillingTransaction(db, facts.accountId, async (tx) => {
    const current = await loadOwnerWebSession(tx, row.id)
    if (!current) throw new Error("Unknown checkout.")
    const fresh = readWebCheckoutFacts(current.metadata)
    if (
      !fresh ||
      (fresh.subscriptionCode &&
        fresh.subscriptionCode !== input.subscriptionCode)
    )
      throw new Error("Checkout already has another subscription.")
    const eventId = `owner-paystack-subscription:${digest(input.subscriptionCode)}`
    const binding = await tx.billingProviderEvent.upsert({
      where: { provider_eventId: { provider: "OTHER", eventId } },
      create: {
        provider: "OTHER",
        eventId,
        type: "owner_paystack_binding",
        status: "PROCESSED",
        processedAt: new Date(),
        payload: { checkoutId: row.id, accountId: facts.accountId },
      },
      update: {},
    })
    const owner = z
      .object({ checkoutId: z.string(), accountId: z.string() })
      .parse(binding.payload)
    if (owner.checkoutId !== row.id || owner.accountId !== facts.accountId)
      throw new Error("Subscription already belongs to another owner.")
    return updateOwnerWebSession(tx, current, {
      metadata: {
        ownerWeb: { ...fresh, subscriptionCode: input.subscriptionCode },
      },
    })
  })
}

export async function findWebChargeCheckout(
  db: PrismaClient,
  reference: string,
) {
  const event = await db.billingProviderEvent.findUnique({
    where: {
      provider_eventId: {
        provider: "OTHER",
        eventId: `owner-paystack-charge:${digest(reference)}`,
      },
    },
  })
  const payload = z.object({ checkoutId: z.string() }).safeParse(event?.payload)
  return payload.success
    ? findOwnerWebCheckout(db, payload.data.checkoutId)
    : null
}

export async function findWebSubscriptionCheckout(
  db: PrismaClient,
  subscriptionCode: string,
) {
  const binding = await db.billingProviderEvent.findUnique({
    where: {
      provider_eventId: {
        provider: "OTHER",
        eventId: `owner-paystack-subscription:${digest(subscriptionCode)}`,
      },
    },
  })
  const payload = z
    .object({ checkoutId: z.string() })
    .safeParse(binding?.payload)
  return payload.success
    ? findOwnerWebCheckout(db, payload.data.checkoutId)
    : null
}

export async function markOwnerWebNonRenewing(
  db: PrismaClient,
  checkoutId: string,
  accountId: string,
) {
  return runOwnerBillingTransaction(db, accountId, (tx) =>
    tx.ownerBillingSubscription.updateMany({
      where: {
        accountId,
        provider: "OTHER",
        purchaseDigest: digest(checkoutId),
      },
      data: { cancelAtPeriodEnd: true },
    }),
  )
}

export async function revokeOwnerWebCharge(
  db: PrismaClient,
  input: {
    checkoutId: string
    accountId: string
    reference: string
    now: Date
  },
) {
  return runOwnerBillingTransaction(db, input.accountId, async (tx) => {
    const eventId = `owner-paystack-charge:${digest(input.reference)}`
    const event = await tx.billingProviderEvent.findUnique({
      where: { provider_eventId: { provider: "OTHER", eventId } },
    })
    if (!event)
      throw new Error("Refund is waiting for the original payment receipt.")
    const payload = z
      .object({ accountId: z.string(), checkoutId: z.string() })
      .passthrough()
      .parse(event.payload)
    if (
      payload.accountId !== input.accountId ||
      payload.checkoutId !== input.checkoutId
    )
      throw new Error("Refund binding mismatch.")
    await tx.billingProviderEvent.update({
      where: { id: event.id },
      data: { payload: { ...payload, refunded: true } },
    })
    const purchaseDigest = digest(input.checkoutId)
    const purchase = await tx.ownerBillingPurchase.findUnique({
      where: { provider_purchaseDigest: { provider: "OTHER", purchaseDigest } },
    })
    if (purchase?.latestOrderDigest === digest(input.reference))
      await tx.ownerBillingSubscription.updateMany({
        where: {
          accountId: input.accountId,
          provider: "OTHER",
          purchaseDigest,
        },
        data: {
          status: "CANCELLED",
          cancelledAt: input.now,
          cancellationReason: "paystack_refund",
          cancelAtPeriodEnd: false,
        },
      })
  })
}

/** A verified refund may arrive before its charge webhook. Keep that fact durable. */
export async function recordWebRefund(
  db: PrismaClient,
  reference: string,
  now: Date,
) {
  const eventId = `owner-paystack-refund:${digest(reference)}`
  await db.billingProviderEvent.upsert({
    where: { provider_eventId: { provider: "OTHER", eventId } },
    create: {
      provider: "OTHER",
      eventId,
      type: "owner_paystack_refund",
      status: "PROCESSED",
      processedAt: now,
      payload: { orderDigest: digest(reference) },
    },
    update: {},
  })
}
