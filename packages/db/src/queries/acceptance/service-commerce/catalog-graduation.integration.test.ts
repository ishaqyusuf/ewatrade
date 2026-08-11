import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  acceptCommerceInquiryQuote,
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
  linkServiceCommerceCatalogOffering,
} from "../../service-commerce-catalog"
import { resolveServiceCommerceCatalogSourceLine } from "../../service-commerce-catalog-source"
import {
  getServiceCommerceCatalogGraduationReadiness,
  graduateServiceCommerceCatalogOffering,
  publishServiceCommerceCatalogOffering,
} from "../../service-commerce-graduation"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  describeWithServiceCommerceDatabase,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
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
  "Service Commerce Catalog graduation on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Prepare Catalog graduation acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate Catalog graduation acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("graduates the same progressive Product and reserves only the post-publication tracked sale", async () => {
      const runId = randomUUID()
      const firstInquiry = await createCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        channelOrigin: "staff",
        clientInquiryId: `graduation-before-${runId}`,
        customerName: "Progressive Bag Customer",
        demand: {
          kind: "commerce_inquiry",
          reason: "needs_availability_confirmation",
        },
        lines: [
          { description: "Red small shoulder bag", requestedQuantity: "1" },
        ],
        storeId: fixture.storeId,
        summary: "Confirm and quote the requested bag",
        tenantId: fixture.tenantId,
        vertical: "service",
      })
      const firstLineId = firstInquiry.lines[0]?.id
      if (!firstLineId)
        throw new Error("Progressive Inquiry line was not created.")
      const firstScope = {
        actorUserId: fixture.actorUserId,
        source: { id: firstInquiry.id, kind: "commerce_inquiry" as const },
        sourceLineId: firstLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const source = await resolveServiceCommerceCatalogSourceLine(fixture.db, {
        ...firstScope,
        operation: "read",
      })
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        ...firstScope,
        clientOperationId: `graduation-draft-${runId}`,
        draftKind: "product",
        expectedSourceFingerprint: source.ref.fingerprint,
        name: "Red small shoulder bag",
        verifiedAlias: "Red small shoulder bag",
      })
      const manual = await attestServiceCommerceCatalogAvailability(
        fixture.db,
        {
          ...firstScope,
          availability: "manual_procure_to_order",
          clientOperationId: `graduation-manual-${runId}`,
          expectedSourceFingerprint: source.ref.fingerprint,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          quantity: "1",
          reason: "Attendant confirmed one manually procured bag",
        },
      )
      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: firstInquiry.id,
        reason: "Manual availability confirmed",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const firstQuote = await issueCommerceInquiryQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        availabilityOutcome: "full",
        clientQuoteId: `graduation-before-quote-${runId}`,
        clientVersionId: `graduation-before-version-${runId}`,
        inquiryId: firstInquiry.id,
        lines: [
          {
            availabilityAttestationId: manual.id,
            offeringId: draft.offering.id,
            outcome: "included",
            quantity: "1",
            sourceLineId: firstLineId,
            unitPriceMinor: 20_000_00,
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!firstQuote.token)
        throw new Error("Pre-graduation Quote token missing.")
      const firstOrder = await acceptCommerceInquiryQuote(fixture.db, {
        acceptanceToken: firstQuote.token,
        clientAcceptanceId: `graduation-before-accept-${runId}`,
      })
      expect(
        await fixture.db.stockReservation.count({
          where: { commercialOrderLine: { orderId: firstOrder.orderId } },
        }),
      ).toBe(0)

      await attestServiceCommerceCatalogAvailability(fixture.db, {
        ...firstScope,
        availability: "unavailable",
        clientOperationId: `graduation-close-commitment-${runId}`,
        expectedSourceFingerprint: source.ref.fingerprint,
        reason: "Close the fulfilled manual commitment before graduation",
      })
      const before = await getServiceCommerceCatalogGraduationReadiness(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          offeringId: draft.offering.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      expect(before.missingFacts).toEqual([
        "category",
        "reusable_price",
        "product_unit",
        "product_identifier",
        "opening_count",
      ])
      const graduated = await graduateServiceCommerceCatalogOffering(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          canonicalUnitName: "bag",
          canonicalUnitSymbol: "bag",
          category: "Bags",
          clientOperationId: `graduation-command-${runId}`,
          confirmed: true,
          currencyCode: "NGN",
          draftKind: "product",
          expectedOfferingRevision: before.revision,
          fixedPriceMinor: 20_000_00,
          openingStockQuantity: "5",
          offeringId: draft.offering.id,
          reason: "Verified five bags during managed inventory setup",
          sku: `BAG-RED-S-${runId}`,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          transactionScale: 0,
          variantName: "Red small",
        },
      )
      expect(graduated).toMatchObject({
        canGraduate: true,
        catalogItemId: draft.offering.catalogItemId,
        isPublished: false,
        offeringId: draft.offering.id,
      })
      expect(
        await fixture.db.commerceQuoteLine.findFirstOrThrow({
          where: { quoteVersionId: firstQuote.versionId },
        }),
      ).toMatchObject({
        offeringId: draft.offering.id,
        unitPriceMinor: 20_000_00,
      })

      const published = await publishServiceCommerceCatalogOffering(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          clientOperationId: `graduation-publish-${runId}`,
          confirmed: true,
          expectedOfferingRevision: graduated.revision,
          offeringId: draft.offering.id,
          reason: "Publish the verified managed-inventory bag",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      expect(published.isPublished).toBe(true)

      const secondInquiry = await createCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        channelOrigin: "web",
        clientInquiryId: `graduation-after-${runId}`,
        customerName: "Managed Bag Customer",
        demand: { kind: "commerce_inquiry", reason: "needs_quote" },
        lines: [{ description: "Red small bag", requestedQuantity: "1" }],
        storeId: fixture.storeId,
        summary: "Quote one managed bag",
        tenantId: fixture.tenantId,
        vertical: "service",
      })
      const secondLineId = secondInquiry.lines[0]?.id
      if (!secondLineId)
        throw new Error("Managed Inquiry line was not created.")
      const secondScope = {
        actorUserId: fixture.actorUserId,
        source: { id: secondInquiry.id, kind: "commerce_inquiry" as const },
        sourceLineId: secondLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const secondSource = await resolveServiceCommerceCatalogSourceLine(
        fixture.db,
        { ...secondScope, operation: "read" },
      )
      await linkServiceCommerceCatalogOffering(fixture.db, {
        ...secondScope,
        clientOperationId: `graduation-after-link-${runId}`,
        expectedSourceFingerprint: secondSource.ref.fingerprint,
        offeringId: draft.offering.id,
        verifiedAlias: "Red small bag",
      })
      const tracked = await attestServiceCommerceCatalogAvailability(
        fixture.db,
        {
          ...secondScope,
          availability: "tracked_in_stock",
          clientOperationId: `graduation-after-stock-${runId}`,
          expectedSourceFingerprint: secondSource.ref.fingerprint,
          quantity: "1",
          reason: "Verified managed balance contains one bag",
        },
      )
      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: secondInquiry.id,
        reason: "Managed stock confirmed",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const secondQuote = await issueCommerceInquiryQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        availabilityOutcome: "full",
        clientQuoteId: `graduation-after-quote-${runId}`,
        clientVersionId: `graduation-after-version-${runId}`,
        inquiryId: secondInquiry.id,
        lines: [
          {
            availabilityAttestationId: tracked.id,
            offeringId: draft.offering.id,
            outcome: "included",
            quantity: "1",
            sourceLineId: secondLineId,
            unitPriceMinor: 20_000_00,
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!secondQuote.token)
        throw new Error("Post-graduation Quote token missing.")
      const secondOrder = await acceptCommerceInquiryQuote(fixture.db, {
        acceptanceToken: secondQuote.token,
        clientAcceptanceId: `graduation-after-accept-${runId}`,
      })
      expect(
        await fixture.db.stockReservation.count({
          where: { commercialOrderLine: { orderId: secondOrder.orderId } },
        }),
      ).toBe(1)
      const balance = await fixture.db.stockBalanceSource.findFirstOrThrow({
        where: {
          product: { catalogItemId: draft.offering.catalogItemId },
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      expect(balance.onHandQuantity.toString()).toBe("5")
      expect(balance.reservedQuantity.toString()).toBe("1")
    })
  },
)
