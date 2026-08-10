import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import { submitServiceCommerceIntake } from "../../service-commerce-intake"
import { createServiceRequestForm } from "../../service-public"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: true,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: true,
    whatsapp: true,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: true,
}

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce channel-neutral intake on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture
    let entryToken: string
    let formToken: string
    let connectionId: string

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const runId = randomUUID()
      const connection = await fixture.db.whatsAppConnection.create({
        data: {
          businessDisplayName: "Acceptance Customer Channel",
          businessVerified: true,
          createdByUserId: fixture.actorUserId,
          credentialReference: `acceptance-private-${runId}`,
          displayNumber: "+2348000000001",
          numberVerified: true,
          outboundVerified: true,
          phoneNumberId: `acceptance-phone-${runId}`,
          status: "ACTIVE",
          templatesReady: true,
          tenantId: fixture.tenantId,
          wabaId: `acceptance-waba-${runId}`,
          webhookSubscribed: true,
        },
      })
      connectionId = connection.id
      await fixture.db.whatsAppStoreBinding.create({
        data: {
          activatedAt: new Date(),
          boundByUserId: fixture.actorUserId,
          connectionId,
          status: "ACTIVE",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Configure channel-neutral intake acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate channel-neutral intake acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const entry = await publishCustomerEntryPoint(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      entryToken = entry.publicToken
      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Book an acceptance consultation",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      formToken = form.token
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("routes web, staff and WhatsApp through explicit source intents with replay", async () => {
      const runId = randomUUID()
      const webEnvelope = {
        channel: "web" as const,
        clientCommandId: `web-${runId}`,
        consent: {
          contactOptIn: true,
          privacyNoticeVersion: "acceptance-v1",
        },
        context: { kind: "entry_point" as const, token: entryToken },
        intent: {
          customer: { name: "Web Bag Customer", phone: "+2348011111111" },
          demand: {
            kind: "commerce_inquiry" as const,
            reason: "needs_identification" as const,
          },
          kind: "commerce_inquiry" as const,
          lines: [{ description: "Red small bag" }],
          summary: "Identify and quote this red small bag",
        },
      }
      const web = await submitServiceCommerceIntake(fixture.db, {
        envelope: webEnvelope,
      })
      const webReplay = await submitServiceCommerceIntake(fixture.db, {
        envelope: webEnvelope,
      })
      expect(web).toMatchObject({
        channel: "web",
        replayed: false,
        source: { kind: "commerce_inquiry" },
        status: "accepted",
      })
      expect(webReplay).toMatchObject({
        replayed: true,
        source: web.status === "accepted" ? web.source : undefined,
      })

      const service = await submitServiceCommerceIntake(fixture.db, {
        actorUserId: fixture.actorUserId,
        envelope: {
          channel: "staff",
          clientCommandId: `staff-service-${runId}`,
          consent: {
            contactOptIn: false,
            privacyNoticeVersion: "acceptance-v1",
          },
          context: { kind: "store", storeId: fixture.storeId },
          intent: {
            customer: { name: "Staff Service Customer" },
            formToken,
            kind: "service",
            lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
          },
        },
        tenantId: fixture.tenantId,
      })
      expect(service).toMatchObject({
        channel: "staff",
        source: { kind: "service" },
        status: "accepted",
      })

      const providerEventId = `wamid-${runId}`
      const inbound = await fixture.db.whatsAppInboundEvent.create({
        data: {
          connectionId,
          externalCustomerId: "+2348022222222",
          messageType: "text",
          normalizedPayload: {
            intakeKind: "commerce_inquiry",
            text: "Is the black large bag available?",
          },
          providerEventId,
          routeVertical: "SERVICE",
          status: "PROCESSING",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      const whatsapp = await submitServiceCommerceIntake(fixture.db, {
        envelope: {
          channel: "whatsapp",
          clientCommandId: `whatsapp:${providerEventId}`,
          consent: {
            contactOptIn: false,
            privacyNoticeVersion: "whatsapp-customer-initiated-v1",
          },
          context: { inboundEventId: inbound.id, kind: "inbound_event" },
          intent: {
            customer: {
              name: "WhatsApp customer",
              phone: "+2348022222222",
            },
            demand: {
              kind: "commerce_inquiry",
              reason: "needs_availability_confirmation",
            },
            kind: "commerce_inquiry",
            lines: [{ description: "Black large bag" }],
            summary: "Is the black large bag available?",
          },
          providerEventId,
        },
      })
      expect(whatsapp).toMatchObject({
        channel: "whatsapp",
        source: { kind: "commerce_inquiry" },
        status: "accepted",
      })

      const exactProduct = await submitServiceCommerceIntake(fixture.db, {
        actorUserId: fixture.actorUserId,
        envelope: {
          channel: "staff",
          clientCommandId: `staff-product-${runId}`,
          consent: {
            contactOptIn: false,
            privacyNoticeVersion: "acceptance-v1",
          },
          context: { kind: "store", storeId: fixture.storeId },
          intent: {
            kind: "exact_product",
            offeringId: fixture.offeringId,
            quantity: "1",
          },
        },
        tenantId: fixture.tenantId,
      })
      expect(exactProduct).toEqual({
        action: "use_cart",
        code: "unsupported",
        status: "recovery",
      })
    })
  },
)
