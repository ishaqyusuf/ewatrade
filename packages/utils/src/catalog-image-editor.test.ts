import { expect, test } from "bun:test"
import {
  type CatalogAiClientJob,
  applyCatalogAiJobs,
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
  const output = applyCatalogAiJobs(["original", "other"], [refined], seen)
  expect(output).toEqual(["new", "other"])
  expect(applyCatalogAiJobs(output, [refined], seen)).toEqual(output)
  expect(applyCatalogAiJobs(output, [job("generated")], seen)).toEqual([
    "new",
    "other",
    "generated",
  ])
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
