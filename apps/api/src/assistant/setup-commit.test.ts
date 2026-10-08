import { describe, expect, test } from "bun:test"
import { deriveSetupEntityState } from "@ewatrade/assistant/setup/contracts"
import { CatalogError, createCatalogItem } from "@ewatrade/db/queries"
import {
  MAX_SETUP_VARIANTS,
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

/** Validation runs before the transaction; reaching it proves the command is accepted. */
const reachedDatabase = new Error("reached the database")
const validationOnlyDb = {
  $transaction: () => {
    throw reachedDatabase
  },
} as never

describe("setup options become catalog variants", () => {
  const fabric = {
    kind: "product" as const,
    name: "Ankara fabric",
    unitName: "Yard",
    priceMinor: 350_000,
    sellingUnits: [
      { name: "Bundle", containsQuantity: "6", priceMinor: 2_000_000 },
    ],
    options: [
      { name: "Size", values: ["Small", "Large", "small"] },
      { name: "Colour", values: ["Red", "Blue"] },
    ],
  }

  test("every combination is a variant with its own offerings", async () => {
    const command = catalogCommandForSetupEntity("ent_9", fabric, scope)
    if (command.kind !== "product") throw new Error("expected a product")
    expect(command.optionGroups).toEqual([
      {
        key: "size",
        name: "Size",
        values: [
          { key: "small", label: "Small" },
          { key: "large", label: "Large" },
        ],
      },
      {
        key: "colour",
        name: "Colour",
        values: [
          { key: "red", label: "Red" },
          { key: "blue", label: "Blue" },
        ],
      },
    ])
    expect(
      command.variants.map((variant) => [
        variant.key,
        variant.name,
        variant.isDefault,
      ]),
    ).toEqual([
      ["small-red", "Small / Red", true],
      ["small-blue", "Small / Blue", false],
      ["large-red", "Large / Red", false],
      ["large-blue", "Large / Blue", false],
    ])
    expect(command.variants[3]?.selections).toEqual([
      { groupKey: "size", valueKey: "large" },
      { groupKey: "colour", valueKey: "blue" },
    ])
    expect(command.variants[0]?.offerings).toEqual([
      {
        fixedPriceMinor: 350_000,
        inventoryUnitKey: "yard",
        key: "small-red-yard",
        name: "Yard",
        pricingPolicy: "fixed",
      },
      {
        fixedPriceMinor: 2_000_000,
        inventoryUnitKey: "bundle",
        key: "small-red-bundle",
        name: "Bundle",
        pricingPolicy: "fixed",
      },
    ])
    await expect(createCatalogItem(validationOnlyDb, command)).rejects.toBe(
      reachedDatabase,
    )
  })

  test("products without options keep the single default variant", async () => {
    const command = catalogCommandForSetupEntity(
      "ent_10",
      { kind: "product", name: "Eggs", unitName: "Crate", priceMinor: 450_000 },
      scope,
    )
    expect(command.variants.map((variant) => variant.key)).toEqual(["default"])
    expect(command).not.toHaveProperty("optionGroups")
    await expect(createCatalogItem(validationOnlyDb, command)).rejects.toBe(
      reachedDatabase,
    )
  })

  test("items used but not sold need no price and keep their stock", async () => {
    const command = catalogCommandForSetupEntity(
      "ent_11",
      {
        kind: "product",
        name: "Grower feed",
        unitName: "Bag",
        openingStock: "12",
        usage: "INTERNAL_USE",
      },
      scope,
    )
    expect(command).toMatchObject({
      kind: "product",
      usage: "INTERNAL_USE",
      openingStockQuantity: "12",
    })
    await expect(createCatalogItem(validationOnlyDb, command)).rejects.toBe(
      reachedDatabase,
    )
  })

  test("a recommended illustration is added with the product or service", async () => {
    const egg = catalogCommandForSetupEntity(
      "ent_12",
      {
        kind: "product",
        name: "Crate of eggs",
        unitName: "Crate",
        priceMinor: 450_000,
        illustrationId: "ill-egg",
      },
      scope,
    )
    expect(egg).toMatchObject({ illustrationId: "ill-egg" })
    await expect(createCatalogItem(validationOnlyDb, egg)).rejects.toBe(
      reachedDatabase,
    )
    const shirt = catalogCommandForSetupEntity(
      "ent_13",
      {
        kind: "service",
        name: "Shirt wash",
        pricing: "fixed",
        priceMinor: 50_000,
        illustrationId: "ill-shirt",
      },
      scope,
    )
    expect(shirt).toMatchObject({ illustrationId: "ill-shirt" })
    await expect(createCatalogItem(validationOnlyDb, shirt)).rejects.toBe(
      reachedDatabase,
    )
    // The owner removed it: nothing is attached.
    expect(
      catalogCommandForSetupEntity(
        "ent_14",
        {
          kind: "product",
          name: "Eggs",
          unitName: "Crate",
          priceMinor: 450_000,
          illustrationId: null,
        },
        scope,
      ),
    ).not.toHaveProperty("illustrationId")
  })

  test("a total stock with options and oversized grids are refused clearly", () => {
    expect(() =>
      catalogCommandForSetupEntity(
        "ent_11",
        { ...fabric, openingStock: "40" },
        scope,
      ),
    ).toThrow(CatalogError)
    const values = Array.from({ length: 7 }, (_, index) => `V${index}`)
    expect(() =>
      catalogCommandForSetupEntity(
        "ent_12",
        {
          ...fabric,
          options: [
            { name: "A", values },
            { name: "B", values },
          ],
        },
        scope,
      ),
    ).toThrow(`49 option combinations. Keep it to ${MAX_SETUP_VARIANTS}`)
    // The owner sees the stock conflict before confirming.
    expect(
      deriveSetupEntityState({ ...fabric, openingStock: "40" }, []).state,
    ).toBe("NEEDS_INPUT")
    expect(deriveSetupEntityState(fabric, []).state).toBe("PROPOSED")
  })
})
