import { expect, test } from "bun:test"
import { catalogAiChoiceInputs } from "@ewatrade/utils/catalog-ai-images"
import {
  catalogAiCancelSchema,
  catalogAiDeleteVersionSchema,
  catalogAiStartBatchSchema,
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

test("a choice run rejects duplicate choices and refinement fields", () => {
  const first = { id: "variant-1", name: "Day-old" }
  const second = { id: "variant-2", name: "Fully grown" }
  expect(
    catalogAiStartBatchSchema.parse({ ...base, choices: [first, second] })
      .choices,
  ).toEqual([first, second])
  for (const choices of [[], [first, { ...first, name: "Duplicate" }]]) {
    expect(
      catalogAiStartBatchSchema.safeParse({ ...base, choices }).success,
    ).toBe(false)
  }
  expect(
    catalogAiStartBatchSchema.safeParse({
      ...base,
      choices: [first],
      sourceAssetId: "existing-photo",
    }).success,
  ).toBe(false)
  expect(
    catalogAiCancelSchema.safeParse({
      contextKey: "new-draft",
      jobIds: ["job-id"],
      tenantId: "untrusted",
    }).success,
  ).toBe(false)
})

test("saved Catalog choices send only their ID and name to the batch API", () => {
  const variants = [
    { id: "variant-1", name: "Day-old", status: "active", selections: [] },
    { id: "variant-2", name: "Fully grown", status: "active", selections: [] },
  ]
  expect(
    catalogAiStartBatchSchema.safeParse({ ...base, choices: variants }).success,
  ).toBe(false)
  expect(
    catalogAiStartBatchSchema.parse({
      ...base,
      choices: catalogAiChoiceInputs(variants),
    }).choices,
  ).toEqual([
    { id: "variant-1", name: "Day-old" },
    { id: "variant-2", name: "Fully grown" },
  ])
})
