import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_ACTIONS,
  SERVICE_COMMERCE_CAPABILITIES,
  SERVICE_COMMERCE_CHANNEL_ORIGINS,
  SERVICE_COMMERCE_FULFILLMENT_OPTIONS,
  SERVICE_COMMERCE_READINESS_STATES,
  SERVICE_COMMERCE_SOURCE_KINDS,
  adaptServiceCommerceSource,
  createServiceCommerceSourceRegistry,
  serviceCommerceCapabilityStateSchema,
  serviceCommerceSourceRefSchema,
} from "."

describe("Service Commerce interoperability contracts", () => {
  test("keeps the source boundary limited to the three approved authoritative aggregates", () => {
    expect(SERVICE_COMMERCE_SOURCE_KINDS).toEqual([
      "service",
      "prescription",
      "commerce_inquiry",
    ])
    expect(
      serviceCommerceSourceRefSchema.parse({
        id: "service-request-1",
        kind: "service",
      }),
    ).toEqual({ id: "service-request-1", kind: "service" })
    expect(
      serviceCommerceSourceRefSchema.parse({
        id: "commerce-inquiry-1",
        kind: "commerce_inquiry",
      }),
    ).toEqual({ id: "commerce-inquiry-1", kind: "commerce_inquiry" })
    expect(
      serviceCommerceSourceRefSchema.safeParse({
        id: "generic-request-1",
        kind: "customer_request",
      }).success,
    ).toBe(false)
  })

  test("exposes the approved channel, capability, action, readiness and fulfilment vocabulary", () => {
    expect(SERVICE_COMMERCE_CHANNEL_ORIGINS).toEqual([
      "web",
      "staff",
      "whatsapp",
    ])
    expect(SERVICE_COMMERCE_CAPABILITIES).toEqual([
      "intake",
      "quote",
      "booking",
      "payment",
      "pickup",
      "delivery",
      "service_completion",
      "whatsapp",
      "progressive_catalog",
    ])
    expect(SERVICE_COMMERCE_READINESS_STATES).toEqual([
      "available",
      "setup_required",
      "restricted",
      "unavailable",
    ])
    expect(SERVICE_COMMERCE_ACTIONS).toEqual([
      "request_quote",
      "book",
      "pay_now",
      "pick_up",
      "delivery",
      "talk_to_staff",
      "reschedule",
      "cancel",
    ])
    expect(SERVICE_COMMERCE_FULFILLMENT_OPTIONS).toEqual([
      "none",
      "service",
      "pickup",
      "delivery",
    ])
    expect(
      serviceCommerceCapabilityStateSchema.safeParse({
        capability: "delivery",
        readiness: "available",
      }).success,
    ).toBe(true)
  })

  test("adapts each source without merging its aggregate model", () => {
    const serviceAdapter = {
      getId: (request: { id: string; status: "SUBMITTED" }) => request.id,
      kind: "service" as const,
      project: (request: { id: string; status: "SUBMITTED" }) => ({
        currentStatus: request.status,
      }),
    }
    const prescriptionAdapter = {
      getId: (request: { id: string; status: "PHARMACIST_REVIEW" }) =>
        request.id,
      kind: "prescription" as const,
      project: (request: { id: string; status: "PHARMACIST_REVIEW" }) => ({
        currentStatus: request.status,
      }),
    }
    const commerceInquiryAdapter = {
      getId: (inquiry: { id: string; state: "READY_TO_QUOTE" }) => inquiry.id,
      kind: "commerce_inquiry" as const,
      project: (inquiry: { id: string; state: "READY_TO_QUOTE" }) => ({
        currentState: inquiry.state,
      }),
    }
    const registry = createServiceCommerceSourceRegistry({
      commerceInquiry: commerceInquiryAdapter,
      prescription: prescriptionAdapter,
      service: serviceAdapter,
    })

    expect(
      adaptServiceCommerceSource(registry.service, {
        id: "service-request-1",
        status: "SUBMITTED",
      }),
    ).toEqual({
      projection: { currentStatus: "SUBMITTED" },
      source: { id: "service-request-1", kind: "service" },
    })
    expect(
      adaptServiceCommerceSource(registry.prescription, {
        id: "prescription-request-1",
        status: "PHARMACIST_REVIEW",
      }),
    ).toEqual({
      projection: { currentStatus: "PHARMACIST_REVIEW" },
      source: { id: "prescription-request-1", kind: "prescription" },
    })
    expect(
      adaptServiceCommerceSource(registry.commerceInquiry, {
        id: "commerce-inquiry-1",
        state: "READY_TO_QUOTE",
      }),
    ).toEqual({
      projection: { currentState: "READY_TO_QUOTE" },
      source: { id: "commerce-inquiry-1", kind: "commerce_inquiry" },
    })
  })

  test("fails closed when an adapter emits an invalid source reference", () => {
    expect(() =>
      adaptServiceCommerceSource(
        {
          getId: () => "   ",
          kind: "service",
          project: () => ({ currentStatus: "SUBMITTED" as const }),
        },
        { id: "source-with-invalid-reference" },
      ),
    ).toThrow()
  })
})
