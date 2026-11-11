import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { listCatalogItemsPage } from "./catalog"
import { listCatalogDirectoryPage } from "./catalog-directory"

type Row = Record<string, unknown>
function object(value: unknown): value is Row {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true
    if (key === "AND" || key === "OR") {
      if (!Array.isArray(value)) throw Error("Expected predicate array")
      return key === "AND"
        ? value.every((part) => matches(row, part))
        : value.some((part) => matches(row, part))
    }
    const field = row[key]
    if (!object(value)) return field === value
    if ("not" in value) return field !== value.not
    if ("in" in value && Array.isArray(value.in))
      return value.in.includes(field)
    if ("contains" in value)
      return (
        typeof field === "string" &&
        field.toLowerCase().includes(String(value.contains).toLowerCase())
      )
    if ("is" in value)
      return object(field) && object(value.is) && matches(field, value.is)
    if ("some" in value)
      return (
        Array.isArray(field) &&
        object(value.some) &&
        field.some((child) => matches(child, value.some as Row))
      )
    if ("gt" in value || "lt" in value) {
      const left = field instanceof Date ? field.getTime() : field
      const right = value.gt ?? value.lt
      const bound = right instanceof Date ? right.getTime() : right
      if (
        (typeof left !== "string" && typeof left !== "number") ||
        (typeof bound !== "string" && typeof bound !== "number")
      )
        throw Error("Expected keyset scalar")
      return "gt" in value ? left > bound : left < bound
    }
    throw Error(`Unexpected predicate ${key}`)
  })
}
function selectRows(rows: Row[], options: Row): Row[] {
  const order = Array.isArray(options.orderBy)
    ? options.orderBy
    : options.orderBy
      ? [options.orderBy]
      : []
  const sorted = rows
    .filter((row) => matches(row, options.where as Row | undefined))
    .slice()
    .sort((left, right) => {
      for (const key of order)
        for (const [field, direction] of Object.entries(key)) {
          const a =
            left[field] instanceof Date ? left[field].getTime() : left[field]
          const b =
            right[field] instanceof Date ? right[field].getTime() : right[field]
          if (a !== b) {
            let result: number
            if (typeof a === "boolean" && typeof b === "boolean")
              result = Number(a) - Number(b)
            else if (
              (typeof a === "string" && typeof b === "string") ||
              (typeof a === "number" && typeof b === "number")
            )
              result = a < b ? -1 : 1
            else throw Error("Expected sortable scalar")
            return result * (direction === "desc" ? -1 : 1)
          }
        }
      return 0
    })
  return sorted
    .slice(0, typeof options.take === "number" ? options.take : undefined)
    .map((row) =>
      project(
        row,
        options.select as Row | undefined,
        options.include as Row | undefined,
      ),
    )
}
function project(row: Row, select?: Row, include?: Row): Row {
  if (!select && !include) return row
  return {
    ...(select ? {} : row),
    ...Object.fromEntries(
      Object.entries(select ?? include ?? {}).map(([key, spec]) => {
        if (spec === true) return [key, row[key]]
        if (!object(spec)) throw Error("Unexpected selection")
        if (key === "_count") {
          const counts = Object.entries(spec.select as Row).map(
            ([relation, entry]) => {
              const children = row[relation]
              if (!Array.isArray(children))
                throw Error("Expected count relation")
              return [
                relation,
                children.filter((child) =>
                  matches(
                    child,
                    object(entry) ? (entry.where as Row) : undefined,
                  ),
                ).length,
              ]
            },
          )
          return [key, Object.fromEntries(counts)]
        }
        const value = row[key]
        return [
          key,
          Array.isArray(value)
            ? selectRows(value, spec)
            : value == null
              ? null
              : project(value as Row, spec.select as Row, spec.include as Row),
        ]
      }),
    ),
  }
}
function item(index: number): Row {
  const id = `item-${String(index).padStart(4, "0")}`
  return {
    id,
    name: `Rice ${index}`,
    slug: id,
    kind: "PRODUCT",
    status: "ACTIVE",
    tenantId: "tenant",
    systemRole: null,
    category: "Food",
    categoryId: null,
    subcategoryId: null,
    description: "Editor detail ".repeat(100),
    imageUrl: null,
    imageLinks: [],
    createdAt: new Date(0),
    updatedAt: new Date(index),
    optionGroups: [
      {
        id: "group",
        key: "size",
        name: "Size",
        values: Array.from({ length: 20 }, (_, i) => ({
          id: `value-${i}`,
          key: `${i}`,
          label: `Size ${i}`,
        })),
      },
    ],
    illustrations: [
      { storeId: "foreign-store", illustrationId: "private" },
      { storeId: "store", illustrationId: "drawing" },
    ],
    photoAssets: [
      {
        id: "rejected",
        storeId: "store",
        state: "REJECTED",
        sortOrder: 0,
        optionVariantId: null,
      },
      {
        id: "option",
        storeId: "store",
        state: "APPROVED",
        sortOrder: 1,
        optionVariantId: "variant-7",
      },
      {
        id: "photo",
        storeId: "store",
        state: "APPROVED",
        sortOrder: 2,
        optionVariantId: null,
      },
    ],
    product: {
      id: `product-${id}`,
      usage: "BOTH",
      updatedAt: new Date(0),
      currentUnitConfiguration: {
        id: "configuration",
        canonicalBalanceScale: 6,
        version: 1,
        units: [
          {
            id: "unit",
            name: "Bag",
            key: "bag",
            factor: "1",
            symbol: "bag",
            stockBehavior: "CANONICAL_SHARED",
            transactionScale: 2,
            sortOrder: 0,
          },
        ],
      },
      stockBalanceSources: [
        {
          id: "balance-first",
          storeId: "store",
          kind: "SHARED_POOL",
          inventoryUnitId: "unit",
          inventoryUnit: { name: "Bag" },
          variantId: "variant",
          variant: { name: "Standard" },
          onHandQuantity: "2.50",
          reservedQuantity: "0",
          revision: 1,
          createdAt: new Date(0),
        },
        {
          id: "foreign-balance",
          storeId: "foreign-store",
          inventoryUnit: { name: "Private" },
          onHandQuantity: "900",
          reservedQuantity: "0",
          variant: { name: "Private" },
          createdAt: new Date(1),
        },
      ],
    },
    service: null,
    variants: Array.from({ length: 20 }, (_, i) => ({
      id: `variant-${i}`,
      key: `variant-${i}`,
      name: `Variant ${i}`,
      description: null,
      imageUrl: null,
      isDefault: i === 7,
      status: i === 0 ? "ARCHIVED" : "ACTIVE",
      sortOrder: i,
      selections: [],
      offerings: Array.from({ length: 5 }, (_, j) => ({
        id: `offering-${i}-${j}`,
        key: `${i}-${j}`,
        kind: "PRODUCT_UNIT",
        name: `Choice ${j}`,
        status: j === 0 ? "ARCHIVED" : "ACTIVE",
        fixedPriceMinor: j === 1 ? 0 : 300,
        pricingPolicy: "FIXED",
        currencyCode: "NGN",
        revision: 1,
        productUnitOffering: null,
        serviceOffering: null,
        storeAvailability: [],
        sortOrder: j,
      })),
    })),
  }
}
function harness(count = 31) {
  const rows = Array.from({ length: count }, (_, i) => item(i))
  rows.push(
    { ...item(901), tenantId: "foreign" },
    { ...item(902), systemRole: "QUICK_SALE" },
  )
  const calls: Row[] = []
  let countReads = 0
  const db = {
    catalogItem: {
      findMany: async (query: Row) => {
        calls.push(query)
        return selectRows(rows, query)
      },
      findFirst: async (query: Row) =>
        selectRows(rows, { ...query, take: 1 })[0] ?? null,
      count: async ({ where }: { where: Row }) => {
        countReads++
        return rows.filter((row) => matches(row, where)).length
      },
    },
  } as unknown as Pick<PrismaClient, "catalogItem">
  return { db, rows, calls, countReads: () => countReads }
}
const input = {
  tenantId: "tenant",
  storeId: "store",
  storeIds: ["store"],
  limit: 25,
}

test("actual directory query returns display summaries without editor graphs", async () => {
  const h = harness()
  const page = await listCatalogDirectoryPage(h.db, input)
  expect(page.items).toHaveLength(25)
  expect(h.countReads()).toBe(0)
  const row = page.items[0]
  expect(row).toMatchObject({
    name: "Rice 30",
    variantCount: 19,
    primaryVariantName: "Variant 7",
    offeringCount: 4,
    primaryOffering: {
      name: "Choice 1",
      fixedPriceMinor: 0,
      pricingPolicy: "fixed",
    },
    product: {
      usage: "BOTH",
      stockBalances: [{ onHandQuantity: "2.50", inventoryUnitName: "Bag" }],
    },
    photos: [{ assetId: "photo", storeId: "store" }],
    illustrations: [{ illustrationId: "drawing", storeId: "store" }],
  })
  expect(row).not.toHaveProperty("optionGroups")
  expect(row).not.toHaveProperty("variants")
  expect(row?.product).not.toHaveProperty("currentUnitConfiguration")
  const legacyPage = await listCatalogItemsPage(harness().db, input)
  const legacy = legacyPage.items[0]
  if (!legacy || !row) throw Error("Expected both projections")
  const variants = legacy.variants.filter(
    (value) => value.status !== "archived",
  )
  const primary = variants.find((value) => value.isDefault) ?? variants[0]
  const offerings =
    primary?.offerings.filter((value) => value.status !== "archived") ?? []
  expect(row.variantCount).toBe(variants.length)
  expect(row.primaryVariantName).toBe(primary?.name ?? null)
  expect(row.offeringCount).toBe(offerings.length)
  expect(row.primaryOffering).toMatchObject({
    name: offerings[0]?.name,
    fixedPriceMinor: offerings[0]?.fixedPriceMinor,
    currencyCode: offerings[0]?.currencyCode,
    pricingPolicy: offerings[0]?.pricingPolicy,
  })
  expect(row.product?.stockBalances[0]).toMatchObject({
    onHandQuantity: legacy.product?.stockBalances[0]?.onHandQuantity,
    inventoryUnitName: legacy.product?.stockBalances[0]?.inventoryUnitName,
  })
  expect(page.items.map((value) => value.id)).toEqual(
    legacyPage.items.map((value) => value.id),
  )
  expect(page.nextCursor).toBe(legacyPage.nextCursor)
  expect(JSON.stringify(row).length).toBeLessThan(
    JSON.stringify(legacy).length / 10,
  )
  expect(h.calls).toHaveLength(1)
  expect(h.calls[0]).not.toHaveProperty("include")
})

test("keyset continuation preserves scope, boundaries and terminal cursor", async () => {
  const h = harness()
  const first = await listCatalogDirectoryPage(h.db, input)
  const second = await listCatalogDirectoryPage(h.db, {
    ...input,
    cursor: first.nextCursor,
  })
  expect(second.items.map((row) => row.id)).toEqual(
    [5, 4, 3, 2, 1, 0].map((i) => `item-${String(i).padStart(4, "0")}`),
  )
  expect(second.nextCursor).toBeUndefined()
  await expect(
    listCatalogDirectoryPage(h.db, { ...input, cursor: "item-0901" }),
  ).rejects.toThrow("Refresh to continue")
})

test("ranked search caps narrow candidates and hydrates only the requested directory page", async () => {
  const h = harness(301)
  const page = await listCatalogDirectoryPage(h.db, {
    ...input,
    query: "rice",
    limit: 20,
  })
  expect(page.items).toHaveLength(20)
  expect(page.nextCursor).toBe("rank:20")
  expect(h.calls).toHaveLength(2)
  expect(h.calls[0]?.take).toBe(300)
  expect(h.calls[1]?.take).toBe(20)
  expect(h.calls[0]?.select).not.toHaveProperty("optionGroups")
  expect(h.calls[0]?.select).not.toHaveProperty("_count")
  const next = await listCatalogDirectoryPage(h.db, {
    ...input,
    query: "rice",
    limit: 20,
    cursor: page.nextCursor,
  })
  expect(
    new Set([...page.items, ...next.items].map((row) => row.id)).size,
  ).toBe(40)
})

test("no-match search avoids hydration and denied Store rows never enter media or stock", async () => {
  const h = harness(1)
  const missing = await listCatalogDirectoryPage(h.db, {
    ...input,
    query: "unmatched",
  })
  expect(missing.items).toEqual([])
  expect(h.calls).toHaveLength(1)
  const page = await listCatalogDirectoryPage(h.db, {
    ...input,
    storeId: "unassigned",
    storeIds: [],
  })
  expect(page.items[0]?.photos).toEqual([])
  expect(page.items[0]?.illustrations).toEqual([])
  expect(page.items[0]?.product?.stockBalances).toEqual([])
})

test("primary fallback, quote pricing and an empty Service graph retain display meaning", async () => {
  const h = harness(1)
  const record = h.rows[0]
  if (!record || !Array.isArray(record.variants))
    throw Error("Missing inert variants")
  record.kind = "SERVICE"
  record.product = null
  for (const variant of record.variants) variant.isDefault = false
  record.variants[1].offerings[1].pricingPolicy = "QUOTE_REQUIRED"
  record.variants[1].offerings[1].fixedPriceMinor = null
  const page = await listCatalogDirectoryPage(h.db, input)
  expect(page.items[0]).toMatchObject({
    kind: "service",
    product: null,
    primaryVariantName: "Variant 1",
    primaryOffering: { fixedPriceMinor: null, pricingPolicy: "quote_required" },
  })
  record.variants = []
  const empty = await listCatalogDirectoryPage(h.db, input)
  expect(empty.items[0]).toMatchObject({
    variantCount: 0,
    offeringCount: 0,
    primaryVariantName: null,
    primaryOffering: null,
  })
})

test("directory read failures propagate instead of becoming an empty successful list", async () => {
  const db = {
    catalogItem: {
      findMany: async () => {
        throw new Error("inert read failure")
      },
      count: async () => 0,
    },
  } as unknown as Pick<PrismaClient, "catalogItem">
  await expect(listCatalogDirectoryPage(db, input)).rejects.toThrow(
    "inert read failure",
  )
})
