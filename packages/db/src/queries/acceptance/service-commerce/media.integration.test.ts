import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import { createCommerceInquiry } from "../../commerce-inquiries"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  getAuthorizedServiceCommerceMediaView,
  recordServiceCommerceMediaIntake,
} from "../../service-commerce-attachments"
import { createServiceCommerceCatalogDraft } from "../../service-commerce-catalog"
import { resolveServiceCommerceCatalogSourceLine } from "../../service-commerce-catalog-source"
import {
  recordServiceCommerceMediaSafety,
  recordStoredServiceCommerceMediaAsset,
  requestServiceCommerceMediaSafety,
} from "../../service-commerce-media-assets"
import { createServiceCommerceHumanObservation } from "../../service-commerce-observations"
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
  "Service Commerce generic media on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Prepare generic media acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await fixture.db.serviceCommerceStoreProfile.updateMany({
        data: { attachmentsProviderReady: true },
        where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate generic media acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    })

    afterAll(async () => {
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("turns a safe bag image into a human observation and private Catalog draft without exposing storage", async () => {
      const runId = randomUUID()
      const inquiry = await createCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        channelOrigin: "staff",
        clientInquiryId: `media-inquiry-${runId}`,
        customerName: "Bag customer",
        demand: {
          kind: "commerce_inquiry",
          reason: "needs_availability_confirmation",
        },
        lines: [
          {
            description: "Customer shared a bag photo",
            requestedQuantity: "1",
          },
        ],
        storeId: fixture.storeId,
        summary: "Identify and quote the bag in the image",
        tenantId: fixture.tenantId,
        vertical: "service",
      })
      const sourceLineId = inquiry.lines[0]?.id
      if (!sourceLineId) throw new Error("Inquiry line was not created.")
      const sourceRef = {
        id: inquiry.id,
        kind: "commerce_inquiry" as const,
      }
      const source = await resolveServiceCommerceCatalogSourceLine(fixture.db, {
        actorUserId: fixture.actorUserId,
        operation: "read",
        source: sourceRef,
        sourceLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const intakeInput = {
        actorUserId: fixture.actorUserId,
        channel: "staff" as const,
        clientMediaId: `bag-image-${runId}`,
        contentDigest: "a".repeat(64),
        fileName: "customer-bag.jpg",
        kind: "image" as const,
        mimeType: "image/jpeg" as const,
        privateMediaProviderReady: true,
        retentionUntil: new Date("2027-08-10T12:00:00.000Z"),
        signatureMimeType: "image/jpeg" as const,
        sizeBytes: 4,
        source: sourceRef,
        sourceLineId,
        sourceVersion: source.ref.sourceVersion,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      const intake = await recordServiceCommerceMediaIntake(
        fixture.db,
        intakeInput,
      )
      const replay = await recordServiceCommerceMediaIntake(
        fixture.db,
        intakeInput,
      )
      expect(replay).toMatchObject({
        media: { id: intake.media.id },
        replayed: true,
      })
      await recordStoredServiceCommerceMediaAsset(fixture.db, {
        actorUserId: fixture.actorUserId,
        contentDigest: "a".repeat(64),
        mediaAssetId: intake.media.id,
        objectKey: `private/${fixture.tenantId}/${intake.media.id}`,
        reason: "Neon acceptance private store",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedMediaType: "image/jpeg",
        verifiedSizeBytes: 4,
      })
      await requestServiceCommerceMediaSafety(fixture.db, {
        actorUserId: fixture.actorUserId,
        mediaAssetId: intake.media.id,
        reason: "Neon acceptance safety request",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await recordServiceCommerceMediaSafety(fixture.db, {
        actorUserId: fixture.actorUserId,
        mediaAssetId: intake.media.id,
        outcome: "safe",
        reason: "Neon acceptance deterministic safety",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const view = await getAuthorizedServiceCommerceMediaView(fixture.db, {
        actorUserId: fixture.actorUserId,
        attachmentId: intake.attachment.id,
        expiresAt: new Date(Date.now() + 60_000),
        reason: "Neon acceptance view",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(view.storageReference).toContain(intake.media.id)
      await expect(
        getAuthorizedServiceCommerceMediaView(fixture.db, {
          actorUserId: fixture.actorUserId,
          attachmentId: intake.attachment.id,
          expiresAt: new Date(Date.now() + 60_000),
          reason: "Cross-scope rejection",
          storeId: fixture.storeId,
          tenantId: "another_tenant",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })

      const observation = await createServiceCommerceHumanObservation(
        fixture.db,
        {
          actorUserId: fixture.actorUserId,
          attachmentId: intake.attachment.id,
          attributes: [
            { name: "colour", value: "red" },
            { name: "size", value: "small" },
          ],
          displayLabel: "Red small bag",
          expectedRevision: 0,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const draft = await createServiceCommerceCatalogDraft(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientOperationId: `media-catalog-${runId}`,
        draftKind: "product",
        expectedSourceFingerprint: source.ref.fingerprint,
        name: observation.displayLabel,
        source: sourceRef,
        sourceLineId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedObservationId: observation.id,
      })
      const [link, alias] = await Promise.all([
        fixture.db.catalogSourceLineLink.findUniqueOrThrow({
          where: { id: draft.link.id },
        }),
        fixture.db.catalogVerifiedAlias.findFirstOrThrow({
          where: { sourceLinkId: draft.link.id },
        }),
      ])
      expect(link).toMatchObject({
        verifiedLabel: "Red small bag",
        verifiedObservationId: observation.id,
      })
      expect(alias).toMatchObject({
        displayAlias: "Red small bag",
        verifiedByUserId: fixture.actorUserId,
      })
      expect(JSON.stringify(intake)).not.toContain("private/")
      expect(JSON.stringify(intake)).not.toContain("providerMediaId")
    })
  },
)
