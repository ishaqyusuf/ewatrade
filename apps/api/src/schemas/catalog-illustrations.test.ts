import { expect, test } from "bun:test"
import { catalogCreateItemSchema } from "./catalog"
import { catalogPhotoReplacementSchema } from "./catalog-photos"

const service = {
  kind: "service",
  name: "Cleaning",
  clientOperationId: "illustration-create-01",
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
const replacement = {
  catalogItemId: "item-1",
  clientOperationId: "illustration-replace-01",
  assetIds: [],
}

test("creation rejects unknown curated identities and mixed media", () => {
  expect(
    catalogCreateItemSchema.safeParse({ ...service, illustrationId: "ill-egg" })
      .success,
  ).toBe(true)
  expect(
    catalogCreateItemSchema.safeParse({
      ...service,
      illustrationId: "https://example.com/image.svg",
    }).success,
  ).toBe(false)
  expect(
    catalogCreateItemSchema.safeParse({
      ...service,
      illustrationId: "ill-egg",
      photoAssetIds: ["photo-1"],
    }).success,
  ).toBe(false)
})

test("replacement distinguishes omitted, cleared and selected illustrations", () => {
  expect(
    catalogPhotoReplacementSchema.parse(replacement).illustrationId,
  ).toBeUndefined()
  expect(
    catalogPhotoReplacementSchema.parse({
      ...replacement,
      illustrationId: null,
    }).illustrationId,
  ).toBeNull()
  expect(
    catalogPhotoReplacementSchema.parse({
      ...replacement,
      illustrationId: "ill-egg",
    }).illustrationId,
  ).toBe("ill-egg")
  expect(
    catalogPhotoReplacementSchema.safeParse({
      ...replacement,
      illustrationId: "unknown",
    }).success,
  ).toBe(false)
  expect(
    catalogPhotoReplacementSchema.safeParse({
      ...replacement,
      illustrationId: "ill-egg",
      assetIds: ["photo-1"],
    }).success,
  ).toBe(false)
  expect(
    catalogPhotoReplacementSchema.safeParse({
      ...replacement,
      illustrationId: null,
      assetIds: ["photo-1"],
    }).success,
  ).toBe(true)
})
