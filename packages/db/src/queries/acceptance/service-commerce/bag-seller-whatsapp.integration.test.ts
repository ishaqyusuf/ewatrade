import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"

import { createSimpleCatalogItem } from "../../catalog"
import {
  acceptCommerceInquiryQuote,
  getPublicCommerceInquiryQuote,
  issueCommerceInquiryQuote,
  selectCommerceInquiryQuoteOption,
  transitionCommerceInquiry,
} from "../../commerce-inquiries"
import { recordCommercialOrderPayment } from "../../commercial-payments"
import { setServiceCommerceStoreProfileActivation } from "../../service-commerce-access"
import {
  getAuthorizedServiceCommerceMediaAttachment,
  recordServiceCommerceMediaIntake,
} from "../../service-commerce-attachments"
import {
  attestServiceCommerceCatalogAvailability,
  createServiceCommerceCatalogDraft,
} from "../../service-commerce-catalog"
import { resolveServiceCommerceCatalogSourceLine } from "../../service-commerce-catalog-source"
import { getServiceCommerceFulfillmentOrder } from "../../service-commerce-fulfillment"
import { submitServiceCommerceIntake } from "../../service-commerce-intake"
import {
  recordServiceCommerceMediaSafety,
  recordStoredServiceCommerceMediaAsset,
  requestServiceCommerceMediaSafety,
} from "../../service-commerce-media-assets"
import { createServiceCommerceHumanObservation } from "../../service-commerce-observations"
import {
  type CommerceAcceptanceFixture,
  createCommerceAcceptanceFixture,
  disposeCommerceAcceptanceFixture,
} from "./commerce.fixture"
import { describeWithServiceCommerceDatabase } from "./database"

setDefaultTimeout(120_000)

describeWithServiceCommerceDatabase(
  "Generic Commerce bag-seller WhatsApp journey on Neon",
  () => {
    let fixture: CommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createCommerceAcceptanceFixture()
      const profile =
        await fixture.db.serviceCommerceStoreProfile.findFirstOrThrow({
          where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
        })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: profile.revision,
        reason: "Activate the run-owned generic Commerce bag seller",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeCommerceAcceptanceFixture(fixture)
    })

    test("takes a WhatsApp bag image through generic observation, options, exact payment and pickup", async () => {
      const runId = randomUUID()
      const providerEventId = `bag-wamid-${runId}`
      const inbound = await fixture.db.whatsAppInboundEvent.create({
        data: {
          connectionId: fixture.connectionId,
          externalCustomerId: "+2348020000000",
          messageType: "image",
          normalizedPayload: {
            intakeKind: "commerce_inquiry",
            mediaId: `bag-media-${runId}`,
            mediaType: "image/jpeg",
            text: "Is this bag available?",
          },
          providerEventId,
          routeVertical: "SERVICE",
          status: "PROCESSING",
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      })
      const intake = await submitServiceCommerceIntake(fixture.db, {
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
              name: "WhatsApp bag customer",
              phone: "+2348020000000",
            },
            demand: {
              kind: "commerce_inquiry",
              reason: "needs_identification",
            },
            kind: "commerce_inquiry",
            lines: [
              {
                description: "Customer bag image requiring identification",
                requestedQuantity: "1",
              },
            ],
            summary: "Is this bag available?",
          },
          providerEventId,
        },
      })
      expect(intake).toMatchObject({
        channel: "whatsapp",
        source: { kind: "commerce_inquiry" },
        status: "accepted",
      })
      if (intake.status !== "accepted") {
        throw new Error("WhatsApp bag inquiry did not resolve.")
      }

      const inquiry = await fixture.db.commerceInquiry.findUniqueOrThrow({
        include: { lines: true },
        where: { id: intake.source.id },
      })
      const sourceLine = inquiry.lines[0]
      if (!sourceLine) throw new Error("Bag inquiry line was not created.")
      const source = { id: inquiry.id, kind: "commerce_inquiry" as const }
      const resolved = await resolveServiceCommerceCatalogSourceLine(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          operation: "read",
          source,
          sourceLineId: sourceLine.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const attachment = await recordServiceCommerceMediaIntake(fixture.db, {
        actorUserId: `whatsapp_inbound_${inbound.id}`,
        channel: "whatsapp",
        clientMediaId: providerEventId,
        fileName: "customer-image.jpeg",
        kind: "image",
        mimeType: "image/jpeg",
        privateMediaProviderReady: true,
        provider: "meta",
        providerConnectionId: fixture.connectionId,
        providerMediaId: `bag-media-${runId}`,
        retentionUntil: new Date(Date.now() + 30 * 86_400_000),
        signatureMimeType: null,
        sizeBytes: 0,
        source,
        sourceLineId: sourceLine.id,
        sourceVersion: resolved.ref.sourceVersion,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(JSON.stringify(attachment)).not.toContain("private/")
      expect(JSON.stringify(attachment)).not.toContain("bag-media-")
      await recordStoredServiceCommerceMediaAsset(fixture.db, {
        contentDigest: "a".repeat(64),
        mediaAssetId: attachment.media.id,
        objectKey: `private/${fixture.tenantId}/${attachment.media.id}`,
        reason: "Run-owned Meta image retrieval",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedMediaType: "image/jpeg",
        verifiedSizeBytes: 4,
      })
      await requestServiceCommerceMediaSafety(fixture.db, {
        mediaAssetId: attachment.media.id,
        reason: "Run-owned generic image safety request",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await recordServiceCommerceMediaSafety(fixture.db, {
        mediaAssetId: attachment.media.id,
        outcome: "safe",
        reason: "Run-owned generic image safety result",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const observation = await createServiceCommerceHumanObservation(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          attachmentId: attachment.attachment.id,
          attributes: [
            { name: "item", value: "bag" },
            { name: "colour", value: "red" },
            { name: "size", value: "small" },
          ],
          displayLabel: "Bag / red / small",
          expectedRevision: 0,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `bag-draft-${runId}`,
        draftKind: "product",
        expectedSourceFingerprint: resolved.ref.fingerprint,
        name: "Bag red small",
        source,
        sourceLineId: sourceLine.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedObservationId: observation.id,
      })
      const redAvailability = await attestServiceCommerceCatalogAvailability(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          availability: "manual_procure_to_order",
          clientOperationId: `bag-red-availability-${runId}`,
          expectedSourceFingerprint: resolved.ref.fingerprint,
          expiresAt: new Date(Date.now() + 60 * 60_000),
          quantity: "1",
          reason: "Attendant confirmed a supplier can provide the red bag.",
          source,
          sourceLineId: sourceLine.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const blackItem = await createSimpleCatalogItem(fixture.db, {
        actorUserId: fixture.actorUserId,
        canonicalUnitName: "piece",
        clientOperationId: `bag-black-catalog-${runId}`,
        kind: "product",
        name: "Bag black large",
        openingStockQuantity: "2",
        priceMinor: 30_000_00,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const blackOffering = blackItem.variants[0]?.offerings[0]
      if (!blackOffering) throw new Error("Black bag Offering was not created.")

      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: inquiry.id,
        reason: "Generic bag observation and availability were verified.",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const issued = await issueCommerceInquiryQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `bag-quote-${runId}`,
        clientVersionId: `bag-version-${runId}`,
        inquiryId: inquiry.id,
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: `bag-red-small-${runId}`,
            fulfilmentPromise: "Pickup today after confirmation",
            fulfilmentType: "pickup",
            label: "Bag red small",
            lines: [
              {
                availabilityAttestationId: redAvailability.id,
                offeringId: draft.offering.id,
                outcome: "included",
                quantity: "1",
                sourceLineId: sourceLine.id,
                unitPriceMinor: 20_000_00,
              },
            ],
          },
          {
            availabilityOutcome: "full",
            clientOptionId: `bag-black-large-${runId}`,
            fulfilmentPromise: "Pickup today after confirmation",
            fulfilmentType: "pickup",
            label: "Bag black large",
            lines: [
              {
                offeringId: blackOffering.id,
                outcome: "included",
                quantity: "1",
                sourceLineId: sourceLine.id,
                unitPriceMinor: 30_000_00,
              },
            ],
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      if (!issued.token) throw new Error("Bag Quote token was not issued.")
      const publicQuote = await getPublicCommerceInquiryQuote(fixture.db, {
        acceptanceToken: issued.token,
      })
      expect(publicQuote).toMatchObject({
        payable: false,
        requiresSelection: true,
        sourceType: "commerce_inquiry",
      })
      expect(
        publicQuote.options.map((option) => ({
          label: option.label,
          totalMinor: option.totalMinor,
        })),
      ).toEqual([
        { label: "Bag red small", totalMinor: 20_000_00 },
        { label: "Bag black large", totalMinor: 30_000_00 },
      ])
      const redOption = publicQuote.options.find(
        (option) => option.label === "Bag red small",
      )
      if (!redOption) throw new Error("Red bag option was not exposed.")
      await selectCommerceInquiryQuoteOption(fixture.db, {
        acceptanceToken: issued.token,
        clientSelectionId: `bag-selection-${runId}`,
        optionId: redOption.id,
      })
      const accepted = await acceptCommerceInquiryQuote(fixture.db, {
        acceptanceToken: issued.token,
        clientAcceptanceId: `bag-acceptance-${runId}`,
      })
      const payment = await recordCommercialOrderPayment(fixture.db, {
        actorUserId: fixture.actorUserId,
        amountMinor: 20_000_00,
        clientPaymentId: `bag-payment-${runId}`,
        method: "pos",
        orderId: accepted.orderId,
        reference: `bag-pos-${runId}`,
        tenantId: fixture.tenantId,
      })
      const [order, fulfilment, scopedAttachment] = await Promise.all([
        fixture.db.commercialOrder.findUniqueOrThrow({
          include: { lines: true },
          where: { id: accepted.orderId },
        }),
        getServiceCommerceFulfillmentOrder(fixture.db, {
          actorUserId: fixture.actorUserId,
          orderId: accepted.orderId,
          source,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
        getAuthorizedServiceCommerceMediaAttachment(fixture.db, {
          actorUserId: fixture.actorUserId,
          attachmentId: attachment.attachment.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ])
      expect(payment).toMatchObject({
        amountPaidMinor: 20_000_00,
        balanceDueMinor: 0,
        paymentStatus: "paid",
      })
      expect(order).toMatchObject({
        amountPaidMinor: 20_000_00,
        paymentStatus: "PAID",
        totalMinor: 20_000_00,
      })
      expect(order.lines).toHaveLength(1)
      expect(order.lines[0]).toMatchObject({
        offeringId: draft.offering.id,
        totalMinor: 20_000_00,
      })
      expect(fulfilment).toMatchObject({
        fulfilmentType: "pickup",
        paid: true,
        source,
        totalMinor: 20_000_00,
      })
      expect(scopedAttachment).toMatchObject({
        mediaAsset: { lifecycle: "SAFE" },
        sourceId: source.id,
        sourceKind: "COMMERCE_INQUIRY",
      })
    })

    test("provides a non-regulated attendant, active Channel and Commerce policy", async () => {
      const [profile, binding, connection, policyCount, assignment] =
        await Promise.all([
          fixture.db.serviceCommerceStoreProfile.findFirstOrThrow({
            where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
          }),
          fixture.db.whatsAppStoreBinding.findFirstOrThrow({
            where: {
              connectionId: fixture.connectionId,
              storeId: fixture.storeId,
              tenantId: fixture.tenantId,
            },
          }),
          fixture.db.whatsAppConnection.findFirstOrThrow({
            where: { id: fixture.connectionId, tenantId: fixture.tenantId },
          }),
          fixture.db.serviceCommercePolicyDecision.count({
            where: {
              tenantId: fixture.tenantId,
              vertical: "SERVICE",
            },
          }),
          fixture.db.serviceCommerceStoreTeamAssignment.findFirstOrThrow({
            where: {
              membership: { userId: fixture.actorUserId },
              storeId: fixture.storeId,
              tenantId: fixture.tenantId,
            },
          }),
        ])

      expect(profile).toMatchObject({
        attachmentsEnabled: true,
        attachmentsProviderReady: true,
        deliveryEnabled: true,
        intakeEnabled: true,
        paymentEnabled: true,
        pickupEnabled: true,
        progressiveCatalogEnabled: true,
        quoteEnabled: true,
        status: "ACTIVE",
        whatsappEnabled: true,
      })
      expect(binding.status).toBe("ACTIVE")
      expect(connection).toMatchObject({
        billingOwner: "BUSINESS",
        status: "ACTIVE",
      })
      expect(assignment).toMatchObject({
        capability: "ATTENDANT",
        status: "ACTIVE",
      })
      expect(policyCount).toBeGreaterThan(0)
    })
  },
)
