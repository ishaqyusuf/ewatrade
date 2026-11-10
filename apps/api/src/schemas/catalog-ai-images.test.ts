import { expect, test } from "bun:test"
import {
  catalogAiDeleteVersionSchema,
  catalogAiStartSchema,
} from "./catalog-ai-images"
const base = {
  clientOperationId: "00000000-0000-4000-8000-000000000000",
  contextKey: "new-draft",
  facts: { kind: "PRODUCT", name: "Tote" },
}
test("clients cannot choose tenant, provider, cost, output count or safety verdict", () => {
  expect(catalogAiStartSchema.parse(base).note).toBe("")
  for (const field of [
    "tenantId",
    "provider",
    "model",
    "costMicros",
    "count",
    "approved",
  ])
    expect(
      catalogAiStartSchema.safeParse({ ...base, [field]: "untrusted" }).success,
    ).toBe(false)
  expect(
    catalogAiStartSchema.safeParse({
      ...base,
      sourceAssetId: "https://private.invalid",
    }).success,
  ).toBe(false)
})
test("refinement deletion requires the exact reviewed version set", () => {
  expect(
    catalogAiDeleteVersionSchema.safeParse({
      assetId: "photo",
      clientOperationId: base.clientOperationId,
    }).success,
  ).toBe(false)
  expect(
    catalogAiDeleteVersionSchema.parse({
      assetId: "photo",
      clientOperationId: base.clientOperationId,
      expectedVersionAssetIds: ["photo"],
    }).assetId,
  ).toBe("photo")
})
