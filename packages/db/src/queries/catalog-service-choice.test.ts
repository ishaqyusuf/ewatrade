import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  addServiceChoiceInTransaction,
  planServiceChoice,
} from "./catalog-service-choice"

type Item = Parameters<typeof planServiceChoice>[0]
function fixture(): Item {
  const groups = [
    {
      id: "garment",
      key: "garment",
      name: "Garment",
      values: [
        { id: "shirt", key: "shirt", label: "Shirt" },
        { id: "trouser", key: "trouser", label: "Trousers" },
      ],
    },
    {
      id: "treatment",
      key: "treatment",
      name: "Treatment",
      values: [
        { id: "wash", key: "wash", label: "Wash & iron" },
        { id: "iron", key: "iron", label: "Iron only" },
      ],
    },
  ]
  const variant = (
    garment: string,
    treatment: string,
    price: number,
    isDefault = false,
  ): Item["variants"][number] => ({
    id: `${garment}-${treatment}`,
    key: `${garment}-${treatment}`,
    name: `${garment} / ${treatment}`,
    description: null,
    imageUrl: null,
    status: "active",
    isDefault,
    selections: [
      {
        groupId: "garment",
        groupKey: "garment",
        valueId: garment,
        valueKey: garment,
      },
      {
        groupId: "treatment",
        groupKey: "treatment",
        valueId: treatment,
        valueKey: treatment,
      },
    ],
    offerings: [
      {
        id: `${garment}-${treatment}-offer`,
        key: `${garment}-${treatment}-offer`,
        name: `${garment} / ${treatment}`,
        kind: "service",
        currencyCode: "NGN",
        revision: 4,
        fixedPriceMinor: price,
        pricingPolicy: "fixed",
        productUnit: null,
        service: { id: "service" },
        serviceWorkPolicy: {
          authorizationPolicy: "ON_ORDER_CONFIRMATION",
          guidance: "Retain instruction",
          quantityScale: 0,
          workPolicy: "TRACKED",
        },
        status: "active",
        stores: [
          { storeId: "main", isAvailable: true },
          { storeId: "other", isAvailable: false },
        ],
      },
    ],
  })
  return {
    id: "laundry",
    kind: "service",
    status: "active",
    name: "Laundry",
    description: "Existing instructions",
    category: null,
    categoryId: null,
    subcategoryId: null,
    updatedAt: "2026-10-23T00:00:00.000Z",
    optionGroups: groups,
    variants: [
      variant("shirt", "wash", 20_000, true),
      variant("trouser", "iron", 10_000),
      {
        ...variant("trouser", "wash", 15_000),
        status: "archived",
        offerings: [],
      },
    ],
  }
}
const request = {
  name: "Socks · Wash & iron",
  priceMinor: 10_000,
  storeId: "main",
}

test("Socks appends one priced Laundry choice and preserves the sparse matrix, groups, prices and policies", () => {
  const item = fixture()
  const before = structuredClone(item)
  const plan = planServiceChoice(item, request)
  expect(item).toEqual(before)
  expect(plan.update?.itemId).toBe("laundry")
  expect(plan.update?.optionGroups).toEqual([
    { id: "garment", name: "Garment", values: ["Shirt", "Trousers", "Socks"] },
    {
      id: "treatment",
      name: "Treatment",
      values: ["Wash & iron", "Iron only"],
    },
  ])
  expect(plan.update?.variants).toHaveLength(3)
  expect(plan.update?.variants.map((variant) => variant.selections)).toEqual([
    ["Shirt", "Wash & iron"],
    ["Trousers", "Iron only"],
    ["Socks", "Wash & iron"],
  ])
  expect(
    plan.update?.variants.map(
      (variant) => variant.offerings[0]?.fixedPriceMinor,
    ),
  ).toEqual([20_000, 10_000, 10_000])
  expect(plan.update?.variants[0]?.offerings[0]?.storeAvailability).toEqual(
    item.variants[0]?.offerings[0]?.stores,
  )
  expect(plan.update?.variants[2]?.offerings[0]).toMatchObject({
    workPolicy: "tracked",
    authorizationPolicy: "on_order_confirmation",
    quantityScale: 0,
    guidance: "Retain instruction",
    storeAvailability: [{ storeId: "main", isAvailable: true }],
  })
})
test("repeated additions reuse the saved choice and never override a price, archived choice or Store availability", () => {
  const item = fixture()
  const original = item.variants[0]
  if (!original) throw Error("Missing fixture")
  item.variants.unshift({ ...original, status: "archived", offerings: [] })
  expect(
    planServiceChoice(item, {
      ...request,
      name: "Shirt · Wash and iron",
      priceMinor: 20_000,
    }).existingOfferingId,
  ).toBe("shirt-wash-offer")
  expect(() =>
    planServiceChoice(item, { ...request, name: "Shirt · Wash & iron" }),
  ).toThrow("already exists")
  expect(() =>
    planServiceChoice(item, {
      ...request,
      name: "Trousers · Wash & iron",
      priceMinor: 15_000,
    }),
  ).toThrow("already exists")
  expect(() =>
    planServiceChoice(item, {
      ...request,
      name: "Shirt · Wash & iron",
      priceMinor: 20_000,
      storeId: "other",
    }),
  ).toThrow("availability")
})
test("single option Services retain their default and add a single full choice", () => {
  const item = fixture()
  item.optionGroups = [
    {
      id: "choice",
      key: "choice",
      name: "Garment & treatment",
      values: [
        { id: "shirt-wash", key: "shirt-wash", label: "Shirt · Wash & iron" },
      ],
    },
  ]
  const saved = item.variants[0]
  if (!saved) throw Error("Missing fixture")
  saved.selections = [
    {
      groupId: "choice",
      groupKey: "choice",
      valueId: "shirt-wash",
      valueKey: "shirt-wash",
    },
  ]
  item.variants = [saved]
  const plan = planServiceChoice(item, request)
  expect(plan.update?.variants.map((variant) => variant.selections)).toEqual([
    ["Shirt · Wash & iron"],
    ["Socks · Wash & iron"],
  ])
  expect(plan.update?.variants.map((variant) => variant.isDefault)).toEqual([
    true,
    false,
  ])
})
test("incomplete option details, products and invalid prices fail before a save plan", () => {
  expect(() =>
    planServiceChoice(fixture(), { ...request, name: "Socks" }),
  ).toThrow("more option details")
  expect(() =>
    planServiceChoice({ ...fixture(), kind: "product" }, request),
  ).toThrow("active Service")
  expect(() =>
    planServiceChoice(fixture(), { ...request, priceMinor: -1 }),
  ).toThrow("valid price")
})

test("the transaction locks and reads the selected Service under the server business and refuses a foreign record before writes", async () => {
  const reads: unknown[] = []
  const locks: unknown[] = []
  const tx = {
    $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(values)
      return 1
    },
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(values)
      return []
    },
    catalogItem: {
      findFirst: async (input: unknown) => {
        reads.push(input)
        return null
      },
    },
  } as unknown as Prisma.TransactionClient
  await expect(
    addServiceChoiceInTransaction(tx, {
      ...request,
      itemId: "foreign",
      tenantId: "freshcare",
      actorUserId: "owner",
      clientOperationId: "choice-operation",
    }),
  ).rejects.toThrow("Service not found for this business")
  expect(reads).toEqual([
    expect.objectContaining({
      where: { id: "foreign", tenantId: "freshcare", systemRole: null },
    }),
  ])
  expect(locks[1]).toEqual(["foreign", "freshcare"])
})
