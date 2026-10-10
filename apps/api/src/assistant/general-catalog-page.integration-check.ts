import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { catalogRouter } from "../trpc/routers/catalog"
import type { GeneralContext } from "./general-context"

export async function verifyCatalogPages(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  await ctx.db.catalogItem.createMany({
    data: Array.from({ length: 301 }, () => ({
      tenantId,
      name: "Catalogpager same name",
      slug: randomUUID(),
      kind: "PRODUCT" as const,
      status: "ACTIVE" as const,
    })),
  })
  const caller = catalogRouter.createCaller(ctx)
  const seen: string[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = await caller.listItemsPage({
      query: "Catalogpager",
      kind: "product",
      status: "active",
      searchOrder: "stable",
      sort: { field: "name", direction: "asc" },
      limit: 50,
      cursor,
    })
    seen.push(...page.items.map((item) => item.id))
    cursor = page.nextCursor
    pages += 1
    if (pages > 8) throw Error("Pagination did not terminate")
  } while (cursor)
  expect(pages).toBe(7)
  expect(seen).toHaveLength(301)
  expect(new Set(seen).size).toBe(301)
  await expect(
    caller.listItemsPage({
      query: "NoMatchingCatalogKeyword",
      searchOrder: "stable",
      cursor: seen[0],
      limit: 10,
    }),
  ).rejects.toThrow("list changed")
  const empty = await caller.listItemsPage({
    query: "NoMatchingCatalogKeyword",
    searchOrder: "stable",
    limit: 10,
  })
  expect(empty.items).toEqual([])
  expect(empty.nextCursor).toBeUndefined()
}
