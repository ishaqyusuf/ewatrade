import { createHash } from "node:crypto"
import {
  type CollectionActor,
  type CollectionIntentSnapshot,
  type CollectionSourceSnapshot,
  decideOpenCollection,
  decideProviderSettlement,
} from "@ewatrade/utils/collection-intent"
import {
  HostedPaymentStatus,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import {
  effectiveCommercialAmountPaid,
  recordCommercialOrderPaymentInTransaction,
} from "./commercial-payments"

/**
 * F01 canonical collection commands over the shared rules in
 * `@ewatrade/utils/collection-intent`. Not registered with any router, tool or
 * job yet: privacy inventory and acceptance come first.
 */
export class CollectionError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "FORBIDDEN"
      | "BAD_REQUEST"
      | "IDEMPOTENCY_MISMATCH",
    message: string,
  ) {
    super(message)
    this.name = "CollectionError"
  }
}

const openStatuses = [HostedPaymentStatus.CREATED, HostedPaymentStatus.PENDING]
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
/** Stable, provider-safe reference fixed when the intent is created. */
export function collectionReference(tenantId: string, clientIntentId: string) {
  return `col_${digest({ tenantId, clientIntentId }).slice(0, 32)}`
}

/** Locks the order row and reads it as the shared source snapshot. */
async function lockOrderSource(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; orderId: string },
): Promise<CollectionSourceSnapshot | null> {
  await tx.$queryRaw`SELECT id FROM "CommercialOrder" WHERE id = ${input.orderId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  const order = await tx.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      customerId: true,
      currencyCode: true,
      totalMinor: true,
      amountPaidMinor: true,
      paymentStatus: true,
      status: true,
      _count: { select: { payments: true } },
    },
  })
  if (!order) return null
  return {
    kind: "commercial_order",
    id: order.id,
    tenantId: order.tenantId,
    storeId: order.storeId,
    customerId: order.customerId,
    currencyCode: order.currencyCode,
    totalMinor: order.totalMinor,
    paidMinor: effectiveCommercialAmountPaid({
      amountPaidMinor: order.amountPaidMinor,
      paymentCount: order._count.payments,
      paymentStatus: order.paymentStatus,
      totalMinor: order.totalMinor,
    }),
    status: ["CANCELLED", "REFUNDED"].includes(order.status)
      ? "cancelled"
      : order.status === "DRAFT"
        ? "closed"
        : "open",
  }
}

type IntentRow = Awaited<
  ReturnType<Prisma.TransactionClient["collectionIntent"]["findFirstOrThrow"]>
>
function intentSnapshot(row: IntentRow): CollectionIntentSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceKind: "commercial_order",
    sourceId: row.orderId,
    provider: row.provider,
    providerReference: row.providerReference,
    amountMinor: row.amountMinor,
    currencyCode: row.currencyCode,
    status: row.status,
    expiresAt: row.expiresAt,
  }
}

/**
 * Opens a payment link intent for part or all of an order's balance. Exact
 * retries return the saved intent; one open intent per order is enforced
 * under the order lock.
 */
export async function openCollectionIntentInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    orderId: string
    clientIntentId: string
    provider: string
    amountMinor: number
    currencyCode: string
    expiresAt: Date
    now: Date
    actor: CollectionActor
  },
) {
  const existing = await tx.collectionIntent.findUnique({
    where: {
      tenantId_clientIntentId: {
        tenantId: input.tenantId,
        clientIntentId: input.clientIntentId,
      },
    },
  })
  if (existing) {
    if (
      existing.orderId !== input.orderId ||
      existing.amountMinor !== input.amountMinor ||
      existing.provider !== input.provider ||
      existing.currencyCode !== input.currencyCode.toUpperCase()
    )
      throw new CollectionError(
        "IDEMPOTENCY_MISMATCH",
        "This payment link identity was already used with different details.",
      )
    return { intent: existing, replay: true }
  }
  const source = await lockOrderSource(tx, input)
  if (!source) throw new CollectionError("NOT_FOUND", "Order not found.")
  const openIntents = await tx.collectionIntent.findMany({
    where: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      status: { in: openStatuses },
    },
  })
  const decision = decideOpenCollection({
    source,
    openIntents: openIntents.map(intentSnapshot),
    actor: input.actor,
    amountMinor: input.amountMinor,
    currencyCode: input.currencyCode,
    provider: input.provider,
    expiresAt: input.expiresAt,
    now: input.now,
  })
  if (!decision.ok)
    throw new CollectionError(
      decision.code === "FORBIDDEN" || decision.code === "OUT_OF_SCOPE"
        ? "FORBIDDEN"
        : decision.code === "OPEN_INTENT_EXISTS" ||
            decision.code === "ALREADY_SETTLED" ||
            decision.code === "SOURCE_UNAVAILABLE"
          ? "CONFLICT"
          : "BAD_REQUEST",
      decision.message,
    )
  const intent = await tx.collectionIntent.create({
    data: {
      tenantId: input.tenantId,
      storeId: source.storeId,
      sourceKind: "commercial_order",
      orderId: source.id,
      clientIntentId: input.clientIntentId,
      provider: input.provider,
      providerReference: collectionReference(
        input.tenantId,
        input.clientIntentId,
      ),
      amountMinor: decision.amountMinor,
      currencyCode: decision.currencyCode,
      expiresAt: decision.expiresAt,
      createdByUserId: input.actor.kind === "staff" ? input.actor.userId : null,
    },
  })
  return { intent, replay: false }
}

/**
 * Closes an open link so a manual payment can be taken. A provider success
 * that still arrives later is kept and settles only if it fits the balance.
 */
export async function cancelCollectionIntentInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; intentId: string; actorUserId: string },
) {
  const intent = await tx.collectionIntent.findFirst({
    where: { id: input.intentId, tenantId: input.tenantId },
  })
  if (!intent) throw new CollectionError("NOT_FOUND", "Payment link not found.")
  if (intent.cancelledAt) return intent
  if (!openStatuses.includes(intent.status as (typeof openStatuses)[number]))
    throw new CollectionError(
      "CONFLICT",
      "Only an open payment link can be cancelled.",
    )
  await lockOrderSource(tx, {
    tenantId: intent.tenantId,
    orderId: intent.orderId,
  })
  const changed = await tx.collectionIntent.updateMany({
    where: { id: intent.id, status: { in: openStatuses } },
    data: {
      status: HostedPaymentStatus.EXPIRED,
      cancelledAt: new Date(),
      cancelledByUserId: input.actorUserId,
    },
  })
  if (changed.count !== 1)
    throw new CollectionError(
      "CONFLICT",
      "The payment link changed. Refresh it.",
    )
  return tx.collectionIntent.findFirstOrThrow({ where: { id: intent.id } })
}

/**
 * Step 1 of provider settlement, in its own transaction: the received event is
 * stored before any decision, so a refused settlement never erases money the
 * provider reports. Replays with the same payload return the stored event.
 */
type ProviderEventInput = {
  provider: string
  providerEventId: string
  providerReference: string
  status: "paid" | "failed"
  amountMinor: number
  currencyCode: string | null
}
export async function recordCollectionProviderEvent(
  db: PrismaClient,
  input: ProviderEventInput,
) {
  return db.$transaction((tx) =>
    recordCollectionProviderEventInTransaction(tx, input),
  )
}
/** Callers must commit this before applying the event. */
export async function recordCollectionProviderEventInTransaction(
  tx: Prisma.TransactionClient,
  input: ProviderEventInput,
) {
  const payloadHash = digest(input)
  const previous = await tx.collectionProviderEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: input.provider,
        providerEventId: input.providerEventId,
      },
    },
  })
  if (previous) {
    if (previous.payloadHash !== payloadHash)
      throw new CollectionError(
        "IDEMPOTENCY_MISMATCH",
        "A provider event identity was reused with different details.",
      )
    return { event: previous, replay: true }
  }
  const intent = await tx.collectionIntent.findUnique({
    where: { providerReference: input.providerReference },
    select: { id: true },
  })
  const event = await tx.collectionProviderEvent.create({
    data: {
      intentId: intent?.id ?? null,
      provider: input.provider,
      providerEventId: input.providerEventId,
      payloadHash,
      eventType: input.status,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode?.toUpperCase() ?? null,
      // No intent: kept as evidence of received money, never applied.
      ...(intent
        ? {}
        : {
            outcome: "REJECTED" as const,
            holdReason: "unknown_reference",
            processedAt: new Date(),
          }),
    },
  })
  return { event, replay: false }
}

/**
 * Step 2, in a separate transaction under the order lock: settle the order
 * once, record a failure, or hold the money for a reviewed refund or credit.
 */
export async function applyCollectionProviderEvent(
  db: PrismaClient,
  input: { eventId: string },
) {
  return db.$transaction(
    (tx) => applyCollectionProviderEventInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function applyCollectionProviderEventInTransaction(
  tx: Prisma.TransactionClient,
  input: { eventId: string },
) {
  const event = await tx.collectionProviderEvent.findUnique({
    where: { id: input.eventId },
  })
  if (!event) throw new CollectionError("NOT_FOUND", "Event not found.")
  if (event.outcome !== "RECEIVED" || !event.intentId)
    return { outcome: event.outcome, replay: true }
  const row = await tx.collectionIntent.findUniqueOrThrow({
    where: { id: event.intentId },
  })
  const source = await lockOrderSource(tx, {
    tenantId: row.tenantId,
    orderId: row.orderId,
  })
  // Reread after the order lock; a concurrent apply may have finished.
  const locked = await tx.collectionIntent.findUniqueOrThrow({
    where: { id: row.id },
  })
  const current = await tx.collectionProviderEvent.findUniqueOrThrow({
    where: { id: event.id },
  })
  if (current.outcome !== "RECEIVED")
    return { outcome: current.outcome, replay: true }
  const processedAt = new Date()
  const decision = source
    ? decideProviderSettlement({
        intent: intentSnapshot(locked),
        source,
        event: {
          provider: event.provider,
          providerReference: locked.providerReference,
          amountMinor: event.amountMinor,
          currencyCode: event.currencyCode,
          status: event.eventType === "failed" ? "failed" : "paid",
        },
      })
    : {
        action: "hold_for_reconciliation" as const,
        reason: "source_unavailable" as const,
      }
  if (decision.action === "settle") {
    await recordCommercialOrderPaymentInTransaction(
      tx,
      {
        actorUserId: "payment-provider",
        amountMinor: decision.amountMinor,
        clientPaymentId: `collection:${event.id}`,
        method: "card",
        orderId: locked.orderId,
        reference: locked.providerReference,
        tenantId: locked.tenantId,
      },
      undefined,
      { collectionSettlementIntentId: locked.id },
    )
    await tx.collectionIntent.update({
      where: { id: locked.id },
      data: { status: HostedPaymentStatus.PAID, paidAt: processedAt },
    })
    await tx.collectionProviderEvent.update({
      where: { id: event.id },
      data: { outcome: "APPLIED", processedAt },
    })
    return { outcome: "APPLIED" as const, replay: false }
  }
  if (decision.action === "mark_failed") {
    await tx.collectionIntent.update({
      where: { id: locked.id },
      data: { status: HostedPaymentStatus.FAILED, failedAt: processedAt },
    })
    await tx.collectionProviderEvent.update({
      where: { id: event.id },
      data: { outcome: "APPLIED", processedAt },
    })
    return { outcome: "APPLIED" as const, replay: false }
  }
  if (
    decision.action === "already_settled" ||
    decision.action === "ignore_failure"
  ) {
    await tx.collectionProviderEvent.update({
      where: { id: event.id },
      data: { outcome: "IGNORED", processedAt },
    })
    return { outcome: "IGNORED" as const, replay: false }
  }
  // Money arrived but cannot settle this order: keep it for review.
  if (event.eventType === "paid") {
    await tx.collectionHold.create({
      data: {
        tenantId: locked.tenantId,
        intentId: locked.id,
        orderId: locked.orderId,
        eventId: event.id,
        amountMinor: event.amountMinor,
        // Never assumed: an unknown currency can only be refunded.
        currencyCode: event.currencyCode ?? "UNKNOWN",
        reason: decision.reason,
      },
    })
    if (openStatuses.includes(locked.status as (typeof openStatuses)[number]))
      await tx.collectionIntent.update({
        where: { id: locked.id },
        data: { status: HostedPaymentStatus.PAID, paidAt: processedAt },
      })
  }
  await tx.collectionProviderEvent.update({
    where: { id: event.id },
    data: { outcome: "HELD", holdReason: decision.reason, processedAt },
  })
  return { outcome: "HELD" as const, replay: false, reason: decision.reason }
}
