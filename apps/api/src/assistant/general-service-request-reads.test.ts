import { expect, test } from "bun:test"
import type {
  ServiceRequestOriginal,
  ServiceRequestPage,
} from "@ewatrade/db/service-request-read"
import {
  generalServiceRequestOriginalAnswer,
  serviceRequestModelOriginal,
  serviceRequestModelPage,
} from "./general-service-request-reads"

const record: ServiceRequestOriginal = {
  actorUserId: "actor-1",
  tenantId: "business-1",
  storeId: "store-1",
  asOf: "2026-10-15T12:00:00.000Z",
  request: {
    id: "request-1",
    revision: 3,
    status: "SUBMITTED",
    createdAt: "2026-10-14T12:00:00.000Z",
    updatedAt: "2026-10-14T12:00:00.000Z",
    requestedAt: null,
    details: "Repair the saved seam; do not replace the material.",
    staffResponse: null,
    customer: {
      name: "Amina",
      phone: "+234 811 111 4321",
      email: "private-contact@example.invalid",
    },
    channelOrigin: "WEB",
    contactOptIn: true,
    consentVersion: "original-consent-v1",
  },
  form: { id: "form-1", label: "Repairs" },
  lines: [
    {
      id: "line-1",
      offeringId: "offering-1",
      offeringName: "Original saved repair",
      variantName: "Original saved variant",
      quantity: "9007199254740993.000001",
      details: "Keep this exact saved line note.",
      optionSelections: [{ group: "Material", value: "Cotton" }],
    },
  ],
  currentQuote: {
    quoteId: "quote-1",
    versionId: "version-2",
    version: 2,
    status: "DRAFT",
    currencyCode: "NGN",
    totalMinor: 12345,
    expiresAt: null,
    acceptedOrderId: null,
  },
}

test("a maximum saved customer name stays full in the original but fits the saved answer with its status", () => {
  const original = {
    ...record,
    request: {
      ...record.request,
      customer: { ...record.request.customer, name: "N".repeat(160) },
    },
  }
  const answer = generalServiceRequestOriginalAnswer(original, "Original Store")
  expect(answer.value).toHaveLength(160)
  expect(answer.value.endsWith("… · SUBMITTED")).toBe(true)
  expect(answer.target).toEqual({
    kind: "service_request",
    requestId: original.request.id,
    origin: { tenantId: original.tenantId, storeId: original.storeId },
  })
  expect(serviceRequestModelOriginal(original).request.customer.name).toBe(
    original.request.customer.name,
  )
  expect(original.request.customer.name).toHaveLength(160)
  expect(generalServiceRequestOriginalAnswer(record, "Store").value).toBe(
    "Amina · SUBMITTED",
  )
})

test("model original retains full saved request facts and exact decimal without structured contact or future private fields", () => {
  const quote = record.currentQuote
  const phone = record.request.customer.phone
  const email = record.request.customer.email
  if (!quote || !phone || !email)
    throw Error("Expected the complete saved fixture")
  const future = {
    ...record,
    publicToken: "SECRET_PUBLIC_TOKEN",
    request: {
      ...record.request,
      providerEventId: "SECRET_PROVIDER_ID",
      customer: { ...record.request.customer, privateToken: "SECRET_CONTACT" },
    },
    lines: record.lines.map((line) => ({
      ...line,
      currentPriceMinor: 999999,
      privateMedia: "SECRET_MEDIA",
    })),
    currentQuote: { ...quote, acceptanceToken: "SECRET_ACCEPT" },
  }
  const result = serviceRequestModelOriginal(future)
  const text = JSON.stringify(result)
  expect(result.request.customer).toEqual({
    name: "Amina",
    phoneLast4: "4321",
    hasEmail: true,
  })
  expect(result.request.details).toBe(record.request.details)
  expect(result.lines[0]).toEqual(record.lines[0])
  expect(result.currentQuote).toEqual(record.currentQuote)
  expect(result.request.contactOptIn).toBe(true)
  for (const secret of ["SECRET_", phone, email, "currentPriceMinor"])
    expect(text).not.toContain(secret)
})

test("model discovery preserves authoritative complete-filter total and cursor, with bounded row identity only", () => {
  const page: ServiceRequestPage = {
    actorUserId: record.actorUserId,
    tenantId: record.tenantId,
    storeId: record.storeId,
    asOf: record.asOf,
    coverage: "service_requests_only",
    totalMatching: "42",
    nextCursor: "opaque-bound-cursor",
    items: [
      {
        id: record.request.id,
        revision: record.request.revision,
        status: record.request.status,
        customerName: record.request.customer.name,
        requestedAt: record.request.requestedAt,
        createdAt: record.request.createdAt,
        form: record.form,
        lineCount: 1,
        originalTarget: {
          kind: "service_request",
          requestId: record.request.id,
          origin: { tenantId: record.tenantId, storeId: record.storeId },
        },
      },
    ],
  }
  const future = {
    ...page,
    providerToken: "SECRET_PROVIDER",
    items: page.items.map((item) => ({
      ...item,
      customerPhone: "SECRET_PHONE",
      details: "SECRET_DETAILS",
      lines: record.lines,
    })),
  }
  const result = serviceRequestModelPage(future)
  expect(result.totalMatching).toBe("42")
  expect(result.nextCursor).toBe("opaque-bound-cursor")
  expect(result.coverage).toBe("service_requests_only")
  expect(result.items).toHaveLength(1)
  expect(result.items[0]?.id).toBe(record.request.id)
  expect(JSON.stringify(result)).not.toContain("SECRET_")
  expect(JSON.stringify(result)).not.toContain("originalTarget")
  expect(JSON.stringify(result)).not.toContain("offeringId")
  expect(
    serviceRequestModelOriginal({ ...record, currentQuote: null }).currentQuote,
  ).toBeNull()
})
