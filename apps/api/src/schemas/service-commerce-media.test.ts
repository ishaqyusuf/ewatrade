import { describe, expect, test } from "bun:test"

import {
  serviceCommerceMediaCommitUploadSchema,
  serviceCommerceMediaInternalReferenceSchema,
  serviceCommerceMediaObservationSchema,
  serviceCommerceMediaUploadIntentSchema,
} from "./service-commerce-media"

const uploadIntent = {
  clientMediaId: "client_media_1",
  fileName: " red-bag.jpg ",
  kind: "image",
  mimeType: "image/jpeg",
  sizeBytes: 320_000,
  source: { id: "inquiry_1", kind: "commerce_inquiry" },
  sourceLineId: "line_1",
  sourceVersion: "source_version_1",
  storeId: "store_1",
} as const

describe("Service Commerce media API contracts", () => {
  test("keeps browser upload intent metadata-only and bounded", () => {
    expect(serviceCommerceMediaUploadIntentSchema.parse(uploadIntent)).toEqual({
      ...uploadIntent,
      fileName: "red-bag.jpg",
    })
    expect(
      serviceCommerceMediaUploadIntentSchema.safeParse({
        ...uploadIntent,
        objectKey: "must-not-cross-browser-contract",
      }).success,
    ).toBe(false)
  })

  test("accepts provider identifiers only on the server-internal reference bridge", () => {
    expect(
      serviceCommerceMediaInternalReferenceSchema.parse({
        ...uploadIntent,
        channel: "whatsapp",
        provider: "meta",
        providerMediaId: "media_1",
        retentionUntil: "2027-08-10T12:00:00.000Z",
        signatureMimeType: "image/jpeg",
        tenantId: "tenant_1",
      }),
    ).toMatchObject({ provider: "meta", tenantId: "tenant_1" })
  })

  test("requires a revision guard for a human observation", () => {
    expect(
      serviceCommerceMediaObservationSchema.safeParse({
        attachmentId: "attachment_1",
        attributes: [{ name: "colour", value: "red" }],
        displayLabel: "Red bag",
        storeId: "store_1",
      }).success,
    ).toBe(false)
  })

  test("keeps private object keys on an internal upload commit contract", () => {
    expect(
      serviceCommerceMediaCommitUploadSchema.parse({
        contentDigest: "a".repeat(64),
        mediaAssetId: "asset_1",
        objectKey: "private/tenant_1/asset_1",
        storeId: "store_1",
        tenantId: "tenant_1",
        verifiedMediaType: "image/jpeg",
        verifiedSizeBytes: 320_000,
      }),
    ).toMatchObject({ mediaAssetId: "asset_1" })
  })
})
