import { expect, test } from "bun:test"
import {
  type SetupDraftEntityWrite,
  createSetupAssistantTools,
  productDraftKeys,
} from "./tools"

function productTools(productLimit?: number) {
  let rows: SetupDraftEntityWrite[] = []
  const tools = createSetupAssistantTools({
    productOnly: true,
    productLimit,
    context: {
      businessName: "Mama Ada Provisions",
      storeName: "Yaba Main",
      businessProfile: null,
      operatingModel: "products",
      currencyCode: "NGN",
      countryCode: "NG",
      existing: { catalogItems: 0, customers: 0 },
    },
    sourceMessageId: "msg",
    readDraft: async () => rows,
    writeEntities: async (entities) => {
      rows = [
        ...rows.filter(
          (row) => !entities.some((entity) => entity.key === row.key),
        ),
        ...entities,
      ]
      return {
        revision: 1,
        changed: entities.map((entity) => entity.key),
        rejected: [],
      }
    },
    removeEntities: async () => ({ revision: 1 }),
  })
  const execute = tools.setup_draft_upsert_items.execute
  if (!execute) throw Error("staging tool missing")
  const run = async (input: Parameters<typeof execute>[0]) => {
    const result = await execute(input, { toolCallId: "t", messages: [] })
    if (Symbol.asyncIterator in result) throw Error("must not stream")
    return result as { status: string; warnings: string[] }
  }
  return { run, rows: () => rows }
}
const oil = {
  kind: "product" as const,
  name: "Groundnut Oil 3L",
  unitName: "bottle",
  price: "8900",
}
const beans = {
  kind: "product" as const,
  name: "Brown Beans",
  unitName: "kg",
  price: "1900",
}
const rice = {
  kind: "product" as const,
  name: "Ofada Rice 5kg",
  unitName: "bag",
  price: "11000",
}

test("the app's Product chat still stages exactly one product", async () => {
  const tools = productTools()
  expect((await tools.run({ items: [oil, beans] })).warnings).toEqual([
    "Stage exactly one product.",
  ])
  await tools.run({ items: [oil] })
  expect(tools.rows().map((row) => row.key)).toEqual(["product"])
})

test("a WhatsApp Product chat stages up to three products with stable keys", async () => {
  const tools = productTools(3)
  await tools.run({ items: [oil, beans, rice] })
  expect(tools.rows().map((row) => row.key)).toEqual([
    "product",
    "product-2",
    "product-3",
  ])
  // A correction by name updates the same draft, never a fourth record.
  await tools.run({ items: [{ ...beans, price: "2000" }] })
  expect(tools.rows()).toHaveLength(3)
  const updated = tools.rows().find((row) => row.key === "product-2")
  expect(updated?.payload).toMatchObject({
    name: "Brown Beans",
    priceMinor: 200000,
  })
  const fourth = await tools.run({
    items: [
      { kind: "product", name: "Palm Oil", unitName: "bottle", price: "2500" },
    ],
  })
  expect(fourth.status).toBe("failed")
  expect(tools.rows()).toHaveLength(3)
  expect(
    (await tools.run({ items: [oil, beans, rice, { ...oil, name: "Extra" }] }))
      .status,
  ).toBe("failed")
  expect(
    (
      await tools.run({
        items: [
          { kind: "service", name: "Delivery", pricing: "fixed", price: "500" },
        ],
      })
    ).status,
  ).toBe("failed")
})

test("product draft keys keep existing keys and refuse more than the limit", () => {
  const current = [
    { key: "product", payload: { name: "Oil" } },
    { key: "product-2", payload: { name: "Beans" } },
  ]
  expect(
    productDraftKeys([{ name: "beans" }, { name: "Rice" }], current, 3),
  ).toEqual(["product-2", "product-3"])
  expect(productDraftKeys([{ name: "Rice" }], current, 2)).toBeUndefined()
  expect(
    productDraftKeys([{ name: "Rice" }], [{ key: "other", payload: {} }], 3),
  ).toBeUndefined()
})

test("a WhatsApp Product chat never stages a product it already saved", async () => {
  const tools = productTools(50)
  await tools.run({ items: [oil, beans] })
  const saved = tools.rows().find((row) => row.key === "product")
  if (!saved) throw Error("Expected the first product draft")
  ;(saved as { state: string }).state = "COMMITTED"
  const again = await tools.run({ items: [{ ...oil, price: "9000" }, rice] })
  expect(again.warnings).toContain(
    "Groundnut Oil 3L is already saved in this chat. It won't be added again.",
  )
  expect(tools.rows().map((row) => row.key)).toEqual([
    "product",
    "product-2",
    "product-3",
  ])
  expect((await tools.run({ items: [{ ...oil, price: "9000" }] })).status).toBe(
    "failed",
  )
  const eleven = Array.from({ length: 11 }, (_, index) => ({
    ...rice,
    name: `Rice ${index}`,
  }))
  expect((await tools.run({ items: eleven })).warnings).toEqual([
    "Stage up to 10 products at a time.",
  ])
})
