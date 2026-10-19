import { expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { catalogStockActivityDescription } from "@ewatrade/db/queries"
import { generalCatalogActivityAnswer } from "./general-catalog-history-answer"

const options = {
  tenantId: "business",
  storeId: "store",
  itemId: "original-item",
  storeName: "Original Store",
  asOf: "2026-10-15T12:00:00.000Z",
}

test("actual canonical multi-movement activity never becomes a clipped quantity, and fixed event facts plus exact catalog original survive the bounded answer", () => {
  const exact = "9007199254740993.000001"
  // Actual producer used by listCatalogItemActivity; no database, query or DTO adapter.
  const description = catalogStockActivityDescription({
    reason: "Owner retained adjustment reason ".repeat(8),
    movements: Array.from({ length: 3 }, (_, index) => ({
      enteredQuantity: exact,
      previousOnHandQuantity: "1.000001",
      resultingOnHandQuantity: exact,
      enteredInventoryUnit: { name: `Entered unit ${index} ${"u".repeat(65)}` },
      balanceSource: {
        variant: { name: `Variant ${index} ${"v".repeat(110)}` },
        inventoryUnit: { name: `Retained unit ${index} ${"r".repeat(65)}` },
      },
    })),
  })
  expect(description.length).toBeGreaterThan(1000)
  expect(description).toContain(exact)
  const row: Parameters<typeof generalCatalogActivityAnswer>[0] = {
    key: "stock:original-operation",
    at: "2026-10-14T10:05:00.000Z",
    category: "stock",
    title: "Adjustment",
    description,
    changeDirection: "mixed",
    categories: [],
    actorUserId: "original-actor",
    actorName: "Original actor",
    orderNumber: null,
    amountMinor: null,
    previousAmountMinor: null,
    currencyCode: null,
  }
  const answer = generalCatalogActivityAnswer(row, options)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  expect(answer.value).toBe(row.at)
  expect(answer.detail).toContain("Original actor")
  expect(answer.detail).toContain("description omitted")
  expect(answer.detail).toContain("details are shortened")
  expect(answer.detail).toContain("may omit movements")
  expect(answer.detail).toContain("not an operation total or stock balance")
  expect(answer.detail).not.toContain(exact)
  expect(answer.detail).not.toContain("9007199254740993.")
  expect(answer.detail.length).toBeLessThanOrEqual(1000)
  expect(answer.target).toEqual({
    kind: "catalog_item",
    catalogItemId: options.itemId,
    origin: { tenantId: options.tenantId, storeId: options.storeId },
  })
  const rendered = renderWhatsAppFinalReply(
    [{ type: "data-general-answer", data: answer }],
    {
      trustedAppOrigin: "https://dashboard.example.test",
      currentScope: { tenantId: options.tenantId, storeId: options.storeId },
    },
  )
  expect(rendered.kind).toBe("reply")
  expect(rendered.chunks.join("\n")).toContain(
    "/sales?catalogDetail=original-item",
  )
  const priced = generalCatalogActivityAnswer(
    {
      ...row,
      category: "catalog",
      description: "Saved selling price correction",
      previousAmountMinor: 10000,
      amountMinor: 12345,
      currencyCode: "NGN",
      orderNumber: "ORD-001",
    },
    options,
  )
  expect(generalAnswerSchema.safeParse(priced).success).toBe(true)
  expect(priced.detail).toContain("Previous recorded amount")
  expect(priced.detail).toContain("100.00")
  expect(priced.detail).toContain("Recorded amount")
  expect(priced.detail).toContain("123.45")
  expect(priced.detail).toContain("ORD-001")
  expect(priced.detail).toContain("Saved selling price correction")
  expect(priced.detail).not.toContain("description omitted")
})
