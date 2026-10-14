import {
  type BusinessActivityView,
  businessActivityMoneySchema,
  presentBusinessPaymentAmount,
  presentBusinessPaymentMethod,
} from "@ewatrade/notifications/business-events"
import { z } from "zod"
import { Prisma } from "../../../generated/prisma/client"
import type { BusinessActivityScope } from "./scope"

const identity = {
  orderId: z.string().min(1).max(160),
  orderNumber: z.string().min(1).max(240),
}
const legacyOrder = z.object(identity).strict()
const legacyPayment = z
  .object({
    ...identity,
    paymentId: z.string().min(1).max(160),
    method: z.string().min(1).max(240),
    amount: businessActivityMoneySchema,
  })
  .strict()
type Presentation = Pick<
  BusinessActivityView,
  "summary" | "detail" | "subject" | "amount" | "statusAtEvent" | "target"
>
export const BUSINESS_ACTIVITY_READ_VERSION = "legacy-orders-payments-v1"

/** Old mutable Order fields are never presented as original amount/customer/status. */
export function presentLegacyBusinessActivity(
  type: string,
  raw: unknown,
  actor: string,
): Presentation | null {
  if (type === "order.recorded") {
    const parsed = legacyOrder.safeParse(raw)
    if (!parsed.success) return null
    const payload = parsed.data
    return {
      summary: `${actor} recorded order ${payload.orderNumber}`,
      detail: "Original order details not captured.",
      subject: {
        kind: "order",
        id: payload.orderId,
        label: payload.orderNumber,
      },
      amount: null,
      statusAtEvent: null,
      target: { kind: "order", id: payload.orderId },
    }
  }
  if (type === "payment.recorded" || type === "payment.refund_recorded") {
    const parsed = legacyPayment.safeParse(raw)
    if (!parsed.success) return null
    const payload = parsed.data
    return {
      summary: `${actor} recorded ${type === "payment.recorded" ? "payment" : "refund"} for ${payload.orderNumber}`,
      detail: presentBusinessPaymentMethod(payload.method),
      subject: {
        kind: "order",
        id: payload.orderId,
        label: payload.orderNumber,
      },
      amount: presentBusinessPaymentAmount(
        payload.amount,
        type === "payment.refund_recorded",
      ),
      statusAtEvent: null,
      target: {
        kind: "payment",
        id: payload.paymentId,
        orderId: payload.orderId,
      },
    }
  }
  return null
}

/**
 * Read-only legacy union, never backfill writes or notification outbox rows.
 * Every caller still applies the shared domain predicate before paging/counts.
 * Physical-event column order comes from the composite table type, so additive
 * schema fields cannot silently shift union columns.
 */
export function businessActivitySources(
  scope: BusinessActivityScope,
  window?: { from: string; to: string; snapshotAt: string },
) {
  const orderWindow = window
    ? Prisma.sql`AND o."createdAt">=${new Date(window.from)} AND o."createdAt"<${new Date(window.to)} AND o."createdAt"<=${new Date(window.snapshotAt)}`
    : Prisma.empty
  const paymentWindow = window
    ? Prisma.sql`AND p."recordedAt">=${new Date(window.from)} AND p."recordedAt"<${new Date(window.to)} AND p."createdAt"<=${new Date(window.snapshotAt)}`
    : Prisma.empty
  const recordedCutoff = window
    ? Prisma.sql`AND recorded."recordedAt"<=${new Date(window.snapshotAt)}`
    : Prisma.empty
  return Prisma.sql`WITH "activitySources" AS (
    SELECT e.* FROM "BusinessActivityEvent" e WHERE e."tenantId"=${scope.tenantId}
    UNION ALL
    SELECT legacy.* FROM "CommercialOrder" o
      LEFT JOIN "Membership" m ON m."tenantId"=o."tenantId" AND m."userId"=o."createdByUserId"
      CROSS JOIN LATERAL jsonb_populate_record(NULL::"BusinessActivityEvent", jsonb_build_object(
        'id','legacy:order:'||encode(sha256(convert_to(o.id,'UTF8')),'hex'),'tenantId',o."tenantId",'storeId',o."storeId",'type','order.recorded','category','orders','schemaVersion',0,
        'sourceKind','commercial_order','sourceId',o.id,'sourceAction','created','actorKind','staff','originChannel','unknown',
        'actorUserId',o."createdByUserId",'actorMembershipId',m.id,'occurredAt',o."createdAt",'recordedAt',o."createdAt",'recordingOrigin','legacy_fact',
        'payload',jsonb_build_object('orderId',o.id,'orderNumber',o."orderNumber")
      )) legacy
      WHERE o."tenantId"=${scope.tenantId} ${orderWindow}
        AND NOT EXISTS (SELECT 1 FROM "BusinessActivityEvent" recorded WHERE recorded."tenantId"=o."tenantId" AND recorded.type='order.recorded'
          ${recordedCutoff} AND (recorded."sourceKind"='commercial_order' AND recorded."sourceId"=o.id OR recorded.payload->>'orderId'=o.id))
    UNION ALL
    SELECT legacy.* FROM "CommercialOrderPayment" p
      JOIN "CommercialOrder" o ON o.id=p."orderId" AND o."tenantId"=p."tenantId" AND o."storeId"=p."storeId"
      LEFT JOIN "Membership" m ON m."tenantId"=p."tenantId" AND m."userId"=p."recordedByUserId"
      CROSS JOIN LATERAL jsonb_populate_record(NULL::"BusinessActivityEvent", jsonb_build_object(
        'id','legacy:payment:'||encode(sha256(convert_to(p.id,'UTF8')),'hex'),'tenantId',p."tenantId",'storeId',p."storeId",'type',CASE WHEN p.type='REFUND' THEN 'payment.refund_recorded' ELSE 'payment.recorded' END,
        'category','payments','schemaVersion',0,'sourceKind','commercial_order_payment','sourceId',p.id,'sourceAction','recorded','actorKind','staff','originChannel','unknown',
        'actorUserId',p."recordedByUserId",'actorMembershipId',m.id,'occurredAt',p."recordedAt",'recordedAt',p."createdAt",'recordingOrigin','legacy_fact',
        'amountMinor',p."amountMinor",'currencyCode',o."currencyCode",'payload',jsonb_build_object('orderId',o.id,'orderNumber',o."orderNumber",'paymentId',p.id,'method',p.method::text,
          'amount',jsonb_build_object('minor',p."amountMinor"::text,'currencyCode',o."currencyCode"))
      )) legacy
      WHERE p."tenantId"=${scope.tenantId} ${paymentWindow}
        AND NOT EXISTS (SELECT 1 FROM "BusinessActivityEvent" recorded WHERE recorded."tenantId"=p."tenantId"
          AND recorded.type=CASE WHEN p.type='REFUND' THEN 'payment.refund_recorded' ELSE 'payment.recorded' END
          ${recordedCutoff} AND (recorded."sourceKind"='commercial_order_payment' AND recorded."sourceId"=p.id OR recorded.payload->>'paymentId'=p.id))
  )`
}
