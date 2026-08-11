import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_ACTIONS,
  SERVICE_COMMERCE_CAPABILITIES,
  SERVICE_COMMERCE_CHANNEL_ORIGINS,
  SERVICE_COMMERCE_EXACT_PRODUCT_COMMANDS,
  SERVICE_COMMERCE_FULFILLMENT_OPTIONS,
  SERVICE_COMMERCE_PRODUCT_DEMAND_REASONS,
  SERVICE_COMMERCE_READINESS_STATES,
  SERVICE_COMMERCE_REQUEST_STATES,
  SERVICE_COMMERCE_SOURCE_KINDS,
  adaptServiceCommerceSource,
  createServiceCommerceSourceRegistry,
  deriveServiceCommerceReadiness,
  getServiceCommerceActivationBlockers,
  getServiceCommerceRuntimeActivationBlockers,
  serviceCommerceCapabilityStateSchema,
  serviceCommerceCustomerRequestProjectionSchema,
  serviceCommerceProductDemandSchema,
  serviceCommerceProfileConfigurationSchema,
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

  test("keeps one normalized lifecycle without creating a universal aggregate", () => {
    expect(SERVICE_COMMERCE_REQUEST_STATES).toEqual([
      "received",
      "needs_clarification",
      "ready_to_quote",
      "quoted",
      "converted",
      "declined",
      "withdrawn",
      "expired",
    ])
    expect(
      serviceCommerceCustomerRequestProjectionSchema.parse({
        allowedCommands: ["request_quote", "talk_to_staff"],
        capabilities: [{ capability: "quote", readiness: "available" }],
        source: { id: "request-1", kind: "prescription" },
        state: "ready_to_quote",
        store: { id: "store-1", name: "Main Store" },
        summary: "Prescription request",
      }),
    ).toMatchObject({
      source: { kind: "prescription" },
      state: "ready_to_quote",
    })
  })

  test("routes exact Product demand to cart or Order and reserves inquiries for uncertainty", () => {
    expect(SERVICE_COMMERCE_EXACT_PRODUCT_COMMANDS).toEqual([
      "add_to_cart",
      "create_commercial_order",
    ])
    expect(SERVICE_COMMERCE_PRODUCT_DEMAND_REASONS).toEqual([
      "needs_identification",
      "needs_availability_confirmation",
      "needs_quote",
    ])
    expect(
      serviceCommerceProductDemandSchema.parse({
        command: "create_commercial_order",
        kind: "exact_product",
      }),
    ).toEqual({
      command: "create_commercial_order",
      kind: "exact_product",
    })
    expect(
      serviceCommerceProductDemandSchema.safeParse({
        kind: "commerce_inquiry",
        reason: "exact_product",
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
      "attachments",
      "quote",
      "booking",
      "payment",
      "pickup",
      "delivery",
      "service_completion",
      "web",
      "staff",
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
      "view_quote",
      "choose_quote_option",
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

  test("distinguishes disabled, setup, policy and provider readiness", () => {
    const configuration = serviceCommerceProfileConfigurationSchema.parse({
      catalogAdoptionMode: "progressive",
      capabilities: {
        intake: true,
        quote: true,
        booking: false,
        payment: true,
        pickup: false,
        delivery: false,
        service_completion: false,
        web: true,
        staff: true,
        whatsapp: true,
        progressive_catalog: true,
      },
      procureToOrderEnabled: false,
      status: "active",
    })

    const readiness = deriveServiceCommerceReadiness({
      configuration,
      providerUnavailable: ["whatsapp"],
      restricted: ["payment"],
      setupRequired: ["quote"],
      storeActive: true,
      trackedInventoryReady: false,
    })

    expect(configuration.capabilities.attachments).toBe(false)

    expect(readiness.capabilities.intake).toEqual({
      blockers: [],
      readiness: "available",
      recovery: null,
    })
    expect(readiness.capabilities.booking).toEqual({
      blockers: ["capability_disabled"],
      readiness: "unavailable",
      recovery: "manage_setup",
    })
    expect(readiness.capabilities.quote).toEqual({
      blockers: ["setup_incomplete"],
      readiness: "setup_required",
      recovery: "manage_setup",
    })
    expect(readiness.capabilities.payment).toEqual({
      blockers: ["policy_restricted"],
      readiness: "restricted",
      recovery: "review_policy",
    })
    expect(readiness.capabilities.whatsapp).toEqual({
      blockers: ["provider_unavailable"],
      readiness: "unavailable",
      recovery: "retry_provider",
    })
    expect(readiness.catalogAdoption).toEqual({
      mode: "progressive",
      privateDraftCapture: "available",
      procureToOrder: "setup_required",
      publicActivation: "setup_required",
      trackedInventory: "setup_required",
    })
  })

  test("fails every capability closed when the Store or profile is inactive", () => {
    const configuration = serviceCommerceProfileConfigurationSchema.parse({
      catalogAdoptionMode: "inventory_managed",
      capabilities: Object.fromEntries(
        SERVICE_COMMERCE_CAPABILITIES.map((capability) => [capability, true]),
      ),
      procureToOrderEnabled: true,
      status: "active",
    })

    const inactiveStore = deriveServiceCommerceReadiness({
      configuration,
      providerUnavailable: [],
      restricted: [],
      setupRequired: [],
      storeActive: false,
      trackedInventoryReady: true,
    })
    expect(inactiveStore.capabilities.intake).toEqual({
      blockers: ["store_inactive"],
      readiness: "unavailable",
      recovery: "activate_store",
    })
    expect(inactiveStore.catalogAdoption).toMatchObject({
      privateDraftCapture: "unavailable",
      procureToOrder: "unavailable",
      publicActivation: "unavailable",
      trackedInventory: "unavailable",
    })

    const disabledProfile = deriveServiceCommerceReadiness({
      configuration: { ...configuration, status: "disabled" },
      providerUnavailable: [],
      restricted: [],
      setupRequired: [],
      storeActive: true,
      trackedInventoryReady: true,
    })
    expect(disabledProfile.capabilities.intake).toEqual({
      blockers: ["profile_disabled"],
      readiness: "unavailable",
      recovery: "manage_setup",
    })
    expect(disabledProfile.catalogAdoption).toMatchObject({
      privateDraftCapture: "unavailable",
      procureToOrder: "unavailable",
      publicActivation: "unavailable",
      trackedInventory: "unavailable",
    })
  })

  test("requires a Store, intake, channel, outcome and progressive Catalog before activation", () => {
    const configuration = serviceCommerceProfileConfigurationSchema.parse({
      catalogAdoptionMode: "progressive",
      capabilities: {
        booking: false,
        delivery: false,
        intake: false,
        payment: false,
        pickup: false,
        progressive_catalog: false,
        quote: false,
        service_completion: false,
        staff: false,
        web: false,
        whatsapp: false,
      },
      procureToOrderEnabled: false,
      status: "disabled",
    })

    expect(
      getServiceCommerceActivationBlockers({
        configuration,
        storeActive: false,
      }),
    ).toEqual([
      "store_inactive",
      "intake_disabled",
      "channel_missing",
      "outcome_missing",
      "progressive_catalog_disabled",
    ])
    expect(
      getServiceCommerceActivationBlockers({
        configuration: {
          ...configuration,
          capabilities: {
            ...configuration.capabilities,
            intake: true,
            quote: true,
            progressive_catalog: true,
            web: true,
          },
        },
        storeActive: true,
      }),
    ).toEqual([])
  })

  test("requires at least one ready channel and outcome at activation time", () => {
    const configuration = serviceCommerceProfileConfigurationSchema.parse({
      catalogAdoptionMode: "progressive",
      capabilities: {
        booking: true,
        delivery: false,
        intake: true,
        payment: false,
        pickup: false,
        progressive_catalog: true,
        quote: false,
        service_completion: false,
        staff: false,
        web: false,
        whatsapp: true,
      },
      procureToOrderEnabled: false,
      status: "active",
    })
    const readiness = deriveServiceCommerceReadiness({
      configuration,
      providerUnavailable: ["whatsapp"],
      restricted: [],
      setupRequired: ["booking"],
      storeActive: true,
      trackedInventoryReady: false,
    })

    expect(
      getServiceCommerceRuntimeActivationBlockers({
        configuration,
        readiness,
        storeActive: true,
      }),
    ).toEqual(["channel_unavailable", "outcome_unavailable"])
  })
})
