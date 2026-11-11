import { describe, expect, test } from "bun:test"
import { catalogCreateServiceSchema } from "./catalog"
import {
  catalogPhotoGallerySchema,
  catalogPhotoIntentSchema,
  catalogPhotoMetadataSchema,
  catalogPhotoReplacementSchema,
} from "./catalog-photos"

const intent = {
  clientOperationId: "photo-operation-01",
  contentDigest: "a".repeat(64),
  contentType: "image/png" as const,
  sizeBytes: 800,
}

describe("Catalog private photo contracts", () => {
  test("option assignment and expected assignment align with their photo IDs", () => {
    const replacement = {
      catalogItemId: "item",
      clientOperationId: "assign-photo",
      assetIds: ["photo-a", "photo-b"],
      expectedAssetIds: ["photo-a"],
    }
    expect(catalogPhotoReplacementSchema.parse(replacement)).toEqual(
      replacement,
    )
    expect(
      catalogPhotoReplacementSchema.parse({
        ...replacement,
        optionVariantIds: ["variant", null],
        expectedOptionVariantIds: [null],
      }).optionVariantIds,
    ).toEqual(["variant", null])
    expect(
      catalogPhotoReplacementSchema.parse({
        ...replacement,
        photoUsages: [[null, "variant", "another"], [null]],
        expectedPhotoUsages: [[null]],
      }).photoUsages,
    ).toEqual([[null, "variant", "another"], [null]])
    for (const assignment of [
      { optionVariantIds: ["variant"] },
      { optionVariantIds: ["https://example.test/image", null] },
      { expectedOptionVariantIds: [null, null] },
      { photoUsages: [[null]] },
      { photoUsages: [[], [null]] },
      { photoUsages: [[null, null], ["variant"]] },
      { photoUsages: [[null], [null]], optionVariantIds: [null, null] },
      { expectedPhotoUsages: [[null], ["variant"]] },
    ]) {
      expect(
        catalogPhotoReplacementSchema.safeParse({
          ...replacement,
          ...assignment,
        }).success,
      ).toBe(false)
    }
  })
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

test("My images gallery accepts the infinite-list paging direction only", () => {
  expect(
    catalogPhotoGallerySchema.parse({ direction: "forward" }).direction,
  ).toBe("forward")
  expect(() =>
    catalogPhotoGallerySchema.parse({ direction: "sideways" }),
  ).toThrow()
})
