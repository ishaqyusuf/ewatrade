/**
 * F01 canonical collection contract. A collection intent asks a customer to
 * pay an amount of one source record's current balance through one provider
 * reference, for a bounded time. These pure decisions are shared by the
 * command that opens an intent, the manual payment command and provider
 * settlement, so manual and online receipts can never both settle the same
 * balance. Callers read every snapshot inside the same authorized transaction;
 * persistence and provider calls live with them.
 *
 * Owner policy (12 Oct 2026): partial links are allowed; links live 10 minutes
 * to 72 hours; anyone who may accept payment for the order may create one;
 * provider money that cannot settle is refunded or kept as customer credit.
 */

export const collectionSourceKinds = ["commercial_order"] as const
export type CollectionSourceKind = (typeof collectionSourceKinds)[number]

/** Lifecycle shared with `HostedPaymentStatus`. */
export type CollectionIntentStatus =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
/** Open intents may still be paid at the provider. */
export const openCollectionStatuses: ReadonlySet<CollectionIntentStatus> =
  new Set(["CREATED", "PENDING"])

export const collectionLimits = {
  maxLifetimeMs: 72 * 60 * 60 * 1000,
  minLifetimeMs: 10 * 60 * 1000,
}

export type CollectionSourceSnapshot = {
  kind: CollectionSourceKind
  id: string
  tenantId: string
  storeId: string
  /** The order's customer, if any; customer credit needs one. */
  customerId: string | null
  currencyCode: string
  totalMinor: number
  /** Effective amount already collected (payments minus refunds). */
  paidMinor: number
  status: "open" | "cancelled" | "closed"
}

export type CollectionIntentSnapshot = {
  id: string
  tenantId: string
  sourceKind: CollectionSourceKind
  sourceId: string
  provider: string
  providerReference: string
  amountMinor: number
  currencyCode: string
  status: CollectionIntentStatus
  expiresAt: Date | null
}

/**
 * Who asked for the link. Staff must hold the canonical permission to accept
 * payment for this order (`canAcceptPayment`, resolved by the caller with the
 * same check as recording a payment); a customer link only pays its own order
 * in full and never chooses an amount.
 */
export type CollectionActor =
  | {
      kind: "staff"
      userId: string
      storeIds: readonly string[] | "all"
      canAcceptPayment: boolean
    }
  | { kind: "customer_link"; sourceId: string }

export type OpenCollectionRequest = {
  source: CollectionSourceSnapshot
  openIntents: readonly CollectionIntentSnapshot[]
  actor: CollectionActor
  amountMinor: number
  currencyCode: string
  provider: string
  expiresAt: Date
  now: Date
}

export type CollectionRefusal = {
  ok: false
  code:
    | "SOURCE_UNAVAILABLE"
    | "OUT_OF_SCOPE"
    | "FORBIDDEN"
    | "INVALID_AMOUNT"
    | "AMOUNT_MISMATCH"
    | "CURRENCY_MISMATCH"
    | "ALREADY_SETTLED"
    | "OPEN_INTENT_EXISTS"
    | "INVALID_EXPIRY"
    | "INVALID_TIME"
    | "NO_CUSTOMER"
    | "SOURCE_MISMATCH"
  message: string
}

const balanceOf = (source: CollectionSourceSnapshot) =>
  Math.max(0, source.totalMinor - source.paidMinor)
const validTime = (value: Date) =>
  value instanceof Date && Number.isFinite(value.getTime())
const positiveMinor = (value: number) =>
  Number.isSafeInteger(value) && value > 0
const isOpen = (intent: CollectionIntentSnapshot, now: Date) =>
  openCollectionStatuses.has(intent.status) &&
  (!intent.expiresAt || intent.expiresAt.getTime() > now.getTime())
const refuse = (
  code: CollectionRefusal["code"],
  message: string,
): CollectionRefusal => ({ ok: false, code, message })
const invalidTime = refuse(
  "INVALID_TIME",
  "The payment time could not be read. Try again.",
)

/** Whether a new intent may be opened, and for exactly which amount. */
export function decideOpenCollection(
  request: OpenCollectionRequest,
):
  | { ok: true; amountMinor: number; currencyCode: string; expiresAt: Date }
  | CollectionRefusal {
  const { source, actor } = request
  if (!validTime(request.now)) return invalidTime
  if (source.status !== "open")
    return refuse(
      "SOURCE_UNAVAILABLE",
      "This order can no longer take payment.",
    )
  if (
    (actor.kind === "staff" &&
      actor.storeIds !== "all" &&
      !actor.storeIds.includes(source.storeId)) ||
    (actor.kind === "customer_link" && actor.sourceId !== source.id)
  )
    return refuse(
      "OUT_OF_SCOPE",
      "Payment links are limited to orders you can access.",
    )
  if (actor.kind === "staff" && !actor.canAcceptPayment)
    return refuse(
      "FORBIDDEN",
      "Only people who can accept payment for this order can send a payment link.",
    )
  const balance = balanceOf(source)
  if (balance === 0)
    return refuse("ALREADY_SETTLED", "This order has no balance to collect.")
  if (request.currencyCode.toUpperCase() !== source.currencyCode.toUpperCase())
    return refuse(
      "CURRENCY_MISMATCH",
      `Collect in the order currency (${source.currencyCode}).`,
    )
  if (!positiveMinor(request.amountMinor))
    return refuse("INVALID_AMOUNT", "Enter an amount greater than zero.")
  if (request.amountMinor > balance)
    return refuse(
      "AMOUNT_MISMATCH",
      "A payment link cannot ask for more than the outstanding balance.",
    )
  // Staff may ask for part of the balance; a customer link pays it in full.
  if (actor.kind === "customer_link" && request.amountMinor !== balance)
    return refuse(
      "AMOUNT_MISMATCH",
      "Pay the order's full outstanding balance.",
    )
  if (request.openIntents.some((intent) => isOpen(intent, request.now)))
    return refuse(
      "OPEN_INTENT_EXISTS",
      "A payment link is already open for this order. Let it expire or cancel it first.",
    )
  if (!validTime(request.expiresAt))
    return refuse("INVALID_EXPIRY", "Choose when the payment link expires.")
  const lifetime = request.expiresAt.getTime() - request.now.getTime()
  if (
    lifetime < collectionLimits.minLifetimeMs ||
    lifetime > collectionLimits.maxLifetimeMs
  )
    return refuse(
      "INVALID_EXPIRY",
      "Payment links expire between 10 minutes and 72 hours.",
    )
  return {
    ok: true,
    amountMinor: request.amountMinor,
    currencyCode: source.currencyCode,
    expiresAt: request.expiresAt,
  }
}

/**
 * Manual receipts (cash, transfer) against a source with an open online
 * intent would let the same balance settle twice, so they wait until the
 * intent is cancelled, expired or failed.
 */
export function decideManualReceipt(input: {
  source: CollectionSourceSnapshot
  openIntents: readonly CollectionIntentSnapshot[]
  amountMinor: number
  now: Date
}): { ok: true } | CollectionRefusal {
  if (!validTime(input.now)) return invalidTime
  if (!positiveMinor(input.amountMinor))
    return refuse("INVALID_AMOUNT", "Enter an amount greater than zero.")
  if (input.openIntents.some((intent) => isOpen(intent, input.now)))
    return refuse(
      "OPEN_INTENT_EXISTS",
      "An online payment link for this order is still open. Cancel it or wait for it to expire before recording a manual payment.",
    )
  if (input.amountMinor > balanceOf(input.source))
    return refuse(
      "AMOUNT_MISMATCH",
      "Payment cannot exceed the outstanding balance.",
    )
  return { ok: true }
}

export type ProviderSettlementEvent = {
  provider: string
  providerReference: string
  amountMinor: number
  /** Null when the provider omitted it; never assumed. */
  currencyCode: string | null
  status: "paid" | "failed"
}
export type HoldReason =
  | "source_mismatch"
  | "provider_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "source_already_settled"
  | "source_unavailable"

/**
 * What a verified provider event may do. Money the provider reports as
 * received is never dropped: anything that cannot settle the source becomes a
 * durable reconciliation item, resolved later by `decideHeldResolution`, and a
 * late success after expiry is retained.
 */
export function decideProviderSettlement(input: {
  intent: CollectionIntentSnapshot
  source: CollectionSourceSnapshot
  event: ProviderSettlementEvent
}):
  | { action: "settle"; amountMinor: number }
  | { action: "already_settled" }
  | { action: "mark_failed" }
  | { action: "ignore_failure"; reason: "intent_not_open" }
  | { action: "hold_for_reconciliation"; reason: HoldReason } {
  const { intent, source, event } = input
  if (
    event.provider !== intent.provider ||
    event.providerReference !== intent.providerReference
  )
    return { action: "hold_for_reconciliation", reason: "provider_mismatch" }
  // Matching balances are not identity: the intent must name this source.
  if (
    intent.tenantId !== source.tenantId ||
    intent.sourceKind !== source.kind ||
    intent.sourceId !== source.id
  )
    return { action: "hold_for_reconciliation", reason: "source_mismatch" }
  if (event.status === "failed")
    return openCollectionStatuses.has(intent.status)
      ? { action: "mark_failed" }
      : { action: "ignore_failure", reason: "intent_not_open" }
  if (
    intent.status === "PAID" ||
    intent.status === "PARTIALLY_REFUNDED" ||
    intent.status === "REFUNDED"
  )
    return { action: "already_settled" }
  if (
    !event.currencyCode ||
    event.currencyCode.toUpperCase() !== intent.currencyCode.toUpperCase() ||
    // The order's current currency must agree too; otherwise hold the money.
    intent.currencyCode.toUpperCase() !== source.currencyCode.toUpperCase()
  )
    return { action: "hold_for_reconciliation", reason: "currency_mismatch" }
  if (
    !positiveMinor(event.amountMinor) ||
    event.amountMinor !== intent.amountMinor
  )
    return { action: "hold_for_reconciliation", reason: "amount_mismatch" }
  if (source.status === "cancelled")
    return { action: "hold_for_reconciliation", reason: "source_unavailable" }
  // Includes a late success after EXPIRED/FAILED: settle only if it still fits.
  if (event.amountMinor > balanceOf(source))
    return {
      action: "hold_for_reconciliation",
      reason: "source_already_settled",
    }
  return { action: "settle", amountMinor: event.amountMinor }
}

export const manualRefundMethods = [
  "cash",
  "bank_transfer",
  "pos",
  "other",
] as const
export type ManualRefundMethod = (typeof manualRefundMethods)[number]

/**
 * The reviewed outcome for held provider money: give it back manually (cash,
 * bank transfer, …; owner decision 12 Oct 2026 — no provider refund) or keep it
 * as the order customer's credit. Refunds use the existing money-back
 * authority; credit uses payment-acceptance authority. Nothing is automatic.
 */
export function decideHeldResolution(input: {
  /**
   * The held receipt with the identity of its original intent; callers load
   * it and the source in the same authorized transaction.
   */
  held: {
    intentId: string
    tenantId: string
    sourceKind: CollectionSourceKind
    sourceId: string
    amountMinor: number
    currencyCode: string
    resolved: boolean
  }
  source: CollectionSourceSnapshot
  choice:
    | { kind: "manual_refund"; method: ManualRefundMethod }
    | { kind: "customer_credit" }
  actor: { canAcceptPayment: boolean; canRefund: boolean }
}):
  | {
      ok: true
      effect: "manual_refund"
      method: ManualRefundMethod
      amountMinor: number
    }
  | {
      ok: true
      effect: "customer_credit"
      customerId: string
      amountMinor: number
      currencyCode: string
    }
  | CollectionRefusal {
  const { held, source, choice, actor } = input
  // Credit or refund only for the order the money was originally paid to.
  if (
    held.tenantId !== source.tenantId ||
    held.sourceKind !== source.kind ||
    held.sourceId !== source.id
  )
    return refuse(
      "SOURCE_MISMATCH",
      "This held payment belongs to a different order.",
    )
  if (held.resolved)
    return refuse("ALREADY_SETTLED", "This held payment was already resolved.")
  if (!positiveMinor(held.amountMinor))
    return refuse("INVALID_AMOUNT", "The held payment amount is invalid.")
  if (choice.kind === "manual_refund") {
    if (!actor.canRefund)
      return refuse("FORBIDDEN", "Owners and managers decide money back.")
    if (!manualRefundMethods.includes(choice.method))
      return refuse("INVALID_AMOUNT", "Choose how the money was given back.")
    return {
      ok: true,
      effect: "manual_refund",
      method: choice.method,
      amountMinor: held.amountMinor,
    }
  }
  if (!actor.canAcceptPayment)
    return refuse(
      "FORBIDDEN",
      "Only people who can accept payment for this order can keep it as credit.",
    )
  if (!source.customerId)
    return refuse(
      "NO_CUSTOMER",
      "This order has no customer to hold credit for. Add the customer or refund the payment.",
    )
  if (held.currencyCode.toUpperCase() !== source.currencyCode.toUpperCase())
    return refuse(
      "CURRENCY_MISMATCH",
      "Credit must be kept in the order currency; refund this payment instead.",
    )
  return {
    ok: true,
    effect: "customer_credit",
    customerId: source.customerId,
    amountMinor: held.amountMinor,
    currencyCode: source.currencyCode,
  }
}
