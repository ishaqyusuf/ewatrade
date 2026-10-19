import { expect, test } from "bun:test"
import { listCatalogItemsPage } from "./catalog"
import type { CatalogItemGraph } from "./catalog-read"

/** Stateful query port: actual repository queries filter/sort/slice logical rows. No DB or DTO replacement. */
function item(
  index: number,
  patch: Partial<CatalogItemGraph> = {},
): CatalogItemGraph {
  const suffix = String(index).padStart(4, "0")
  return {
    id: `item-${suffix}`,
    tenantId: "owned",
    slug: `rice-${suffix}`,
    name: `Rice ${String(index === 5 ? 4 : index).padStart(4, "0")}`,
    kind: "PRODUCT",
    status: "ACTIVE",
    systemRole: null,
    description: null,
    category: null,
    categoryId: null,
    subcategoryId: null,
    imageUrl: null,
    imageLinks: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    archivedAt: null,
    product: null,
    service: null,
    optionGroups: [],
    variants: [],
    illustrations: [],
    photoAssets: [],
    ...patch,
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Only Prisma predicates used by these real query paths; unknown operators fail the port. */
function matches(record: unknown, where: unknown): boolean {
  if (!object(record) || !object(where)) return false
  return Object.entries(where).every(([field, filter]) => {
    if (filter === undefined) return true
    if (field === "AND" || field === "OR") {
      if (!Array.isArray(filter)) throw Error("Expected predicate array")
      return field === "AND"
        ? filter.every((part) => matches(record, part))
        : filter.some((part) => matches(record, part))
    }
    const value = record[field]
    if (!object(filter)) return value === filter
    if ("contains" in filter)
      return (
        typeof value === "string" &&
        typeof filter.contains === "string" &&
        (filter.mode === "insensitive"
          ? value.toLowerCase().includes(filter.contains.toLowerCase())
          : value.includes(filter.contains))
      )
    if ("gt" in filter || "lt" in filter) {
      const bound = "gt" in filter ? filter.gt : filter.lt
      if (typeof value !== "string" || typeof bound !== "string")
        throw Error("Expected string keyset")
      return "gt" in filter ? value > bound : value < bound
    }
    if ("is" in filter) return matches(value, filter.is)
    if ("some" in filter)
      return (
        Array.isArray(value) &&
        value.some((child) => matches(child, filter.some))
      )
    throw Error(`Unexpected query predicate: ${field}`)
  })
}

function harness() {
  const owned = Array.from({ length: 301 }, (_, index) => item(index))
  const rows = [
    ...owned,
    item(401, { tenantId: "foreign" }),
    item(402, { kind: "SERVICE" }),
    item(403, { status: "ARCHIVED" }),
    item(404, { systemRole: "QUICK_SALE" }),
    item(405, { name: "Other", slug: "other" }),
  ]
  const calls: Array<{
    take: number
    where: unknown
    orderBy: unknown
    include: unknown
  }> = []
  const port = {
    catalogItem: {
      findFirst: async ({ where }: { where: unknown }) =>
        rows.find((row) => matches(row, where)) ?? null,
      findMany: async (query: {
        where: unknown
        orderBy: Array<Record<string, "asc" | "desc">>
        take: number
        include: unknown
      }) => {
        calls.push(query)
        return rows
          .filter((row) => matches(row, query.where))
          .sort((left, right) => {
            for (const sort of query.orderBy) {
              const [field, direction] = Object.entries(sort)[0] ?? []
              if (field !== "name" && field !== "id")
                throw Error("Expected exact name/id ordering")
              const comparison = left[field].localeCompare(right[field])
              if (comparison)
                return direction === "desc" ? -comparison : comparison
            }
            return 0
          })
          .slice(0, query.take)
      },
      count: async ({ where }: { where: unknown }) =>
        rows.filter((row) => matches(row, where)).length,
    },
  }
  // The method is exercised unchanged. The inert port supplies its actual query operations only.
  const read = (
    input: Parameters<typeof listCatalogItemsPage>[1],
  ): ReturnType<typeof listCatalogItemsPage> =>
    Reflect.apply(listCatalogItemsPage, undefined, [port, input])
  return { owned, calls, read }
}

const input = {
  tenantId: "owned",
  storeIds: ["owned-store"],
  kind: "product",
  status: "active",
  query: " RICE ",
  limit: 10,
  sort: { field: "name", direction: "asc" },
} satisfies Parameters<typeof listCatalogItemsPage>[1]

test("explicit stable keyword search continues all 301 scoped matches with original ID anchors and no ranked cap", async () => {
  const h = harness()
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await h.read({ ...input, searchOrder: "stable", cursor })
    ids.push(...page.items.map((row) => row.id))
    expect(page.items.length).toBeLessThanOrEqual(10)
    if (page.nextCursor) {
      const last = page.items.at(-1)
      if (!last) throw Error("A continuation requires an actual last row")
      expect(page.nextCursor).toBe(last.id)
    }
    cursor = page.nextCursor
    if (ids.length > 301) throw Error("Continuation repeated an original row")
  } while (cursor)
  expect(ids).toEqual(h.owned.map((row) => row.id))
  expect(new Set(ids).size).toBe(301)
  expect(h.calls).toHaveLength(31)
  expect(h.calls.every((call) => call.take === 11)).toBe(true)
  expect(h.calls[0]?.orderBy).toEqual([{ name: "asc" }, { id: "asc" }])
  expect(h.calls[0]?.include).toMatchObject({
    product: {
      include: {
        stockBalanceSources: { where: { storeId: { in: ["owned-store"] } } },
      },
    },
  })
  const calls = h.calls.length
  await expect(
    h.read({ ...input, searchOrder: "stable", cursor: "item-0401" }),
  ).rejects.toThrow("list changed")
  await expect(
    h.read({ ...input, searchOrder: "stable", cursor: "item-0405" }),
  ).rejects.toThrow("list changed")
  expect(h.calls).toHaveLength(calls)
})

test("ordinary keyword search retains ranked candidate cap and rank-offset cursor by default or explicit relevance", async () => {
  for (const searchOrder of [undefined, "relevance"] as const) {
    const h = harness()
    const first = await h.read({ ...input, searchOrder })
    expect(first.items).toHaveLength(10)
    expect(first.nextCursor).toBe("rank:10")
    expect(h.calls[0]?.take).toBe(300)
    const end = await h.read({ ...input, searchOrder, cursor: "rank:290" })
    expect(end.items).toHaveLength(10)
    expect(end.nextCursor).toBeUndefined()
    expect(end.items.some((row) => row.id === "item-0300")).toBe(false)
  }
})
