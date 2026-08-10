import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  createCommerceInquiry,
  issueCommerceInquiryQuote,
  transitionCommerceInquiry,
} from "../../commerce-inquiries"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  attestServiceCommerceCatalogAvailability,
  createServiceCommerceCatalogDraft,
  getServiceCommerceCatalogPricePromotionImpact,
  linkServiceCommerceCatalogOffering,
  promoteServiceCommerceCatalogPrice,
} from "../../service-commerce-catalog"
import { resolveServiceCommerceCatalogSourceLine } from "../../service-commerce-catalog-source"
import {
  createServiceRequestForm,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "../../service-public"
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
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: true,
}

setDefaultTimeout(180_000)

describeWithServiceCommerceDatabase(
  "Service Commerce Progressive Catalog adoption on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Prepare Progressive Catalog acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate Progressive Catalog acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("grows a private bag Offering from reviewed demand without inventing stock and preserves the issued Quote price", async () => {
      const runId = randomUUID()
      const stockSourcesBefore = await fixture.db.stockBalanceSource.count({
        where: { tenantId: fixture.tenantId },
      })
      const inquiry = await createCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        channelOrigin: "staff",
        clientInquiryId: `catalog-adoption-${runId}`,
        customerName: "Progressive Catalog Customer",
        demand: {
          kind: "commerce_inquiry",
          reason: "needs_availability_confirmation",
        },
        lines: [
          {
            description: "Red small shoulder bag from customer photo",
            requestedQuantity: "1",
          },
        ],
        storeId: fixture.storeId,
        summary: "Please confirm this bag and quote the available option",
        tenantId: fixture.tenantId,
        vertical: "service",
      })
      const sourceLineId = inquiry.lines[0]?.id
      if (!sourceLineId) throw new Error("Inquiry line was not created.")
      const scope = {
        actorUserId: fixture.actorUserId,
        source: { id: inquiry.id, kind: "commerce_inquiry" as const },
        sourceLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const source = await resolveServiceCommerceCatalogSourceLine(fixture.db, {
        ...scope,
        operation: "read",
      })
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        ...scope,
        clientOperationId: `catalog-draft-${runId}`,
        draftKind: "product",
        expectedSourceFingerprint: source.ref.fingerprint,
        name: "Red small shoulder bag",
        verifiedAlias: "Red small shoulder bag from customer photo",
      })
      expect(draft.offering).toMatchObject({
        fixedPriceMinor: null,
        pricingPolicy: "QUOTE_REQUIRED",
        status: "DRAFT",
      })
      expect(
        await fixture.db.storeOfferingAvailability.count({
          where: { offeringId: draft.offering.id, storeId: fixture.storeId },
        }),
      ).toBe(0)
      expect(
        await fixture.db.stockBalanceSource.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(stockSourcesBefore)

      const attestation = await attestServiceCommerceCatalogAvailability(
        fixture.db,
        {
          ...scope,
          availability: "manual_procure_to_order",
          clientOperationId: `catalog-availability-${runId}`,
          expectedSourceFingerprint: source.ref.fingerprint,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          quantity: "1",
          reason: "Attendant confirmed supplier availability for this request",
        },
      )
      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: inquiry.id,
        reason: "Verified Catalog draft and availability",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })

      const issued = await issueCommerceInquiryQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        availabilityOutcome: "full",
        clientQuoteId: `catalog-quote-${runId}`,
        clientVersionId: `catalog-version-${runId}`,
        inquiryId: inquiry.id,
        lines: [
          {
            availabilityAttestationId: attestation.id,
            offeringId: draft.offering.id,
            outcome: "included",
            quantity: "1",
            sourceLineId,
            unitPriceMinor: 20_000_00,
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })

      const impact = await getServiceCommerceCatalogPricePromotionImpact(
        fixture.db,
        {
          ...scope,
          expectedSourceFingerprint: source.ref.fingerprint,
          quoteVersionId: issued.versionId,
        },
      )
      expect(impact).toMatchObject({
        currentPriceMinor: null,
        offeringId: draft.offering.id,
        quotePriceMinor: 20_000_00,
      })
      await promoteServiceCommerceCatalogPrice(fixture.db, {
        ...scope,
        affectedStoreIds: impact.affectedStores.map((store) => store.id),
        clientOperationId: `catalog-price-${runId}`,
        expectedPreviousPriceMinor: null,
        expectedSourceFingerprint: source.ref.fingerprint,
        priceMinor: 20_000_00,
        quoteVersionId: issued.versionId,
        reason:
          "Promote the attendant-confirmed Quote price for future requests",
      })

      const [offering, quoteLine] = await Promise.all([
        fixture.db.sellableOffering.findUniqueOrThrow({
          where: { id: draft.offering.id },
        }),
        fixture.db.commerceQuoteLine.findFirstOrThrow({
          where: { quoteVersionId: issued.versionId },
        }),
      ])
      expect(offering).toMatchObject({
        fixedPriceMinor: 20_000_00,
        pricingPolicy: "FIXED",
        status: "DRAFT",
      })
      expect(quoteLine.unitPriceMinor).toBe(20_000_00)
      expect(
        await fixture.db.catalogPricePromotion.count({
          where: {
            quoteVersionId: issued.versionId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(1)
    })

    test("uses the same reviewed private-draft and Quote seam for a web-origin Product inquiry", async () => {
      const runId = randomUUID()
      const inquiry = await createCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        channelOrigin: "web",
        clientInquiryId: `web-catalog-adoption-${runId}`,
        customerName: "Web Catalog Customer",
        demand: {
          kind: "commerce_inquiry",
          reason: "needs_quote",
        },
        lines: [
          {
            description: "Black large travel bag",
            requestedQuantity: "1",
          },
        ],
        storeId: fixture.storeId,
        summary: "Quote the black bag shown in the web request",
        tenantId: fixture.tenantId,
        vertical: "service",
      })
      const sourceLineId = inquiry.lines[0]?.id
      if (!sourceLineId) throw new Error("Web Inquiry line was not created.")
      const scope = {
        actorUserId: fixture.actorUserId,
        source: { id: inquiry.id, kind: "commerce_inquiry" as const },
        sourceLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const source = await resolveServiceCommerceCatalogSourceLine(fixture.db, {
        ...scope,
        operation: "read",
      })
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        ...scope,
        clientOperationId: `web-catalog-draft-${runId}`,
        draftKind: "product",
        expectedSourceFingerprint: source.ref.fingerprint,
        name: "Black large travel bag",
        verifiedAlias: "Black large travel bag",
      })
      const attestation = await attestServiceCommerceCatalogAvailability(
        fixture.db,
        {
          ...scope,
          availability: "manual_procure_to_order",
          clientOperationId: `web-catalog-availability-${runId}`,
          expectedSourceFingerprint: source.ref.fingerprint,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          quantity: "1",
          reason: "Web request availability confirmed by attendant",
        },
      )
      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: inquiry.id,
        reason: "Web request resolved to verified Catalog draft",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const issued = await issueCommerceInquiryQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        availabilityOutcome: "full",
        clientQuoteId: `web-catalog-quote-${runId}`,
        clientVersionId: `web-catalog-version-${runId}`,
        inquiryId: inquiry.id,
        lines: [
          {
            availabilityAttestationId: attestation.id,
            offeringId: draft.offering.id,
            outcome: "included",
            quantity: "1",
            sourceLineId,
            unitPriceMinor: 30_000_00,
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(
        await fixture.db.commerceInquiry.findUniqueOrThrow({
          select: { channelOrigin: true },
          where: { id: inquiry.id },
        }),
      ).toEqual({ channelOrigin: "WEB" })
      expect(draft.offering.status).toBe("DRAFT")
      expect(
        await fixture.db.commerceQuoteLine.findFirstOrThrow({
          where: { quoteVersionId: issued.versionId },
        }),
      ).toMatchObject({
        availabilityAttestationId: attestation.id,
        unitPriceMinor: 30_000_00,
      })
    })

    test("uses tracked inventory only through an existing active configured Offering", async () => {
      const runId = randomUUID()
      const inquiry = await createCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        channelOrigin: "staff",
        clientInquiryId: `tracked-catalog-adoption-${runId}`,
        customerName: "Tracked Catalog Customer",
        demand: {
          kind: "commerce_inquiry",
          reason: "needs_availability_confirmation",
        },
        lines: [
          {
            description: "One configured stocked item",
            requestedQuantity: "1",
          },
        ],
        storeId: fixture.storeId,
        summary: "Confirm the configured item and quote one unit",
        tenantId: fixture.tenantId,
        vertical: "service",
      })
      const sourceLineId = inquiry.lines[0]?.id
      if (!sourceLineId)
        throw new Error("Tracked Inquiry line was not created.")
      const scope = {
        actorUserId: fixture.actorUserId,
        source: { id: inquiry.id, kind: "commerce_inquiry" as const },
        sourceLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const source = await resolveServiceCommerceCatalogSourceLine(fixture.db, {
        ...scope,
        operation: "read",
      })
      await linkServiceCommerceCatalogOffering(fixture.db, {
        ...scope,
        clientOperationId: `tracked-catalog-link-${runId}`,
        expectedSourceFingerprint: source.ref.fingerprint,
        offeringId: fixture.offeringId,
        verifiedAlias: "Configured stocked item",
      })
      const attestation = await attestServiceCommerceCatalogAvailability(
        fixture.db,
        {
          ...scope,
          availability: "tracked_in_stock",
          clientOperationId: `tracked-catalog-availability-${runId}`,
          expectedSourceFingerprint: source.ref.fingerprint,
          quantity: "1",
          reason: "Existing configured Store balance confirms one unit",
        },
      )
      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: inquiry.id,
        reason: "Existing Catalog Offering and inventory confirmed",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const issued = await issueCommerceInquiryQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        availabilityOutcome: "full",
        clientQuoteId: `tracked-catalog-quote-${runId}`,
        clientVersionId: `tracked-catalog-version-${runId}`,
        inquiryId: inquiry.id,
        lines: [
          {
            availabilityAttestationId: attestation.id,
            offeringId: fixture.offeringId,
            outcome: "included",
            quantity: "1",
            sourceLineId,
            unitPriceMinor: 2_500,
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const quoteLine = await fixture.db.commerceQuoteLine.findFirstOrThrow({
        where: { quoteVersionId: issued.versionId },
      })
      expect(quoteLine).toMatchObject({
        availabilityAttestationId: attestation.id,
        offeringId: fixture.offeringId,
      })
      expect(quoteLine.balanceRevision).not.toBeNull()
      expect(quoteLine.configurationVersionId).not.toBeNull()
    })

    test("quotes a private Service draft only through its reviewed Service Request line", async () => {
      const runId = randomUUID()
      const requestForm = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: "Progressive Catalog Service Form",
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const request = await submitPublicServiceRequest(fixture.db, {
        clientRequestId: `catalog-service-request-${runId}`,
        customerEmail: `catalog-service-${runId}@example.invalid`,
        customerName: "Progressive Service Customer",
        customerPhone: "+2348333333333",
        details: "Inspect and repair the photographed travel-bag clasp.",
        formToken: requestForm.token,
        lines: [
          {
            details: "Repair the damaged clasp shown by the customer.",
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
          },
        ],
      })
      const requestLine = await fixture.db.serviceRequestLine.findFirstOrThrow({
        where: {
          requestId: request.id,
          request: {
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        },
      })
      const scope = {
        actorUserId: fixture.actorUserId,
        source: { id: request.id, kind: "service" as const },
        sourceLineId: requestLine.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const source = await resolveServiceCommerceCatalogSourceLine(fixture.db, {
        ...scope,
        operation: "read",
      })
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        ...scope,
        clientOperationId: `catalog-service-draft-${runId}`,
        draftKind: "service",
        expectedSourceFingerprint: source.ref.fingerprint,
        name: "Travel-bag clasp repair",
        verifiedAlias: "Repair the damaged clasp shown by the customer",
      })
      const issued = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `catalog-service-quote-${runId}`,
        clientVersionId: `catalog-service-version-${runId}`,
        lines: [
          {
            offeringId: draft.offering.id,
            quantity: "1",
            sourceLineId: requestLine.id,
            unitPriceMinor: 12_500_00,
          },
        ],
        requestId: request.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(draft.offering).toMatchObject({
        fixedPriceMinor: null,
        pricingPolicy: "QUOTE_REQUIRED",
        status: "DRAFT",
      })
      expect(
        await fixture.db.commerceQuoteLine.findFirstOrThrow({
          where: { quoteVersionId: issued.versionId },
        }),
      ).toMatchObject({
        offeringId: draft.offering.id,
        sourceLineId: requestLine.id,
        unitPriceMinor: 12_500_00,
      })
    })
  },
)
