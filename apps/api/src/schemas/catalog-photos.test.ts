import { describe, expect, test } from "bun:test"
import { catalogCreateServiceSchema } from "./catalog"
import {
  catalogPhotoIntentSchema,
  catalogPhotoMetadataSchema,
} from "./catalog-photos"

const intent = {
  clientOperationId: "photo-operation-01",
  contentDigest: "a".repeat(64),
  contentType: "image/png" as const,
  sizeBytes: 800,
}

describe("Catalog private photo contracts", () => {
  test("accepts normalized contents and refuses client authority or URLs", () => {
    expect(catalogPhotoIntentSchema.parse(intent)).toEqual(intent)
    for (const field of [
      "actorUserId",
      "tenantId",
      "storagePath",
      "imageUrl",
      "state",
      "approved",
    ])
      expect(
        catalogPhotoIntentSchema.safeParse({
          ...intent,
          [field]: "client-value",
        }).success,
      ).toBe(false)
    expect(
      catalogPhotoMetadataSchema.safeParse({
        assetId: "asset-1",
        storeId: "store-1",
      }).success,
    ).toBe(true)
    expect(
      catalogPhotoMetadataSchema.safeParse({ assetId: "../other-store/file" })
        .success,
    ).toBe(false)
  })
  test("enforces digest, normalization, integer size and selection limit", () => {
    for (const override of [
      { contentDigest: "not-a-digest" },
      { contentType: "image/svg+xml" },
      { sizeBytes: 0 },
      { sizeBytes: 1.5 },
      { sizeBytes: 10 * 1024 * 1024 + 1 },
    ])
      expect(
        catalogPhotoIntentSchema.safeParse({ ...intent, ...override }).success,
      ).toBe(false)
  })
  test("item creation accepts distinct asset IDs without changing legacy omission", () => {
    const item = {
      clientOperationId: "item-with-photos-01",
      kind: "service",
      name: "Cleaning",
      variants: [
        {
          key: "default",
          name: "Cleaning",
          isDefault: true,
          offerings: [
            {
              key: "cleaning",
              name: "Cleaning",
              pricingPolicy: "fixed",
              fixedPriceMinor: 1000,
            },
          ],
        },
      ],
    }
    expect(catalogCreateServiceSchema.parse(item).photoAssetIds).toBeUndefined()
    expect(
      catalogCreateServiceSchema.parse({
        ...item,
        photoAssetIds: ["photo-a", "photo-b"],
      }).photoAssetIds,
    ).toEqual(["photo-a", "photo-b"])
    for (const photoAssetIds of [
      ["photo-a", "photo-a"],
      ["../photo"],
      Array.from({ length: 9 }, (_, index) => `photo-${index}`),
    ])
      expect(
        catalogCreateServiceSchema.safeParse({ ...item, photoAssetIds })
          .success,
      ).toBe(false)
  })
})
