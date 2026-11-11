import { expect, test } from "bun:test"
import {
  type CatalogAiClientJob,
  type CatalogImageReplacement,
  applyCatalogAiJobs,
  catalogImageVariantIds,
  catalogImagesForOption,
  catalogRefinementDescendants,
} from "./catalog-image-editor"
function job(
  id: string,
  patch: Partial<CatalogAiClientJob> = {},
): CatalogAiClientJob {
  return {
    id,
    state: "DELIVERED",
    mode: "generate",
    sourceAssetId: null,
    rootAssetId: null,
    outputAssetId: id,
    appliedAt: null,
    ...patch,
  }
}
test("one generated image is added once, while refinements replace the original slot", () => {
  const seen = new Set<string>()
  const refined = job("new", {
    mode: "refine",
    sourceAssetId: "original",
    rootAssetId: "original",
  })
  const replacements: CatalogImageReplacement[] = []
  const output = applyCatalogAiJobs(
    ["original", "other"],
    [refined],
    seen,
    replacements,
  )
  expect(output).toEqual(["new", "other"])
  expect(
    catalogImageVariantIds(
      output,
      { original: "day-old", other: null },
      replacements,
    ),
  ).toEqual(["day-old", null])
  expect(applyCatalogAiJobs(output, [refined], seen)).toEqual(output)
  expect(applyCatalogAiJobs(output, [job("generated")], seen)).toEqual([
    "new",
    "other",
    "generated",
  ])
})

test("a selected variant wins over general photos and other options never serve as fallback", () => {
  const photos = [
    { id: "option", optionVariantId: "day-old" },
    { id: "legacy" },
    { id: "general", optionVariantId: null },
  ]
  expect(
    catalogImagesForOption(photos, "day-old").map((photo) => photo.id),
  ).toEqual(["option"])
  expect(
    catalogImagesForOption(photos, "grown").map((photo) => photo.id),
  ).toEqual(["legacy", "general"])
  expect(catalogImagesForOption(photos).map((photo) => photo.id)).toEqual([
    "legacy",
    "general",
  ])
  expect(catalogImagesForOption(photos.slice(0, 1), "grown")).toEqual([])
})
test("saved choice of original is not overwritten by replayed historical delivery", () => {
  expect(
    applyCatalogAiJobs(
      ["original"],
      [
        job("edit", {
          mode: "refine",
          sourceAssetId: "original",
          rootAssetId: "original",
          appliedAt: new Date(),
        }),
      ],
      new Set(),
    ),
  ).toEqual(["original"])
  expect(
    applyCatalogAiJobs(
      ["original"],
      [job("pending", { state: "UNCERTAIN", outputAssetId: null })],
      new Set(),
    ),
  ).toEqual(["original"])
})
test("deleting a version includes its descendants but preserves siblings and original", () => {
  const versions = [
    { assetId: "later", sourceAssetId: "edit" },
    { assetId: "original", sourceAssetId: null },
    { assetId: "sibling", sourceAssetId: "original" },
    { assetId: "edit", sourceAssetId: "original" },
  ]
  expect(catalogRefinementDescendants(versions, "edit").sort()).toEqual([
    "edit",
    "later",
  ])
})
