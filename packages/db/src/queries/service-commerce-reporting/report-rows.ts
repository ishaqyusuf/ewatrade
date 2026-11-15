import { SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT as LIMIT } from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"

/**
 * Every source the Requests and quotes report summarizes, read in ONE
 * statement: each source is a bounded `json_agg` sub-select with the same
 * columns, filters and row limit the report used to read with 28 separate
 * `findMany` calls. Timestamps come back as UTC wall times and are revived to
 * `Date`, so the summaries (and the assistant contract) are unchanged.
 */

type Row = Record<string, unknown>

export type ServiceCommerceReportRows = {
  tenant: { currencyCode: string; timezone: string | null }
  stores: Array<{ id: string; name: string }>
  serviceRequests: Array<{
    channelOrigin: string
    convertedAt: Date | null
    requestedAt: Date
    storeId: string
  }>
  prescriptionReceived: Array<{
    effectiveAt: Date
    storeId: string
    request: { source: string }
  }>
  inquiries: Array<{
    channelOrigin: string
    convertedAt: Date | null
    createdAt: Date
    storeId: string
  }>
  quoteVersions: Array<{
    acceptedAt: Date | null
    declinedAt: Date | null
    issuedAt: Date | null
    quote: { sourceType: string; storeId: string }
    status: string
  }>
  payments: Array<{
    amountMinor: number
    recordedAt: Date
    storeId: string
    type: string
  }>
  bookings: Array<{
    arrivedAt: Date | null
    completedAt: Date | null
    confirmedAt: Date | null
    serviceStartedAt: Date | null
    storeId: string
  }>
  pickupEvents: Array<{
    effectiveAt: Date
    fulfillment: { storeId: string }
    type: string
  }>
  deliveryEvents: Array<{
    assignment: { storeId: string }
    effectiveAt: Date
    type: string
  }>
  serviceEvents: Array<{
    effectiveAt: Date
    serviceJob: { storeId: string }
    toStatus: string | null
    type: string
  }>
  sourceLinks: Array<{
    createdAsPrivateDraft: boolean
    createdAt: Date
    resolutionCapturedAt: Date | null
    sourceType: string
    verifiedObservationId: string | null
  }>
  attestations: Array<{ createdAt: Date; type: string }>
  pricePromotions: Array<{
    createdAt: Date
    previousPriceMinor: number | null
    priceMinor: number
  }>
  quoteOverrideLines: Array<{
    catalogPriceEvaluationAt: Date | null
    catalogPriceOverride: boolean
  }>
  graduationEvents: Array<{ effectiveAt: Date; type: string }>
  mediaEvents: Array<{ effectiveAt: Date; lifecycle: string; type: string }>
  attachments: Array<{ createdAt: Date; lifecycle: string }>
  observations: Array<{ lifecycle: string; verifiedAt: Date }>
  notificationAttempts: Array<{
    attemptNumber: number
    completedAt: Date | null
    failureCode: string | null
    startedAt: Date
    status: string
  }>
  notificationReceipts: Array<{ occurredAt: Date; status: string }>
  legacyNotificationAttempts: Array<{
    attemptedAt: Date
    completedAt: Date | null
    status: string
  }>
  actionRecoveries: Array<{ executedAt: Date; outcome: string }>
  usage: Array<{
    billingOwnerSnapshot: string | null
    bspCostMinor: number | null
    connectionId: string | null
    currencyCode: string | null
    deliveryCostMinor: number | null
    eventType: string
    metaCostMinor: number | null
    messageCategory: string | null
    numberCostMinor: number | null
    occurredAt: Date
    paymentProviderFeeMinor: number | null
    platformChargeMinor: number | null
    revenueMinor: number | null
    recipientMarket: string | null
    subscriptionChargeMinor: number | null
    taxMinor: number | null
  }>
  prescriptionUsage: Array<{
    amounts: Prisma.JsonValue
    eventType: string
    occurredAt: Date
  }>
  profileAuditEvents: Array<{ effectiveAt: Date; type: string }>
  connectionAuditEvents: Array<{ effectiveAt: Date; type: string }>
  routingAlerts: Array<{ createdAt: Date; resolvedAt: Date | null }>
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/

/** Timestamp columns are UTC wall times without a zone in JSON. */
function reviveDates(value: unknown, key = ""): unknown {
  if (key === "amounts") return value
  if (Array.isArray(value)) return value.map((entry) => reviveDates(entry))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Row).map(([name, entry]) => [
        name,
        reviveDates(entry, name),
      ]),
    )
  if (typeof value === "string" && key.endsWith("At") && TIMESTAMP.test(value))
    return new Date(`${value}Z`)
  if (typeof value === "string" && key.endsWith("At")) return new Date(value)
  return value
}

export async function readServiceCommerceReportRows(
  db: Pick<PrismaClient, "$queryRaw">,
  input: { tenantId: string; storeId?: string | null; start: Date; end: Date },
): Promise<ServiceCommerceReportRows> {
  const tenant = input.tenantId
  const store = input.storeId ?? null
  const start = Prisma.sql`(${input.start}::timestamptz AT TIME ZONE 'UTC')`
  const end = Prisma.sql`(${input.end}::timestamptz AT TIME ZONE 'UTC')`
  const scoped = (alias: string) =>
    Prisma.sql`${Prisma.raw(alias)}."tenantId" = ${tenant} AND (${store}::text IS NULL OR ${Prisma.raw(alias)}."storeId" = ${store})`
  const within = (column: string) =>
    Prisma.sql`(${Prisma.raw(column)} >= ${start} AND ${Prisma.raw(column)} < ${end})`
  const list = (name: string, select: Prisma.Sql) =>
    Prisma.sql`COALESCE((SELECT json_agg(x) FROM (${select} LIMIT ${LIMIT}) x), '[]'::json) AS ${Prisma.raw(`"${name}"`)}`

  const rows = await db.$queryRaw<
    Array<Record<string, unknown>>
  >(Prisma.sql`SELECT
    (SELECT json_build_object('currencyCode', t."currencyCode", 'timezone', t."timezone") FROM "Tenant" t WHERE t."id" = ${tenant}) AS "tenant",
    ${list("stores", Prisma.sql`SELECT s."id", s."name" FROM "Store" s WHERE s."tenantId" = ${tenant} AND (${store}::text IS NULL OR s."id" = ${store}) ORDER BY s."id"`)},
    ${list("serviceRequests", Prisma.sql`SELECT r."channelOrigin", r."convertedAt", r."requestedAt", r."storeId" FROM "ServiceRequest" r WHERE ${scoped("r")} AND ${within('r."requestedAt"')}`)},
    ${list("prescriptionReceived", Prisma.sql`SELECT e."effectiveAt", e."storeId", json_build_object('source', p."source") AS "request" FROM "PrescriptionRequestAuditEvent" e JOIN "PrescriptionRequest" p ON p."id" = e."requestId" WHERE ${scoped("e")} AND ${within('e."effectiveAt"')} AND e."type" = 'RECEIVED'`)},
    ${list("inquiries", Prisma.sql`SELECT i."channelOrigin", i."convertedAt", i."createdAt", i."storeId" FROM "CommerceInquiry" i WHERE ${scoped("i")} AND ${within('i."createdAt"')}`)},
    ${list("quoteVersions", Prisma.sql`SELECT v."acceptedAt", v."declinedAt", v."issuedAt", json_build_object('sourceType', q."sourceType", 'storeId', q."storeId") AS "quote", v."status" FROM "CommerceQuoteVersion" v JOIN "CommerceQuote" q ON q."id" = v."quoteId" WHERE (${within('v."acceptedAt"')} OR ${within('v."declinedAt"')} OR ${within('v."issuedAt"')}) AND ${scoped("q")}`)},
    ${list("payments", Prisma.sql`SELECT p."amountMinor", p."recordedAt", p."storeId", p."type" FROM "CommercialOrderPayment" p WHERE ${scoped("p")} AND ${within('p."recordedAt"')} AND p."method" <> 'CUSTOMER_CREDIT'`)},
    ${list("bookings", Prisma.sql`SELECT b."arrivedAt", b."completedAt", b."confirmedAt", b."serviceStartedAt", b."storeId" FROM "ServiceBooking" b WHERE ${scoped("b")} AND (${within('b."arrivedAt"')} OR ${within('b."completedAt"')} OR ${within('b."confirmedAt"')} OR ${within('b."serviceStartedAt"')})`)},
    ${list("pickupEvents", Prisma.sql`SELECT e."effectiveAt", json_build_object('storeId', f."storeId") AS "fulfillment", e."type" FROM "PrescriptionPickupEvent" e JOIN "PrescriptionPickupFulfillment" f ON f."id" = e."fulfillmentId" WHERE ${within('e."effectiveAt"')} AND ${scoped("f")} AND e."type" = 'HANDED_OFF'`)},
    ${list("deliveryEvents", Prisma.sql`SELECT json_build_object('storeId', a."storeId") AS "assignment", e."effectiveAt", e."type" FROM "PrescriptionDeliveryEvent" e JOIN "PrescriptionDeliveryAssignment" a ON a."id" = e."assignmentId" WHERE ${scoped("a")} AND ${within('e."effectiveAt"')} AND e."type" = 'DELIVERED'`)},
    ${list("serviceEvents", Prisma.sql`SELECT e."effectiveAt", json_build_object('storeId', j."storeId") AS "serviceJob", e."toStatus", e."type" FROM "ServiceWorkEvent" e JOIN "ServiceJob" j ON j."id" = e."serviceJobId" WHERE ${within('e."effectiveAt"')} AND e."tenantId" = ${tenant} AND (${store}::text IS NULL OR j."storeId" = ${store}) AND e."toStatus" = 'COMPLETED'`)},
    ${list("sourceLinks", Prisma.sql`SELECT l."createdAsPrivateDraft", l."createdAt", l."resolutionCapturedAt", l."sourceType", l."verifiedObservationId" FROM "CatalogSourceLineLink" l WHERE ${scoped("l")} AND (${within('l."resolutionCapturedAt"')} OR (${within('l."createdAt"')} AND l."resolutionCapturedAt" IS NULL))`)},
    ${list("attestations", Prisma.sql`SELECT c."createdAt", c."type" FROM "CatalogAvailabilityAttestation" c WHERE ${scoped("c")} AND ${within('c."createdAt"')}`)},
    ${list("pricePromotions", Prisma.sql`SELECT c."createdAt", c."previousPriceMinor", c."priceMinor" FROM "CatalogPricePromotion" c WHERE ${scoped("c")} AND ${within('c."createdAt"')}`)},
    ${list("quoteOverrideLines", Prisma.sql`SELECT l."catalogPriceEvaluationAt", l."catalogPriceOverride" FROM "CommerceQuoteLine" l JOIN "CommerceQuoteVersion" v ON v."id" = l."quoteVersionId" JOIN "CommerceQuote" q ON q."id" = v."quoteId" WHERE (${within('l."catalogPriceEvaluationAt"')} OR (l."catalogPriceEvaluationAt" IS NULL AND ${within('v."issuedAt"')})) AND ${scoped("q")}`)},
    ${list("graduationEvents", Prisma.sql`SELECT a."effectiveAt", a."type" FROM "ServiceCommerceStoreAuditEvent" a WHERE ${scoped("a")} AND ${within('a."effectiveAt"')} AND a."type" = 'CATALOG_GRADUATED'`)},
    ${list("mediaEvents", Prisma.sql`SELECT m."effectiveAt", m."lifecycle", m."type" FROM "ServiceCommerceMediaAuditEvent" m WHERE ${scoped("m")} AND ${within('m."effectiveAt"')}`)},
    ${list("attachments", Prisma.sql`SELECT m."createdAt", m."lifecycle" FROM "ServiceCommerceSourceAttachment" m WHERE ${scoped("m")} AND ${within('m."createdAt"')}`)},
    ${list("observations", Prisma.sql`SELECT m."lifecycle", m."verifiedAt" FROM "ServiceCommerceVerifiedObservation" m WHERE ${scoped("m")} AND ${within('m."verifiedAt"')}`)},
    ${list("notificationAttempts", Prisma.sql`SELECT n."attemptNumber", n."completedAt", n."failureCode", n."startedAt", n."status" FROM "ServiceCommerceCustomerNotificationAttempt" n WHERE ${scoped("n")} AND ${within('n."startedAt"')}`)},
    ${list("notificationReceipts", Prisma.sql`SELECT n."occurredAt", n."status" FROM "ServiceCommerceCustomerNotificationReceipt" n WHERE ${scoped("n")} AND ${within('n."occurredAt"')}`)},
    ${list("legacyNotificationAttempts", Prisma.sql`SELECT d."attemptedAt", d."completedAt", d."status" FROM "ServiceDeliveryAttempt" d JOIN "ServiceNotificationIntent" i ON i."id" = d."notificationIntentId" WHERE ${scoped("i")} AND (${within('d."completedAt"')} OR (${within('d."attemptedAt"')} AND d."completedAt" IS NULL))`)},
    ${list("actionRecoveries", Prisma.sql`SELECT x."executedAt", x."outcome" FROM "ServiceCommerceCustomerActionExecution" x WHERE ${scoped("x")} AND ${within('x."executedAt"')} AND x."outcome" = 'RECOVERY'`)},
    ${list("usage", Prisma.sql`SELECT u."billingOwnerSnapshot", u."bspCostMinor", u."connectionId", u."currencyCode", u."deliveryCostMinor", u."eventType", u."metaCostMinor", u."messageCategory", u."numberCostMinor", u."occurredAt", u."paymentProviderFeeMinor", u."platformChargeMinor", u."revenueMinor", u."recipientMarket", u."subscriptionChargeMinor", u."taxMinor" FROM "ServiceCommerceUsageEvent" u WHERE ${scoped("u")} AND ${within('u."occurredAt"')}`)},
    ${list("prescriptionUsage", Prisma.sql`SELECT u."amounts", u."eventType", u."occurredAt" FROM "PrescriptionUsageEvent" u WHERE ${scoped("u")} AND ${within('u."occurredAt"')}`)},
    ${list("profileAuditEvents", Prisma.sql`SELECT a."effectiveAt", a."type" FROM "ServiceCommerceStoreAuditEvent" a WHERE ${scoped("a")} AND ${within('a."effectiveAt"')} AND a."type" IN ('ACTIVATED', 'DEACTIVATED', 'SUSPENDED')`)},
    ${list("connectionAuditEvents", Prisma.sql`SELECT w."effectiveAt", w."type" FROM "WhatsAppConnectionAuditEvent" w WHERE ${scoped("w")} AND ${within('w."effectiveAt"')} AND w."type" IN ('readiness_passed', 'readiness_failed')`)},
    ${list("routingAlerts", Prisma.sql`SELECT w."createdAt", w."resolvedAt" FROM "WhatsAppRoutingAlert" w WHERE ${store}::text IS NULL AND w."tenantId" = ${tenant} AND (${within('w."createdAt"')} OR ${within('w."resolvedAt"')})`)}
  `)
  const row = rows[0] ?? {}
  if (!row.tenant) throw new Error("No Tenant found")
  return reviveDates(row) as ServiceCommerceReportRows
}
