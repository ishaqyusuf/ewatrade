import { expect, test } from "bun:test"
import { suggestCatalogCategories } from "./category-suggestions"

test("title suggestions return only bounded Shopify paths without database or provider work", async () => {
  const result = await suggestCatalogCategories(
    {} as never,
    { tenantId: "tenant", storeId: "store", actorUserId: "actor" },
    "Eggs",
  )
  expect(result.status).toBe("ready")
  expect(result.suggestions.length).toBeGreaterThan(0)
  expect(result.suggestions.length).toBeLessThanOrEqual(3)
  for (const entry of result.suggestions) {
    expect(entry.key).toMatch(/^shopify:/)
    expect(entry.category).toContain("Eggs")
    expect(entry.categoryId).toBeUndefined()
  }
})
