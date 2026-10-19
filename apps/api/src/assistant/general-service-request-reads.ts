import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import type {
  ServiceRequestOriginal,
  ServiceRequestPage,
} from "@ewatrade/db/service-request-read"

/** Compact card text is bounded independently of the full protected original. */
export function generalServiceRequestOriginalAnswer(
  record: ServiceRequestOriginal,
  scopeName: string,
) {
  const name = record.request.customer.name.trim() || "Service Request"
  const suffix = ` · ${record.request.status}`
  const value =
    name.length + suffix.length <= 160
      ? `${name}${suffix}`
      : `${name.slice(0, 159 - suffix.length)}…${suffix}`
  return generalAnswerSchema.parse({
    id: `service_request_original_${crypto.randomUUID()}`,
    title: "Original generic Service Request",
    value,
    scope: scopeName,
    asOf: record.asOf,
    detail:
      "Saved request snapshots and current canonical Quote version were checked. This read does not change or accept the request, release a Quote or send anything.",
    target: {
      kind: "service_request",
      requestId: record.request.id,
      origin: { tenantId: record.tenantId, storeId: record.storeId },
    },
  })
}

/** Explicit model allowlists; protected originals alone expose saved full contacts. */
export function serviceRequestModelPage(page: ServiceRequestPage) {
  return {
    actorUserId: page.actorUserId,
    tenantId: page.tenantId,
    storeId: page.storeId,
    asOf: page.asOf,
    coverage: page.coverage,
    totalMatching: page.totalMatching,
    nextCursor: page.nextCursor,
    items: page.items.map((item) => ({
      id: item.id,
      revision: item.revision,
      status: item.status,
      customerName: item.customerName,
      requestedAt: item.requestedAt,
      createdAt: item.createdAt,
      form: { id: item.form.id, label: item.form.label },
      lineCount: item.lineCount,
    })),
  }
}

export function serviceRequestModelOriginal(record: ServiceRequestOriginal) {
  const phone = record.request.customer.phone?.replace(/\D/g, "")
  return {
    actorUserId: record.actorUserId,
    tenantId: record.tenantId,
    storeId: record.storeId,
    asOf: record.asOf,
    request: {
      id: record.request.id,
      revision: record.request.revision,
      status: record.request.status,
      createdAt: record.request.createdAt,
      updatedAt: record.request.updatedAt,
      requestedAt: record.request.requestedAt,
      details: record.request.details,
      staffResponse: record.request.staffResponse,
      customer: {
        name: record.request.customer.name,
        phoneLast4: phone?.slice(-4) || null,
        hasEmail: Boolean(record.request.customer.email),
      },
      channelOrigin: record.request.channelOrigin,
      contactOptIn: record.request.contactOptIn,
      consentVersion: record.request.consentVersion,
    },
    form: { id: record.form.id, label: record.form.label },
    lines: record.lines.map((line) => ({
      id: line.id,
      offeringId: line.offeringId,
      offeringName: line.offeringName,
      variantName: line.variantName,
      quantity: line.quantity,
      details: line.details,
      optionSelections: line.optionSelections.map((option) => ({
        group: option.group,
        value: option.value,
      })),
    })),
    currentQuote: record.currentQuote
      ? {
          quoteId: record.currentQuote.quoteId,
          versionId: record.currentQuote.versionId,
          version: record.currentQuote.version,
          status: record.currentQuote.status,
          currencyCode: record.currentQuote.currencyCode,
          totalMinor: record.currentQuote.totalMinor,
          expiresAt: record.currentQuote.expiresAt,
          acceptedOrderId: record.currentQuote.acceptedOrderId,
        }
      : null,
  }
}
