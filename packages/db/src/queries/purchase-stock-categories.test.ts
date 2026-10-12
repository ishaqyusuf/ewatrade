import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { resolvePurchaseStockCategoryGroups } from "./inventory-categories"

function fixture(ids: number[] = []) {
  const calls: Array<{ kind: string; value: unknown }> = []
  let nextId = 100
  const names = new Map<string, number>([["purchase", 7]])
  const tx = {
    stockOperationCategoryName: {
      findMany: async (input: unknown) => {
        calls.push({ kind: "ids", value: input })
        return ids.map((id) => ({ id }))
      },
    },
    $queryRaw: async (sql: { values: unknown[] }) => {
      calls.push({ kind: "names", value: sql.values })
      const rows = []
      for (let index = 0; index < sql.values.length; index += 3) {
        const normalizedName = String(sql.values[index + 2])
        if (!names.has(normalizedName)) names.set(normalizedName, nextId++)
        rows.push({ id: names.get(normalizedName)!, normalizedName })
      }
      return rows
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}

test("ten category groups share one sorted upsert and retain each line's original deduplicated positions", async () => {
  const f = fixture([7, 9])
  const groups = Array.from({ length: 10 }, (_, index) => [
    { name: " Purchase " },
    { categoryNameId: 9 },
    { name: "Freight" },
    { name: "purchase" },
    { categoryNameId: 7 },
    { name: `Group ${index}` },
  ])
  const links = await resolvePurchaseStockCategoryGroups(f.tx, "tenant", groups)
  expect(f.calls.map((call) => call.kind)).toEqual(["ids", "names"])
  expect(f.calls[0]!.value).toEqual({
    where: { tenantId: "tenant", id: { in: [7, 9] } },
    select: { id: true },
  })
  const parameters = f.calls[1]!.value as string[]
  const normalizedNames = parameters.filter((_, index) => index % 3 === 2)
  expect(normalizedNames).toEqual([...normalizedNames].sort())
  expect(normalizedNames).toHaveLength(12)
  expect(new Set(normalizedNames).size).toBe(12)
  for (const group of links) {
    expect(group).toHaveLength(4)
    expect(group[0]).toEqual({
      tenantId: "tenant",
      categoryNameId: 7,
      position: 0,
    })
    expect(group[1]).toEqual({
      tenantId: "tenant",
      categoryNameId: 9,
      position: 1,
    })
    expect(group.map((link) => link.position)).toEqual([0, 1, 2, 3])
  }
})

test("maximum hundred named categories resolve once; empty legacy groups do not query", async () => {
  const f = fixture()
  const groups = Array.from({ length: 10 }, (_, line) =>
    Array.from({ length: 10 }, (_, category) => ({
      name: `Category ${line}-${category}`,
    })),
  )
  const result = await resolvePurchaseStockCategoryGroups(
    f.tx,
    "tenant",
    groups,
  )
  expect(result.flat()).toHaveLength(100)
  expect(f.calls).toHaveLength(1)
  const empty = fixture()
  expect(
    await resolvePurchaseStockCategoryGroups(empty.tx, "tenant", [[], []]),
  ).toEqual([[], []])
  expect(empty.calls).toHaveLength(0)
})

test("missing or foreign category identities refuse before name creation and unsupported bounds refuse before reads", async () => {
  for (const ids of [[], [9]]) {
    const f = fixture(ids)
    await expect(
      resolvePurchaseStockCategoryGroups(f.tx, "tenant", [
        [{ categoryNameId: 7 }, { name: "New" }],
      ]),
    ).rejects.toThrow("Category not found")
    expect(f.calls.map((call) => call.kind)).toEqual(["ids"])
  }
  const f = fixture()
  for (const groups of [
    [],
    Array.from({ length: 11 }, () => []),
    [Array.from({ length: 11 }, (_, index) => ({ name: `Extra ${index}` }))],
  ])
    await expect(
      resolvePurchaseStockCategoryGroups(f.tx, "tenant", groups),
    ).rejects.toThrow()
  expect(f.calls).toHaveLength(0)
})
