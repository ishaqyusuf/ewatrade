import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { listCatalogItemsPage } from "./catalog"

describe("catalog list page search", () => {
  test("searches each word in any field while retaining tenant, kind, and status scope", async () => {
    let findWhere: Record<string, unknown> | undefined
    let countWhere: Record<string, unknown> | undefined
    const db = {
      catalogItem: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          findWhere = where
          return []
        },
        count: async ({ where }: { where: Record<string, unknown> }) => {
          countWhere = where
          return 0
        },
      },
    } as unknown as PrismaClient

    await listCatalogItemsPage(db, {
      kind: "product",
      query: "ginger-root",
      status: "active",
      tenantId: "tenant_1",
    })

    expect(findWhere).toMatchObject({
      kind: "PRODUCT",
      status: "ACTIVE",
      tenantId: "tenant_1",
    })
    expect(countWhere).toEqual({
      kind: "PRODUCT",
      status: "ACTIVE",
      tenantId: "tenant_1",
    })
    // Deep search: each word may match any field, in any order.
    expect(findWhere?.OR).toContainEqual({
      slug: { contains: "ginger", mode: "insensitive" },
    })
    expect(findWhere?.OR).toContainEqual({
      name: { contains: "root", mode: "insensitive" },
    })
  })
})
