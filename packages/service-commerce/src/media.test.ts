import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_MEDIA_ASSET_LIFECYCLES,
  SERVICE_COMMERCE_MEDIA_KINDS,
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENTS_PER_INTAKE,
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES,
  SERVICE_COMMERCE_MEDIA_MIME_TYPES,
  SERVICE_COMMERCE_OBSERVATION_LIFECYCLES,
  SERVICE_COMMERCE_SOURCE_ATTACHMENT_LIFECYCLES,
  canTransitionServiceCommerceHumanVerifiedObservation,
  canTransitionServiceCommerceMediaAsset,
  canTransitionServiceCommerceSourceAttachment,
  createDeterministicPrivateMediaSafetyProvider,
  createInMemoryPrivateMediaProvider,
  detectServiceCommerceMediaMimeType,
  getServiceCommerceMediaIntakeValidation,
  getServiceCommerceMediaViewerGrantState,
  getServiceCommerceObservationRevisionValidation,
  getServiceCommerceObservationValidation,
  serviceCommerceHumanVerifiedObservationSchema,
  serviceCommerceMediaAssetSchema,
  serviceCommerceSourceAttachmentSchema,
} from "."

const asset = {
  byteSize: 240_000,
  contentDigest: "a".repeat(64),
  createdAt: new Date("2026-08-10T12:00:00.000Z"),
  createdByUserId: null,
  fileName: "customer-bag.jpg",
  id: "asset-1",
  ingestionIdentity: { fingerprint: "b".repeat(64), kind: "provider" as const },
  kind: "image" as const,
  lifecycle: "safe" as const,
  mimeType: "image/jpeg" as const,
  origin: "whatsapp" as const,
  retentionClass: "baseline" as const,
  retentionDueAt: new Date("2027-08-10T12:00:00.000Z"),
  retrievalAttempts: 1,
  storageReference: "private-object-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

const attachment = {
  attachedAt: new Date("2026-08-10T12:00:01.000Z"),
  attachedByUserId: null,
  id: "attachment-1",
  lifecycle: "active" as const,
  mediaAssetId: asset.id,
  source: { id: "inquiry-1", kind: "commerce_inquiry" as const },
  sourceVersion: "3",
  storeId: "store-1",
  tenantId: "tenant-1",
}

describe("generic customer request media contracts", () => {
  test("limits the first generic media release to images and PDFs", () => {
    expect(SERVICE_COMMERCE_MEDIA_KINDS).toEqual(["image", "document"])
    expect(SERVICE_COMMERCE_MEDIA_MIME_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ])
    expect(SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES).toBe(10_000_000)
    expect(SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENTS_PER_INTAKE).toBe(12)
  })

  test("keeps private asset metadata opaque and binds one asset to a typed current source", () => {
    expect(serviceCommerceMediaAssetSchema.parse(asset)).toEqual(asset)
    expect(serviceCommerceSourceAttachmentSchema.parse(attachment)).toEqual(
      attachment,
    )
    expect(
      serviceCommerceMediaAssetSchema.safeParse({
        ...asset,
        providerMediaId: "provider-id-must-not-project",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceSourceAttachmentSchema.safeParse({
        ...attachment,
        source: { id: "request-1", kind: "customer_request" },
      }).success,
    ).toBe(false)
  })

  test("rejects browser or provider claims unless a ready server gate and matching signature allow them", () => {
    expect(
      getServiceCommerceMediaIntakeValidation({
        attachmentCount: 2,
        attachmentsEnabled: true,
        byteSize: 240_000,
        channelReady: true,
        kind: "image",
        mimeType: "image/jpeg",
        policyAllowed: true,
        privateMediaProviderReady: true,
        signatureMimeType: "image/jpeg",
      }),
    ).toEqual({ accepted: true, blockers: [] })
    expect(
      getServiceCommerceMediaIntakeValidation({
        attachmentCount: 13,
        attachmentsEnabled: false,
        byteSize: 10_000_001,
        channelReady: false,
        kind: "image",
        mimeType: "image/jpeg",
        policyAllowed: false,
        privateMediaProviderReady: false,
        signatureMimeType: "image/png",
      }),
    ).toEqual({
      accepted: false,
      blockers: [
        "attachments_disabled",
        "channel_unavailable",
        "policy_restricted",
        "private_media_provider_unavailable",
        "attachment_limit_exceeded",
        "attachment_too_large",
        "signature_mime_mismatch",
      ],
    })
  })

  test("models an explicit private asset and attachment lifecycle", () => {
    expect(SERVICE_COMMERCE_MEDIA_ASSET_LIFECYCLES).toEqual([
      "pending_upload",
      "pending_retrieval",
      "stored",
      "safety_pending",
      "safe",
      "quarantined",
      "rejected",
      "retryable",
      "retention_hold",
      "deleted",
    ])
    expect(SERVICE_COMMERCE_SOURCE_ATTACHMENT_LIFECYCLES).toEqual([
      "active",
      "replaced",
      "removed",
    ])
    expect(
      canTransitionServiceCommerceMediaAsset("safety_pending", "safe"),
    ).toBe(true)
    expect(
      canTransitionServiceCommerceMediaAsset("safe", "safety_pending"),
    ).toBe(false)
    expect(canTransitionServiceCommerceMediaAsset("deleted", "safe")).toBe(
      false,
    )
    expect(
      canTransitionServiceCommerceSourceAttachment("active", "replaced"),
    ).toBe(true)
    expect(
      canTransitionServiceCommerceSourceAttachment("replaced", "active"),
    ).toBe(false)
  })

  test("permits only an authorized, unexpired grant for a safe active attachment", () => {
    expect(
      getServiceCommerceMediaViewerGrantState({
        accessAuthorized: true,
        assetLifecycle: "safe",
        attachmentLifecycle: "active",
        expiresAt: new Date("2026-08-10T12:05:00.000Z"),
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("available")
    expect(
      getServiceCommerceMediaViewerGrantState({
        accessAuthorized: true,
        assetLifecycle: "safe",
        attachmentLifecycle: "active",
        expiresAt: new Date("2026-08-10T12:00:00.000Z"),
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("expired")
    expect(
      getServiceCommerceMediaViewerGrantState({
        accessAuthorized: true,
        assetLifecycle: "quarantined",
        attachmentLifecycle: "active",
        expiresAt: new Date("2026-08-10T12:05:00.000Z"),
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("asset_not_safe")
  })

  test("keeps private bytes and safety decisions behind provider-neutral test seams", async () => {
    let now = Date.parse("2026-08-10T12:00:00.000Z")
    const privateMedia = createInMemoryPrivateMediaProvider({ now: () => now })
    const stored = await privateMedia.store({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "customer-bag.jpg",
      mediaAssetId: asset.id,
      mimeType: asset.mimeType,
    })
    expect(stored.storageReference).toBe(`memory:${asset.id}`)
    expect(
      await privateMedia.read({
        mediaAssetId: asset.id,
        storageReference: stored.storageReference,
      }),
    ).toMatchObject({ fileName: "customer-bag.jpg", mimeType: "image/jpeg" })
    const grant = await privateMedia.createViewerGrant({
      expiresAt: new Date(now + 60_000),
      mediaAssetId: asset.id,
      storageReference: stored.storageReference,
    })
    expect(grant.url).toStartWith("/api/service-commerce/media/")
    const token = grant.url.split("/").at(-1) ?? ""
    expect(privateMedia.consumeViewerGrant(token).bytes).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(() => privateMedia.consumeViewerGrant(token)).toThrow()
    const expiredGrant = await privateMedia.createViewerGrant({
      expiresAt: new Date(now + 60_000),
      mediaAssetId: asset.id,
      storageReference: stored.storageReference,
    })
    now += 61_000
    expect(() =>
      privateMedia.consumeViewerGrant(expiredGrant.url.split("/").at(-1) ?? ""),
    ).toThrow()

    const safety = createDeterministicPrivateMediaSafetyProvider({
      outcomesByContentDigest: { [asset.contentDigest]: "quarantined" },
    })
    expect(
      await safety.inspect({
        byteSize: asset.byteSize,
        contentDigest: asset.contentDigest,
        mediaAssetId: asset.id,
        mimeType: asset.mimeType,
        storageReference: stored.storageReference,
      }),
    ).toEqual({ lifecycle: "quarantined" })

    await privateMedia.delete({
      mediaAssetId: asset.id,
      storageReference: stored.storageReference,
    })
    await expect(
      privateMedia.delete({
        mediaAssetId: asset.id,
        storageReference: stored.storageReference,
      }),
    ).resolves.toBeUndefined()
  })

  test("detects the allowlisted signatures instead of trusting client metadata", () => {
    expect(
      detectServiceCommerceMediaMimeType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png")
    expect(
      detectServiceCommerceMediaMimeType(
        new TextEncoder().encode("%PDF-1.7 private customer document"),
      ),
    ).toBe("application/pdf")
    expect(
      detectServiceCommerceMediaMimeType(new TextEncoder().encode("not-media")),
    ).toBeNull()
  })

  test("requires attributable human meaning from a safe current attachment before Catalog seams may consume it", () => {
    expect(SERVICE_COMMERCE_OBSERVATION_LIFECYCLES).toEqual([
      "current",
      "superseded",
      "withdrawn",
    ])
    const observation = {
      attachmentId: attachment.id,
      attributes: [
        { name: "colour", value: "red" },
        { name: "size", value: "small" },
      ],
      displayLabel: "Red small bag",
      id: "observation-1",
      lifecycle: "current" as const,
      revision: 1,
      sourceLineId: "line-1",
      sourceVersion: "3",
      verifiedAt: new Date("2026-08-10T12:00:00.000Z"),
      verifiedByUserId: "user-1",
    }
    expect(
      serviceCommerceHumanVerifiedObservationSchema.parse(observation),
    ).toEqual(observation)
    expect(
      getServiceCommerceObservationValidation({
        assetLifecycle: "safe",
        attachmentLifecycle: "active",
        currentSourceVersion: "3",
        observation,
      }),
    ).toBe("valid")
    expect(
      getServiceCommerceObservationValidation({
        assetLifecycle: "safe",
        attachmentLifecycle: "active",
        currentSourceVersion: "4",
        observation,
      }),
    ).toBe("stale_source")
    expect(
      getServiceCommerceObservationValidation({
        assetLifecycle: "retryable",
        attachmentLifecycle: "active",
        currentSourceVersion: "3",
        observation,
      }),
    ).toBe("asset_not_safe")
    expect(
      canTransitionServiceCommerceHumanVerifiedObservation(
        "current",
        "superseded",
      ),
    ).toBe(true)
    expect(
      canTransitionServiceCommerceHumanVerifiedObservation(
        "superseded",
        "current",
      ),
    ).toBe(false)
    expect(
      getServiceCommerceObservationRevisionValidation({
        currentObservation: observation,
        expectedRevision: 1,
      }),
    ).toBe("valid")
    expect(
      getServiceCommerceObservationRevisionValidation({
        currentObservation: observation,
        expectedRevision: 2,
      }),
    ).toBe("stale_observation")
  })
})
