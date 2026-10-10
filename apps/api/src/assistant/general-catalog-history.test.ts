import { expect, test } from "bun:test"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import { generalCatalogHistoryInput } from "./general-catalog-history"

test("catalog history inputs allow continuation but never authority overrides", () => {
  expect(generalCatalogHistoryInput.parse({ itemId: "item" })).toEqual({
    itemId: "item",
    mode: "activity",
    category: "all",
  })
  expect(
    generalCatalogHistoryInput.safeParse({
      itemId: "item",
      cursor: { at: "2026-10-10T00:00:00Z", key: "price:id" },
    }).success,
  ).toBe(true)
  for (const patch of [
    { storeId: "other" },
    { tenantId: "other" },
    { inventory: true },
    { limit: 100 },
    { mode: "write" },
  ])
    expect(
      generalCatalogHistoryInput.safeParse({ itemId: "item", ...patch })
        .success,
    ).toBe(false)
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "item activity item category stock" },
    ]),
  ).toMatchObject({
    toolName: "readCatalogHistory",
    input: { mode: "activity", itemId: "item", category: "stock" },
  })
})
