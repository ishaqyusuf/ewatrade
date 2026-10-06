import { describe, expect, test } from "bun:test"
import {
  catalogCommandForSetupEntity,
  setupCategoryLabel,
  setupClientOperationId,
} from "./setup-commit"

const scope = {
  actorUserId: "user_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("setup commit mapping", () => {
  test("product maps canonical unit, opening stock, price and selling units", () => {
    const command = catalogCommandForSetupEntity(
      "ent_1",
      {
        kind: "product",
        name: "Eggs",
        unitName: "Piece",
        priceMinor: 15_000,
        openingStock: "600",
        categoryKey: "poultry:eggs",
        sellingUnits: [
          { name: "Crate", containsQuantity: "30", priceMinor: 450_000 },
          { name: "Piece", containsQuantity: "1" },
        ],
      },
      scope,
    )
    expect(command.kind).toBe("product")
    if (command.kind !== "product") return
    expect(command.category).toBe("Poultry / Eggs")
    expect(command.openingStockQuantity).toBe("600")
    expect(command.unitConfiguration.units).toEqual([
      {
        factor: "1",
        key: "piece",
        name: "Piece",
        stockBehavior: "canonical_shared",
        transactionScale: 2,
      },
      {
        factor: "30",
        key: "crate",
        name: "Crate",
        stockBehavior: "alternate_transaction",
        transactionScale: 2,
      },
    ])
    expect(command.variants[0]?.offerings).toEqual([
      {
        fixedPriceMinor: 15_000,
        inventoryUnitKey: "piece",
        key: "piece",
        name: "Piece",
        pricingPolicy: "fixed",
      },
      {
        fixedPriceMinor: 450_000,
        inventoryUnitKey: "crate",
        key: "crate",
        name: "Crate",
        pricingPolicy: "fixed",
      },
    ])
    expect(command).toMatchObject(scope)
  })

  test("services keep fixed or quote pricing", () => {
    const fixed = catalogCommandForSetupEntity(
      "ent_2",
      {
        kind: "service",
        name: "Delivery",
        pricing: "fixed",
        priceMinor: 100_000,
      },
      scope,
    )
    expect(fixed.variants[0]?.offerings[0]).toMatchObject({
      pricingPolicy: "fixed",
      fixedPriceMinor: 100_000,
    })
    const quote = catalogCommandForSetupEntity(
      "ent_3",
      { kind: "service", name: "Farm consulting", pricing: "quote" },
      scope,
    )
    expect(quote.variants[0]?.offerings[0]).toMatchObject({
      pricingPolicy: "quote_required",
    })
    expect(quote.variants[0]?.offerings[0]).not.toHaveProperty(
      "fixedPriceMinor",
    )
  })

  test("operation identity is stable per payload and changes after an edit", () => {
    const payload = {
      kind: "product" as const,
      name: "Eggs",
      unitName: "Crate",
    }
    const first = setupClientOperationId("ent_1", payload)
    expect(setupClientOperationId("ent_1", payload)).toBe(first)
    expect(
      setupClientOperationId("ent_1", { ...payload, priceMinor: 1 }),
    ).not.toBe(first)
    expect(first.length).toBeLessThanOrEqual(160)
  })

  test("category labels come only from known presets", () => {
    expect(setupCategoryLabel(undefined)).toBeUndefined()
    expect(setupCategoryLabel("not-a-preset")).toBeUndefined()
    expect(setupCategoryLabel("poultry")).toBe("Poultry")
  })
})
