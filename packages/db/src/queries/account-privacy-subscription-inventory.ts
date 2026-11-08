import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { ownerCoveragePrivacyWhere } from "./account-privacy-subscription"

export type SubscriptionInventoryClient = Pick<
  PrismaClient,
  | "membership"
  | "ownerBillingAccount"
  | "ownerBillingPurchase"
  | "ownerBillingSubscription"
  | "ownerBusinessCoverage"
  | "billingCheckoutSession"
  | "storeSubscriptionPurchase"
  | "tenantSubscription"
  | "billingInvoice"
  | "billingProviderEvent"
  | "playRefundReviewCase"
  | "playRefundReviewResponse"
>

export function subscriptionPrivacyDigest(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString()
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, canonical(x)]),
      )
    return v
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
}
export const SUBSCRIPTION_PRIVACY_FAMILIES = [
  "OWNER_ACCOUNT",
  "OWNER_PURCHASE",
  "OWNER_SUBSCRIPTION",
  "OWNER_COVERAGE",
  "CHECKOUT",
  "PROVIDER_EVENT",
  "REFUND_CASE",
  "REFUND_RESPONSE",
  "LEGACY_PURCHASE",
  "LEGACY_SUBSCRIPTION",
  "LEGACY_INVOICE",
] as const
export type SubscriptionPrivacyFamily =
  (typeof SUBSCRIPTION_PRIVACY_FAMILIES)[number]

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}
const MAX_ROWS = 500
const bounded = { take: MAX_ROWS + 1, orderBy: { id: "asc" as const } }

/** Restricted identifiers/counts/digests only. Never return provider payloads, URLs or custody tokens. */
export async function getAccountPrivacySubscriptionInventory(
  db: SubscriptionInventoryClient,
  subjectId: string,
) {
  const memberships = await db.membership.findMany({
    where: { userId: subjectId },
    select: { tenantId: true, status: true },
    ...bounded,
  })
  const tenantIds = [...new Set(memberships.map((row) => row.tenantId))].sort()
  const accounts = await db.ownerBillingAccount.findMany({
    where: { ownerUserId: subjectId },
    ...bounded,
  })
  const accountIds = accounts.map((row) => row.id)
  const purchases = await db.ownerBillingPurchase.findMany({
    where: { accountId: { in: accountIds } },
    ...bounded,
  })
  const subscriptions = await db.ownerBillingSubscription.findMany({
    where: { accountId: { in: accountIds } },
    ...bounded,
  })
  const coverage = await db.ownerBusinessCoverage.findMany({
    where: {
      OR: [
        { accountId: { in: accountIds } },
        ownerCoveragePrivacyWhere(subjectId, tenantIds),
      ],
    },
    ...bounded,
  })
  const checkouts = await db.billingCheckoutSession.findMany({
    where: {
      OR: [{ requestedByUserId: subjectId }, { tenantId: { in: tenantIds } }],
    },
    ...bounded,
  })
  const legacyPurchases = await db.storeSubscriptionPurchase.findMany({
    where: { tenantId: { in: tenantIds } },
    ...bounded,
  })
  const legacySubscriptions = await db.tenantSubscription.findMany({
    where: { tenantId: { in: tenantIds }, provider: { not: "NONE" } },
    ...bounded,
  })
  const invoices = await db.billingInvoice.findMany({
    where: { tenantId: { in: tenantIds } },
    ...bounded,
  })
  const eventScope = [
    { tenantId: { in: tenantIds } },
    { payload: { path: ["session", "requestedByUserId"], equals: subjectId } },
    ...accountIds.flatMap((id) => [
      { payload: { path: ["accountId"], equals: id } },
      { metadata: { path: ["ownerWeb", "accountId"], equals: id } },
      { payload: { path: ["ownerWeb", "accountId"], equals: id } },
    ]),
  ]
  const initialEvents = await db.billingProviderEvent.findMany({
    where: { OR: eventScope },
    ...bounded,
  })
  const orderDigests = new Set(
    purchases.flatMap((row) =>
      row.latestOrderDigest ? [row.latestOrderDigest] : [],
    ),
  )
  const checkoutIds = new Set(checkouts.map((row) => row.id))
  for (const row of initialEvents) {
    const payload = object(row.payload)
    const session = object(payload.session)
    if (typeof session.id === "string") checkoutIds.add(session.id)
    if (typeof session.providerSessionId === "string")
      orderDigests.add(
        createHash("sha256")
          .update(`owner-paystack:${session.providerSessionId}`)
          .digest("hex"),
      )
    if (typeof payload.orderDigest === "string")
      orderDigests.add(payload.orderDigest)
    if (typeof payload.latestOrderDigest === "string")
      orderDigests.add(payload.latestOrderDigest)
  }
  const accountDigests = accountIds.map((id) =>
    createHash("sha256").update(`play-review-account:${id}`).digest("hex"),
  )
  // Resolve tenant-less charge/binding/refund records even without the compatibility checkout.
  const linkedEvents = await db.billingProviderEvent.findMany({
    where: {
      OR: [
        ...eventScope,
        ...[...checkoutIds].map((id) => ({
          payload: { path: ["checkoutId"], equals: id },
        })),
        ...[...orderDigests].map((id) => ({
          payload: { path: ["orderDigest"], equals: id },
        })),
        {
          eventId: {
            in: [...orderDigests].map((id) => `owner-paystack-refund:${id}`),
          },
        },
      ],
    },
    ...bounded,
  })
  const events = [
    ...new Map(
      [...initialEvents, ...linkedEvents].map((row) => [row.id, row]),
    ).values(),
  ].sort((a, b) => a.id.localeCompare(b.id))
  const refundCases = await db.playRefundReviewCase.findMany({
    where: {
      OR: [
        { tenantId: { in: tenantIds } },
        { accountDigest: { in: accountDigests } },
        { orderDigest: { in: [...orderDigests] } },
        { response: { is: { actorUserId: subjectId } } },
      ],
    },
    ...bounded,
  })
  const responses = await db.playRefundReviewResponse.findMany({
    where: {
      OR: [
        { actorUserId: subjectId },
        { caseId: { in: refundCases.map((row) => row.id) } },
      ],
    },
    ...bounded,
  })
  const groups: [SubscriptionPrivacyFamily, { id: string }[]][] = [
    ["OWNER_ACCOUNT", accounts],
    ["OWNER_PURCHASE", purchases],
    ["OWNER_SUBSCRIPTION", subscriptions],
    ["OWNER_COVERAGE", coverage],
    ["CHECKOUT", checkouts],
    ["PROVIDER_EVENT", events],
    ["REFUND_CASE", refundCases],
    ["REFUND_RESPONSE", responses],
    ["LEGACY_PURCHASE", legacyPurchases],
    ["LEGACY_SUBSCRIPTION", legacySubscriptions],
    ["LEGACY_INVOICE", invoices],
  ]
  const blockers: string[] = []
  if (
    memberships.length > MAX_ROWS ||
    groups.some(([, rows]) => rows.length > MAX_ROWS)
  )
    blockers.push("INVENTORY_LIMIT")
  if (memberships.some((row) => row.status !== "REMOVED"))
    blockers.push("MEMBERSHIP_REVOCATION_REQUIRED")
  if (
    [...purchases, ...subscriptions].some(
      (row) => !["sandbox", "production"].includes(row.environment),
    )
  )
    blockers.push("UNSUPPORTED_BILLING_ENVIRONMENT")
  if (coverage.some((row) => !accountIds.includes(row.accountId)))
    blockers.push("SHARED_OWNER_REVIEW_REQUIRED")
  if (legacyPurchases.length || legacySubscriptions.length || invoices.length)
    blockers.push("LEGACY_CONTROLLER_REVIEW_REQUIRED")
  if (
    checkouts.some(
      (row) =>
        row.requestedByUserId !== subjectId ||
        !accountIds.includes(
          String(object(object(row.metadata).ownerWeb).accountId),
        ),
    )
  )
    blockers.push("LEGACY_CONTROLLER_REVIEW_REQUIRED")
  if (checkouts.some((row) => ["CREATED", "PENDING"].includes(row.status)))
    blockers.push("CHECKOUT_RECONCILIATION_REQUIRED")
  if (
    checkouts.some((row) => row.checkoutUrl || row.successUrl || row.cancelUrl)
  )
    blockers.push("CHECKOUT_LINK_MINIMIZATION_REQUIRED")
  for (const row of events) {
    const payload = object(row.payload)
    const facts = object(object(row.metadata).ownerWeb)
    if (row.status !== "PROCESSED")
      blockers.push("PROVIDER_RECONCILIATION_REQUIRED")
    const ownAccount = accountIds.includes(
      String(
        payload.accountId ??
          facts.accountId ??
          object(payload.ownerWeb).accountId,
      ),
    )
    const ownRefund =
      row.type === "owner_paystack_refund" &&
      orderDigests.has(String(payload.orderDigest))
    if (!ownAccount && !ownRefund) blockers.push("UNRESOLVED_PROVIDER_SCOPE")
    if (
      ![
        "owner_subscription_updated",
        "owner_paystack_checkout",
        "owner_paystack_charge",
        "owner_paystack_binding",
        "owner_paystack_refund",
      ].includes(row.type)
    )
      blockers.push("UNSUPPORTED_PROVIDER_RECORD")
    if (
      row.type === "owner_paystack_checkout" &&
      (!["sandbox", "production"].includes(String(facts.environment)) ||
        object(payload.session).requestedByUserId !== subjectId ||
        (object(payload.ownerWeb).accountId !== undefined &&
          object(payload.ownerWeb).accountId !== facts.accountId))
    )
      blockers.push("UNRESOLVED_PROVIDER_SCOPE")
    if (
      row.type === "owner_paystack_checkout" &&
      !["paid", "failed"].includes(String(facts.state))
    )
      blockers.push("CHECKOUT_RECONCILIATION_REQUIRED")
    if (
      row.type === "owner_paystack_checkout" &&
      object(payload.session).checkoutUrl
    )
      blockers.push("CHECKOUT_LINK_MINIMIZATION_REQUIRED")
  }
  if (
    refundCases.some(
      (row) =>
        (row.accountDigest !== null &&
          !accountDigests.includes(row.accountDigest)) ||
        (!accountDigests.includes(row.accountDigest ?? "") &&
          !orderDigests.has(row.orderDigest)),
    )
  )
    blockers.push("SHARED_REFUND_REVIEW_REQUIRED")
  if (
    responses.some((row) =>
      ["CLAIMED", "OUTCOME_UNKNOWN", "UNCERTAIN"].includes(row.status),
    )
  )
    blockers.push("REFUND_RECONCILIATION_REQUIRED")
  const records = groups.flatMap(([family, rows]) =>
    rows.map((row) => ({
      family,
      id: row.id,
      sourceDigest: subscriptionPrivacyDigest(row),
    })),
  )
  return {
    records,
    counts: Object.fromEntries(
      groups.map(([family, rows]) => [family, rows.length]),
    ),
    blockers: [...new Set(blockers)].sort(),
    inventoryDigest: subscriptionPrivacyDigest({
      subjectId,
      tenantIds,
      records,
    }),
  }
}
