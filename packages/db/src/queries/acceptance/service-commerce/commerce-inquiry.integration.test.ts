import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  CommerceInquiryError,
  acceptCommerceInquiryQuote,
  createCommerceInquiry,
  getPublicCommerceInquiryQuote,
  issueCommerceInquiryQuote,
  transitionCommerceInquiry,
} from "../../commerce-inquiries"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import { getServiceCommerceCustomerRequestProjection } from "../../service-commerce-sources"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    booking: false,
    delivery: false,
    intake: true,
    payment: true,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: false,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Service Commerce Inquiry interoperability on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Prepare Commerce Inquiry acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate Commerce Inquiry acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("keeps exact Product demand on Commerce and converts only an accepted Inquiry Quote", async () => {
      const runId = randomUUID()
      const before = await fixture.db.commerceInquiry.count({
        where: { tenantId: fixture.tenantId },
      })
      await expect(
        createCommerceInquiry(fixture.db, {
          actorUserId: fixture.actorUserId,
          channelOrigin: "staff",
          clientInquiryId: `exact-product-${runId}`,
          customerName: "Exact Product Customer",
          demand: {
            command: "create_commercial_order",
            kind: "exact_product",
          },
          lines: [{ description: "Known Product", requestedQuantity: "1" }],
          storeId: fixture.storeId,
          summary: "Known catalog Product",
          tenantId: fixture.tenantId,
          vertical: "service",
        }),
      ).rejects.toBeInstanceOf(CommerceInquiryError)
      expect(
        await fixture.db.commerceInquiry.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(before)

      const inquiryInput = {
        actorUserId: fixture.actorUserId,
        channelOrigin: "staff" as const,
        clientInquiryId: `inquiry-${runId}`,
        customerEmail: `inquiry-${runId}@example.invalid`,
        customerName: "Inquiry Customer",
        customerPhone: "+2348333333333",
        demand: {
          kind: "commerce_inquiry" as const,
          reason: "needs_availability_confirmation" as const,
        },
        lines: [
          {
            description: "Blue medicine package",
            requestedQuantity: "1",
          },
        ],
        storeId: fixture.storeId,
        summary: "Please confirm the blue medicine package",
        tenantId: fixture.tenantId,
        vertical: "service" as const,
      }
      const inquiry = await createCommerceInquiry(fixture.db, inquiryInput)
      await expect(
        createCommerceInquiry(fixture.db, inquiryInput),
      ).resolves.toEqual(inquiry)

      const projection = await getServiceCommerceCustomerRequestProjection(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          source: { id: inquiry.id, kind: "commerce_inquiry" },
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      expect(projection).toMatchObject({
        source: { id: inquiry.id, kind: "commerce_inquiry" },
        state: "received",
        store: { id: fixture.storeId, name: "Acceptance Pharmacy" },
        summary: inquiryInput.summary,
      })
      expect(projection).not.toHaveProperty("customerEmail")
      expect(projection).not.toHaveProperty("customerPhone")

      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: inquiry.id,
        reason: "Catalog Offering confirmed by attendant",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const beforeQuote = await fixture.db.commerceInquiry.findUniqueOrThrow({
        where: { id: inquiry.id },
      })
      expect(beforeQuote.status).toBe("READY_TO_QUOTE")
      expect(beforeQuote.convertedAt).toBeNull()
      expect(
        await fixture.db.commercialOrder.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(0)

      const inquiryLineId = inquiry.lines[0]?.id
      if (!inquiryLineId) throw new Error("Inquiry line was not created.")

      const quoteInput: Parameters<typeof issueCommerceInquiryQuote>[1] = {
        actorUserId: fixture.actorUserId,
        availabilityOutcome: "full",
        clientQuoteId: `inquiry-quote-${runId}`,
        clientVersionId: `inquiry-version-${runId}`,
        inquiryId: inquiry.id,
        lines: [
          {
            offeringId: fixture.offeringId,
            outcome: "included",
            quantity: "1",
            sourceLineId: inquiryLineId,
            unitPriceMinor: 2_650,
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const issued = await issueCommerceInquiryQuote(fixture.db, quoteInput)
      if (!issued.token) throw new Error("Inquiry Quote token was not issued.")
      const replayedIssue = await issueCommerceInquiryQuote(
        fixture.db,
        quoteInput,
      )
      if (!replayedIssue.token) {
        throw new Error("Inquiry Quote replay token was not issued.")
      }
      expect(replayedIssue).toMatchObject({
        quoteId: issued.quoteId,
        versionId: issued.versionId,
      })
      expect(replayedIssue.token).not.toBe(issued.token)
      await expect(
        issueCommerceInquiryQuote(fixture.db, {
          ...quoteInput,
          clientQuoteId: `different-inquiry-quote-${runId}`,
          clientVersionId: `different-inquiry-version-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
      expect(
        await fixture.db.commerceQuote.count({
          where: {
            sourceId: inquiry.id,
            sourceType: "COMMERCE_INQUIRY",
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(1)
      await expect(
        getPublicCommerceInquiryQuote(fixture.db, {
          acceptanceToken: issued.token,
        }),
      ).resolves.toMatchObject({
        accepted: false,
        sourceType: "commerce_inquiry",
        totalMinor: 2_650,
      })
      await expect(
        getPublicCommerceInquiryQuote(fixture.db, {
          acceptanceToken: replayedIssue.token,
        }),
      ).resolves.toMatchObject({
        accepted: false,
        sourceType: "commerce_inquiry",
        totalMinor: 2_650,
      })

      const acceptanceInput = {
        acceptanceToken: issued.token,
        clientAcceptanceId: `inquiry-acceptance-${runId}`,
      }
      const accepted = await acceptCommerceInquiryQuote(
        fixture.db,
        acceptanceInput,
      )
      await expect(
        acceptCommerceInquiryQuote(fixture.db, acceptanceInput),
      ).resolves.toEqual(accepted)

      const [converted, order, audit] = await Promise.all([
        fixture.db.commerceInquiry.findUniqueOrThrow({
          where: { id: inquiry.id },
        }),
        fixture.db.commercialOrder.findUniqueOrThrow({
          include: { lines: true },
          where: { id: accepted.orderId },
        }),
        fixture.db.commerceInquiryAuditEvent.findMany({
          orderBy: { createdAt: "asc" },
          where: {
            inquiryId: inquiry.id,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ])
      expect(converted.status).toBe("CONVERTED")
      expect(converted.convertedAt).toBeInstanceOf(Date)
      expect(order).toMatchObject({
        customerEmail: inquiryInput.customerEmail,
        customerName: inquiryInput.customerName,
        customerPhone: inquiryInput.customerPhone,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        totalMinor: 2_650,
      })
      expect(order.lines).toHaveLength(1)
      expect(order.lines[0]).toMatchObject({
        kind: "PRODUCT_UNIT",
        offeringId: fixture.offeringId,
        unitPriceMinor: 2_650,
      })
      expect(audit.map((event) => event.type)).toEqual([
        "CREATED",
        "STATE_CHANGED",
        "QUOTE_ISSUED",
        "CONVERTED",
      ])
    }, 180_000)
  },
)
