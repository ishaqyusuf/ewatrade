import { expect, test } from "bun:test"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import type { Prisma } from "../../generated/prisma/client"
import { previewCatalogCategoryLabel } from "./catalog-categories"

function reader(labels: string[]) {
  const reads: unknown[] = []
  const db = {
    catalogCategory: {
      findUnique: async (args: unknown) => {
        reads.push(args)
        const label = labels.shift()
        return label ? { id: "existing-root", label } : null
      },
    },
  } as unknown as Prisma.TransactionClient
  return { db, reads }
}
test("category preview does not write and preserves existing business spelling", async () => {
  const { db, reads } = reader(["QA Produce"])
  expect(await previewCatalogCategoryLabel(db, "tenant", " qa produce ")).toBe(
    "QA Produce",
  )
  expect(reads).toHaveLength(1)
  expect(reads[0]).toMatchObject({
    where: { tenantId_key: { tenantId: "tenant" } },
  })
})
test("category preview returns new labels and explicit clearing without writes", async () => {
  const { db, reads } = reader([])
  expect(await previewCatalogCategoryLabel(db, "tenant", null)).toBeNull()
  expect(reads).toHaveLength(0)
  expect(await previewCatalogCategoryLabel(db, "tenant", "New category")).toBe(
    "New category",
  )
})
test("preset category previews preserve saved parent and child labels", async () => {
  const preset = CATALOG_CATEGORY_PRESETS.find(
    (p) => p.subcategories.length > 0,
  )
  if (!preset) throw Error("Expected a category preset")
  const { db, reads } = reader(["Saved parent", "Saved child"])
  expect(
    await previewCatalogCategoryLabel(
      db,
      "tenant",
      `${preset.label} / New child`,
    ),
  ).toBe("Saved parent / Saved child")
  expect(reads).toHaveLength(2)
})
