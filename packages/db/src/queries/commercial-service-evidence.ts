import type { Prisma } from "../../generated/prisma/client"
import type { ChargeOnlyPerformanceEvidence } from "./commercial-service-line-policy"

function databaseDate(value: Date | string) {
  if (value instanceof Date) return value
  // Prisma DateTime columns are timestamp without time zone and store UTC.
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`)
}

/** One scoped database snapshot; quantities cross JSON as text, never JS numbers. */
export async function readCommercialServiceEvidence(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; orderLineId: string },
) {
  type Evidence = ChargeOnlyPerformanceEvidence & {
    orderId: string
    snapshot: (NonNullable<ChargeOnlyPerformanceEvidence["snapshot"]> & { offeringName: string }) | null
    order: ChargeOnlyPerformanceEvidence["order"] & {
      tenantId: string; storeId: string; orderNumber: string; currencyCode: string
      store: { tenantId: string }
    }
  }
  const rows = await db.$queryRaw<Array<{ evidence: Evidence }>>`
    /* service-policy-evidence */
    SELECT jsonb_build_object(
      'id', l.id, 'orderId', l."orderId", 'kind', l.kind, 'quantity', l.quantity::text,
      'snapshot', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
        'offeringName', s."offeringName", 'serviceWorkPolicy', s."serviceWorkPolicy",
        'serviceAuthorizationPolicy', s."serviceAuthorizationPolicy") END,
      'serviceJobLines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', j.id) ORDER BY j.id)
        FROM "ServiceJobLine" j WHERE j."commercialOrderLineId" = l.id), '[]'::jsonb),
      'serviceAuthorization', CASE WHEN a.id IS NULL THEN NULL ELSE
        to_jsonb(a) || jsonb_build_object('quantity', a.quantity::text) END,
      'serviceFulfillment', CASE WHEN f.id IS NULL THEN NULL ELSE
        to_jsonb(f) || jsonb_build_object('quantity', f.quantity::text) END,
      'order', jsonb_build_object(
        'id', o.id, 'tenantId', o."tenantId", 'storeId', o."storeId",
        'store', jsonb_build_object('tenantId', st."tenantId"),
        'orderNumber', o."orderNumber", 'status', o.status, 'completedAt', o."completedAt",
        'currencyCode', o."currencyCode", 'amountPaidMinor', o."amountPaidMinor",
        'totalMinor', o."totalMinor", 'paymentStatus', o."paymentStatus", 'deliveryDueAt', o."deliveryDueAt",
        'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id) ORDER BY p.id)
          FROM "CommercialOrderPayment" p WHERE p."orderId" = o.id), '[]'::jsonb),
        'acceptedCommerceQuoteVersion', CASE WHEN qv.id IS NULL THEN NULL ELSE
          jsonb_build_object('quote', jsonb_build_object('sourceType', q."sourceType")) END,
        'prescriptionPickupFulfillment', CASE WHEN pp.id IS NULL THEN NULL ELSE jsonb_build_object('orderId', pp."orderId") END,
        'prescriptionDeliveryAssignment', CASE WHEN pd.id IS NULL THEN NULL ELSE jsonb_build_object('orderId', pd."orderId") END
      )
    ) AS evidence
    FROM "CommercialOrderLine" l
    JOIN "CommercialOrder" o ON o.id = l."orderId"
    JOIN "Store" st ON st.id = o."storeId"
    LEFT JOIN "OfferingSnapshot" s ON s."orderLineId" = l.id
    LEFT JOIN "CommercialServiceAuthorization" a ON a."orderLineId" = l.id
    LEFT JOIN "CommercialServiceFulfillment" f ON f."orderLineId" = l.id
    LEFT JOIN "CommerceQuoteVersion" qv ON qv."acceptedOrderId" = o.id
    LEFT JOIN "CommerceQuote" q ON q.id = qv."quoteId"
    LEFT JOIN "PrescriptionPickupFulfillment" pp ON pp."orderId" = o.id
    LEFT JOIN "PrescriptionDeliveryAssignment" pd ON pd."orderId" = o.id
    WHERE l.id = ${input.orderLineId} AND o."tenantId" = ${input.tenantId}
      AND o."storeId" = ${input.storeId} AND st."tenantId" = ${input.tenantId}
  `
  const line = rows[0]?.evidence
  if (!line) return null
  // SQL JSON timestamps arrive as strings. Policy comparisons require Dates.
  if (line.order.completedAt) line.order.completedAt = databaseDate(line.order.completedAt)
  if (line.order.deliveryDueAt) line.order.deliveryDueAt = databaseDate(line.order.deliveryDueAt)
  if (line.serviceAuthorization)
    line.serviceAuthorization.authorizedAt = databaseDate(line.serviceAuthorization.authorizedAt)
  return line
}
