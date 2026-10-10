import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { countCatalogItems, countCustomers } from "@ewatrade/db/queries"
import { catalogRouter } from "../trpc/routers/catalog"
import { customersRouter } from "../trpc/routers/customers"
import { tenantRouter } from "../trpc/routers/tenant"
import type { GeneralContext } from "./general-context"

export async function verifyDirectoryCounts(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  await ctx.db.catalogItem.createMany({
    data: Array.from({ length: 53 }, (_, i) => ({
      tenantId,
      slug: `count-${randomUUID()}`,
      name: i < 51 ? `Egg ${i}` : "Other",
      kind: i === 52 ? ("SERVICE" as const) : ("PRODUCT" as const),
      status: i === 51 ? ("ARCHIVED" as const) : ("ACTIVE" as const),
    })),
  })
  await ctx.db.customer.createMany({
    data: Array.from({ length: 53 }, (_, i) => ({
      tenantId,
      name: i < 51 ? `Amina ${i}` : "Other",
    })),
  })
  const catalog = catalogRouter.createCaller(ctx)
  expect(await catalog.count({})).toBe(53)
  expect(await catalog.count({ kind: "product", status: "active" })).toBe(51)
  expect(await catalog.count({ nameContains: "eGG" })).toBe(51)
  expect(await catalog.count({ kind: "product", status: "archived" })).toBe(1)
  expect(await catalog.count({ nameContains: "missing" })).toBe(0)
  const customers = customersRouter.createCaller(ctx)
  expect(await customers.count()).toBe(53)
  expect(await customers.count({ query: "aMINA" })).toBe(51)
  expect(
    (await customers.listPage({ limit: 1, query: "Amina" })).items,
  ).toHaveLength(1)
  expect(await countCatalogItems(ctx.db, { tenantId: "other" })).toBe(0)
  expect(await countCustomers(ctx.db, { tenantId: "other" })).toBe(0)
  await ctx.db.catalogItem.create({
    data: {
      tenantId,
      slug: `literal-${randomUUID()}`,
      name: "100% item",
      kind: "PRODUCT",
      status: "ACTIVE",
    },
  })
  await ctx.db.customer.create({ data: { tenantId, name: "100% customer" } })
  expect(await catalog.count({ nameContains: "%" })).toBe(1)
  expect(await customers.count({ query: "%" })).toBe(1)
  expect(await catalog.count({ nameContains: "_" })).toBe(0)
  expect(await customers.count({ query: "_" })).toBe(0)
  const firstPage = await customers.listPage({ limit: 10, query: "Amina" })
  const secondPage = await customers.listPage({
    limit: 10,
    query: "Amina",
    cursor: firstPage.nextCursor,
  })
  expect(firstPage.items).toHaveLength(10)
  expect(secondPage.items).toHaveLength(10)
  expect(
    new Set([...firstPage.items, ...secondPage.items].map((row) => row.id))
      .size,
  ).toBe(20)
  await expect(
    customers.listPage({
      limit: 10,
      query: "Other",
      cursor: firstPage.nextCursor,
    }),
  ).rejects.toThrow("list changed")
  await expect(
    customers.listPage({ limit: 10, cursor: "foreign-customer" }),
  ).rejects.toThrow("list changed")
  const literalPage = await customers.listPage({ limit: 10, query: "%" })
  expect(literalPage.items.map((row) => row.name)).toEqual(["100% customer"])
  const authorizedStores = await tenantRouter.createCaller(ctx).stores()
  expect(authorizedStores.map((store) => store.id)).toEqual(
    ctx.tenantContext.stores.map((store) => store.id),
  )
}
