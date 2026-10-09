import { describe, expect, test } from "bun:test"
import {
  type SetupDraftEntityWrite,
  createSetupAssistantTools,
} from "../setup/tools"
import { effectiveAssistantAllowance } from "./allowance"
import {
  type ProductFormSnapshot,
  productCreationReady,
  productFormSnapshotSchema,
  productHandbackSnapshot,
  productRequiresForm,
  productSeed,
} from "./contracts"

function productSnapshot(): ProductFormSnapshot {
  return {
    form: {
      kind: "product",
      name: "Eggs",
      description: "",
      unitName: "Egg",
      price: "150",
      openingStockQuantity: "0",
      usage: "FOR_SALE",
    },
    storeId: "store_1",
    category: "",
    illustrationId: null,
    photoAssetIds: [],
    sku: "",
    barcode: "",
    showAdvanced: false,
    showUnits: false,
    showDescription: false,
    showOpeningStock: true,
    selectedHelperKey: null,
    canonicalTransactionScale: 2,
    optionGroups: [{ id: "group", name: "", values: "" }],
    variantDrafts: {},
    additionalUnits: [],
  }
}
describe("focused product contract", () => {
  test("reordered and renamed selling units keep unique IDs and exact conversions", () => {
    const original = productSnapshot()
    original.additionalUnits = [
      {
        id: "tray-id",
        name: "Tray",
        price: "4500",
        referenceId: "canonical",
        relationCount: "30",
        relationDirection: "canonical_per_unit",
        stockBehavior: "alternate_transaction",
        transactionScale: 2,
      },
      {
        id: "box-id",
        name: "Box",
        price: "9000",
        referenceId: "canonical",
        relationCount: "60",
        relationDirection: "canonical_per_unit",
        stockBehavior: "alternate_transaction",
        transactionScale: 2,
      },
    ]
    const result = productHandbackSnapshot(original, {
      kind: "product",
      name: "Eggs",
      unitName: "Egg",
      sellingUnits: [
        { name: "Box", containsQuantity: "60", priceMinor: 900000 },
        { name: "Crate", containsQuantity: "120", priceMinor: 1800000 },
      ],
    })
    expect(result.additionalUnits[0]?.id).toBe("box-id")
    expect(result.additionalUnits[1]?.id).not.toBe("box-id")
    expect(result.additionalUnits.map((unit) => unit.relationCount)).toEqual([
      "60",
      "120",
    ])
    expect(productFormSnapshotSchema.safeParse(result).success).toBe(true)
    const duplicate = {
      ...result,
      additionalUnits: result.additionalUnits.map((unit) => ({
        ...unit,
        id: "duplicate",
      })),
    }
    expect(productFormSnapshotSchema.safeParse(duplicate).success).toBe(false)
  })
  test("handback restores latest corrections on reload and repeated unit edits", () => {
    const original = productSnapshot()
    original.sku = "PRESERVED"
    original.photoAssetIds = ["private-photo"]
    const first = productHandbackSnapshot(original, {
      kind: "product",
      name: "Large eggs",
      unitName: "Egg",
      priceMinor: 18000,
      openingStock: "0",
      sellingUnits: [
        { name: "Tray", containsQuantity: "30", priceMinor: 510000 },
      ],
    })
    expect(first.form).toMatchObject({
      name: "Large eggs",
      price: "180",
      openingStockQuantity: "0",
    })
    expect(first.sku).toBe("PRESERVED")
    expect(first.photoAssetIds).toEqual(["private-photo"])
    const second = productHandbackSnapshot(first, {
      kind: "product",
      name: "Large eggs",
      unitName: "Egg",
      sellingUnits: [
        { name: "Large tray", containsQuantity: "24", priceMinor: 430000 },
      ],
    })
    expect(second.additionalUnits[0]).toMatchObject({
      id: first.additionalUnits[0]?.id,
      name: "Large tray",
      relationCount: "24",
      price: "4300",
    })
    const firstUnit = first.additionalUnits[0]
    if (!firstUnit) throw new Error("Handback must preserve the selling unit")
    firstUnit.stockBehavior = "packaged_stock"
    expect(
      productHandbackSnapshot(first, {
        kind: "product",
        name: "Eggs",
        unitName: "Egg",
        sellingUnits: [{ name: "Changed", containsQuantity: "20" }],
      }).additionalUnits,
    ).toEqual(first.additionalUnits)
  })
  test("owner seed keeps explicit zero stock and exact price", () => {
    const seed = productSeed(productSnapshot())
    expect(seed?.payload.priceMinor).toBe(15000)
    expect(seed?.payload.openingStock).toBe("0")
    expect(productCreationReady(seed?.payload, productSnapshot())).toBe(true)
    const unknown = productSnapshot()
    unknown.form.openingStockQuantity = ""
    expect(productSeed(unknown)?.payload.openingStock).toBeUndefined()
  })
  test("internal use needs no price; sale and every selling unit do", () => {
    const snapshot = productSnapshot()
    snapshot.form.price = ""
    expect(productCreationReady(productSeed(snapshot)?.payload, snapshot)).toBe(
      false,
    )
    snapshot.form.usage = "INTERNAL_USE"
    expect(productCreationReady(productSeed(snapshot)?.payload, snapshot)).toBe(
      true,
    )
    const sale = productSeed(productSnapshot())?.payload
    expect(
      productCreationReady(
        { ...sale, sellingUnits: [{ name: "Tray", containsQuantity: "30" }] },
        productSnapshot(),
      ),
    ).toBe(false)
  })
  test("advanced fields and private photo IDs survive validation and force manual creation", () => {
    const snapshot = productSnapshot()
    snapshot.sku = "MY-SKU"
    snapshot.photoAssetIds = ["asset_1"]
    snapshot.variantDrafts = {
      v: {
        barcode: "123",
        enabled: true,
        price: "150",
        quantity: "5",
        quoteRequired: false,
        sku: "RED",
        storeIds: ["store_1"],
        unitPrices: { tray: "4500" },
      },
    }
    expect(productFormSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(productRequiresForm(snapshot)).toBe(true)
    expect(productCreationReady(productSeed(snapshot)?.payload, snapshot)).toBe(
      false,
    )
    expect(
      productFormSnapshotSchema.safeParse({ ...snapshot, unexpected: "no" })
        .success,
    ).toBe(false)
  })
  test("blank-start staging and a rename always update one stable product key", async () => {
    let rows: SetupDraftEntityWrite[] = []
    const tools = createSetupAssistantTools({
      productOnly: true,
      context: {
        businessName: "Farm",
        storeName: "Main",
        businessProfile: null,
        operatingModel: "products",
        currencyCode: "NGN",
        countryCode: "NG",
        existing: { catalogItems: 5, customers: 3 },
      },
      sourceMessageId: "msg",
      readDraft: async () => rows,
      writeEntities: async (entities) => {
        rows = entities
        return {
          revision: 1,
          changed: entities.map((entity) => entity.key),
          rejected: [],
        }
      },
      removeEntities: async () => ({ revision: 1 }),
    })
    const execute = tools.setup_draft_upsert_items.execute
    if (!execute)
      throw new Error("The product staging tool must be executable.")
    const options = { toolCallId: "test", messages: [] }
    await execute(
      {
        items: [
          { kind: "product", name: "Eggs", unitName: "Egg", price: "150" },
        ],
      },
      options,
    )
    expect(rows.map((row) => row.key)).toEqual(["product"])
    await execute(
      {
        items: [
          {
            kind: "product",
            name: "Large eggs",
            unitName: "Egg",
            price: "180",
          },
        ],
      },
      options,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.payload).toMatchObject({ name: "Large eggs" })
    const refused = await execute(
      { items: [{ kind: "service", name: "Cleaning" }] },
      options,
    )
    expect(refused.status).toBe("failed")
    expect(rows).toHaveLength(1)
    const multiple = await execute(
      {
        items: [
          { kind: "product", name: "Eggs" },
          { kind: "product", name: "Feed" },
        ],
      },
      options,
    )
    expect(multiple.status).toBe("failed")
    const missingUnit = await execute(
      { items: [{ kind: "product", name: "Eggs", price: "150" }] },
      options,
    )
    expect(missingUnit.status).toBe("failed")
  })
})
describe("read-only business allowance", () => {
  const limits = {
    maxTokens: 1000000,
    maxRequests: 60,
    windowMs: 30 * 86400000,
  }
  const now = new Date("2026-10-09T10:00:00Z")
  test("unstarted and expired windows show full allowance without inventing a reset date", () => {
    expect(effectiveAssistantAllowance(null, limits, now)).toMatchObject({
      tokensUsed: 0,
      tokensRemaining: 1000000,
      requestsRemaining: 60,
      resetsAt: null,
    })
    const old = {
      tokens: 999999,
      requests: 60,
      windowStartedAt: new Date("2026-09-01"),
    }
    expect(effectiveAssistantAllowance(old, limits, now).exhausted).toBe(false)
    expect(old.requests).toBe(60)
  })
  test("active usage reports actual tokens, clamped remaining and independent turn exhaustion", () => {
    const budget = {
      tokens: 1000500,
      requests: 3,
      windowStartedAt: new Date("2026-10-01"),
    }
    expect(effectiveAssistantAllowance(budget, limits, now)).toMatchObject({
      tokensUsed: 1000500,
      tokensRemaining: 0,
      requestsRemaining: 57,
      exhausted: true,
      resetsAt: new Date("2026-10-31"),
    })
    expect(
      effectiveAssistantAllowance(
        { ...budget, tokens: 10, requests: 60 },
        limits,
        now,
      ).exhausted,
    ).toBe(true)
  })
})
