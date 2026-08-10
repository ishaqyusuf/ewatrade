import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import { createSimpleCatalogItem } from "../../catalog"
import {
  CommerceInquiryError,
  acceptCommerceInquiryQuote,
  createCommerceInquiry,
  getPublicCommerceInquiryQuote,
  issueCommerceInquiryQuote,
  selectCommerceInquiryQuoteOption,
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
      ).resolves.toMatchObject({
        id: inquiry.id,
        lines: inquiry.lines,
        replayed: true,
        state: inquiry.state,
      })

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
      const blackBagItem = await createSimpleCatalogItem(fixture.db, {
        actorUserId: fixture.actorUserId,
        canonicalUnitName: "piece",
        clientOperationId: `black-bag-${runId}`,
        kind: "product",
        name: "Black large bag",
        openingStockQuantity: "5",
        priceMinor: 3_000,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const blackBagOffering = blackBagItem.variants[0]?.offerings[0]
      if (!blackBagOffering)
        throw new Error("Black bag Offering was not created.")

      const quoteInput: Parameters<typeof issueCommerceInquiryQuote>[1] = {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `inquiry-quote-${runId}`,
        clientVersionId: `inquiry-version-${runId}`,
        inquiryId: inquiry.id,
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: `red-small-${runId}`,
            label: "Red small",
            lines: [
              {
                offeringId: fixture.offeringId,
                outcome: "included",
                quantity: "1",
                sourceLineId: inquiryLineId,
                unitPriceMinor: 2_650,
              },
            ],
          },
          {
            availabilityOutcome: "full",
            clientOptionId: `black-large-${runId}`,
            label: "Black large",
            lines: [
              {
                offeringId: blackBagOffering.id,
                outcome: "included",
                quantity: "1",
                sourceLineId: inquiryLineId,
                unitPriceMinor: 3_000,
              },
            ],
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
        payable: false,
        requiresSelection: true,
        sourceType: "commerce_inquiry",
        totalMinor: 0,
      })
      await expect(
        getPublicCommerceInquiryQuote(fixture.db, {
          acceptanceToken: replayedIssue.token,
        }),
      ).resolves.toMatchObject({
        accepted: false,
        payable: false,
        requiresSelection: true,
        sourceType: "commerce_inquiry",
        totalMinor: 0,
      })

      const acceptanceInput = {
        acceptanceToken: issued.token,
        clientAcceptanceId: `inquiry-acceptance-${runId}`,
      }
      await expect(
        acceptCommerceInquiryQuote(fixture.db, acceptanceInput),
      ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
      const publicQuote = await getPublicCommerceInquiryQuote(fixture.db, {
        acceptanceToken: issued.token,
      })
      const blackOption = publicQuote.options.find(
        (option) => option.label === "Black large",
      )
      const redOption = publicQuote.options.find(
        (option) => option.label === "Red small",
      )
      if (!blackOption || !redOption) {
        throw new Error("Both bag Offer Options were not projected.")
      }
      const selectionCommandId = `inquiry-selection-${runId}`
      const selectionInput = {
        acceptanceToken: issued.token,
        clientSelectionId: selectionCommandId,
        optionId: blackOption.id,
      }
      const competingSelectionInput = {
        ...selectionInput,
        optionId: redOption.id,
      }
      const selectionRace = await Promise.allSettled([
        selectCommerceInquiryQuoteOption(fixture.db, selectionInput),
        selectCommerceInquiryQuoteOption(fixture.db, competingSelectionInput),
      ])
      const winningSelections = selectionRace.filter(
        (result) => result.status === "fulfilled",
      )
      const losingSelections = selectionRace.filter(
        (result) => result.status === "rejected",
      )
      expect(winningSelections).toHaveLength(1)
      expect(losingSelections).toHaveLength(1)
      expect(losingSelections[0]).toMatchObject({
        reason: { code: "IDEMPOTENCY_MISMATCH" },
      })
      const winningSelection = winningSelections[0]
      if (winningSelection?.status !== "fulfilled") {
        throw new Error("One Offer Option must win the selection race.")
      }
      const selectedOptionId = winningSelection.value.optionId
      const selectedBlack = selectedOptionId === blackOption.id
      const replaySelectionInput = selectedBlack
        ? selectionInput
        : competingSelectionInput
      await expect(
        selectCommerceInquiryQuoteOption(fixture.db, replaySelectionInput),
      ).resolves.toMatchObject({ optionId: selectedOptionId })
      await expect(
        selectCommerceInquiryQuoteOption(fixture.db, {
          ...replaySelectionInput,
          optionId: selectedBlack ? redOption.id : blackOption.id,
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
      await expect(
        getPublicCommerceInquiryQuote(fixture.db, {
          acceptanceToken: issued.token,
        }),
      ).resolves.toMatchObject({
        lines: [
          {
            catalogItemName: selectedBlack
              ? "Black large bag"
              : "Acceptance Medicine",
            totalMinor: selectedBlack ? 3_000 : 2_650,
          },
        ],
        payable: true,
        requiresSelection: false,
        selectedOptionId,
        totalMinor: selectedBlack ? 3_000 : 2_650,
      })
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
        totalMinor: selectedBlack ? 3_000 : 2_650,
      })
      expect(order.lines).toHaveLength(1)
      expect(order.lines[0]).toMatchObject({
        kind: "PRODUCT_UNIT",
        offeringId: selectedBlack ? blackBagOffering.id : fixture.offeringId,
        unitPriceMinor: selectedBlack ? 3_000 : 2_650,
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
