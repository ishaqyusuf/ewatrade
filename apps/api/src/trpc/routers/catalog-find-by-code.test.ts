import { expect, test } from "bun:test"
import { createCallerFactory, createTRPCRouter } from "../init"
import { catalogRouter } from "./catalog"

const router = createTRPCRouter({ catalog: catalogRouter })

type Row = {
  barcode: string | null
  offeringId: string
  itemName: string
}

function fixture(rows: Row[], options: { user?: boolean } = {}) {
  const calls: Array<{ where: Record<string, unknown> }> = []
  const caller = createCallerFactory(router)({
    db: {
      productUnitOffering: {
        findMany: async (input: { where: Record<string, unknown> }) => {
          calls.push(input)
          return rows.map((row) => ({
            barcode: row.barcode,
            inventoryUnit: { name: "piece" },
            offering: {
              id: row.offeringId,
              name: "Default",
              variant: { name: "Default" },
              catalogItem: { id: `item-${row.offeringId}`, name: row.itemName },
            },
          }))
        },
      },
    },
    session:
      options.user === false
        ? null
        : { session: { id: "session", token: "inert" }, user: { id: "actor" } },
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role: "OWNER" },
      activeStore: { id: "store" },
      stores: [{ id: "store" }],
    },
    qaSessionScope: null,
  } as never)
  return { caller, calls }
}

test("exact code keeps leading zeros and stays in the caller's Business", async () => {
  const state = fixture([
    { barcode: "0012345678905", offeringId: "o1", itemName: "Oud 50ml" },
  ])
  const result = await state.caller.catalog.findByCode({
    code: "  0012345678905 ",
  })
  expect(result).toEqual({
    status: "found",
    code: "0012345678905",
    match: {
      catalogItemId: "item-o1",
      offeringId: "o1",
      itemName: "Oud 50ml",
      offeringName: "Default",
      variantName: "Default",
      unitName: "piece",
      matchedBy: "barcode",
    },
  })
  expect(state.calls[0]?.where).toMatchObject({
    tenantId: "tenant",
    OR: [{ barcode: "0012345678905" }, { sku: "0012345678905" }],
  })
})

test("a barcode on one offering and SKU on another is ambiguous", async () => {
  const state = fixture([
    { barcode: "ABC1", offeringId: "o1", itemName: "Ring" },
    { barcode: null, offeringId: "o2", itemName: "Watch" },
  ])
  const result = await state.caller.catalog.findByCode({ code: "ABC1" })
  expect(result.status).toBe("ambiguous")
  if (result.status === "ambiguous")
    expect(result.matches.map((m) => m.matchedBy)).toEqual(["barcode", "sku"])
})

test("unknown, QR links and control characters never resolve", async () => {
  const state = fixture([])
  expect(await state.caller.catalog.findByCode({ code: "999" })).toEqual({
    status: "unknown",
    code: "999",
  })
  for (const code of [
    "https://evil.example/pay",
    "HTTP://x",
    "www.example.com",
    "intent://scan",
  ])
    expect((await state.caller.catalog.findByCode({ code })).status).toBe(
      "link",
    )
  expect(
    (await state.caller.catalog.findByCode({ code: "12\u000734" })).status,
  ).toBe("invalid")
  expect((await state.caller.catalog.findByCode({ code: "   " })).status).toBe(
    "invalid",
  )
  // Only the plain unknown code reached the database.
  expect(state.calls).toHaveLength(1)
})

test("requires a signed-in caller", async () => {
  await expect(
    fixture([], { user: false }).caller.catalog.findByCode({ code: "1" }),
  ).rejects.toThrow()
})
