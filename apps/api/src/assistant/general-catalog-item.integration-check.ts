import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { readGeneralCatalogHistory } from "./general-catalog-history"
import { readGeneralCatalogItem } from "./general-catalog-item"
import type { GeneralContext } from "./general-context"

export async function verifyCatalogItemScope(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const item = await createSimpleCatalogItem(ctx.db, {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Scoped catalog QA",
    canonicalUnitName: "Piece",
    priceMinor: 100,
  })
  const offering = await ctx.db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
    include: {
      productUnitOffering: {
        include: { inventoryUnit: { include: { configurationVersion: true } } },
      },
    },
  })
  const unit = offering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("Unit missing")
  const otherStore = await ctx.db.store.create({
    data: {
      tenantId,
      name: "Other Store",
      slug: "other-scope",
      status: "ACTIVE",
    },
  })
  await ctx.db.stockBalanceSource.createMany({
    data: [storeId, otherStore.id].map((id) => ({
      tenantId,
      storeId: id,
      variantId: offering.variantId,
      productId: unit.configurationVersion.productId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL" as const,
      onHandQuantity: "10",
      reservedQuantity: "0",
    })),
  })
  const owner = await readGeneralCatalogItem(ctx, item.id)
  expect(owner.product?.stockBalances.map((row) => row.storeId)).toEqual([
    storeId,
  ])
  expect(
    owner.variants
      .flatMap((row) => row.offerings)
      .some((row) => row.id === offering.id),
  ).toBe(true)
  const rep: GeneralContext = {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      membership: { ...ctx.tenantContext.membership, role: "CASHIER" },
    },
  }
  const repItem = await readGeneralCatalogItem(rep, item.id)
  expect(repItem.product?.stockBalances).toEqual([])
  expect(
    repItem.variants
      .flatMap((row) => row.offerings)
      .some((row) => row.id === offering.id),
  ).toBe(true)
  expect(
    repItem.variants
      .flatMap((row) => row.offerings)
      .flatMap((row) => row.stores)
      .every((row) => row.storeId === storeId),
  ).toBe(true)
  await expect(readGeneralCatalogItem(ctx, "foreign-item")).rejects.toThrow(
    "not found",
  )
  if (process.env.RUN_GENERAL_CATALOG_HISTORY === "1") {
    const prices = await ctx.db.catalogPriceChange.createManyAndReturn({
      data: Array.from({ length: 12 }, (_, i) => ({
        tenantId,
        offeringId: offering.id,
        currencyCode: "NGN",
        priceMinor: 100 + i,
        previousPriceMinor: i === 0 ? null : 99 + i,
        effectiveAt: new Date("2026-01-01T00:00:00Z"),
        changedByUserId: ctx.session.user.id,
        reason: "Owned history QA",
      })),
    })
    const first = await readGeneralCatalogHistory(ctx, {
      itemId: item.id,
      mode: "activity",
      category: "catalog",
    })
    const second = await readGeneralCatalogHistory(ctx, {
      itemId: item.id,
      mode: "activity",
      category: "catalog",
      cursor: first.page.nextCursor,
    })
    const keys = [...first.page.items, ...second.page.items].map(
      (row) => row.key,
    )
    expect(first.page.items).toHaveLength(10)
    expect(second.page.nextCursor).toBeNull()
    expect(new Set(keys).size).toBe(keys.length)
    expect(prices.every((row) => keys.includes(`price:${row.id}`))).toBe(true)
    expect(
      first.answers.every(
        (answer) => generalAnswerSchema.safeParse(answer).success,
      ),
    ).toBe(true)
    const hidden = await readGeneralCatalogHistory(rep, {
      itemId: item.id,
      mode: "activity",
      category: "stock",
    })
    expect(hidden.page.items).toEqual([])
    expect(hidden.answers[0]?.value).toBe("Unavailable")
    const emptyOrders = await readGeneralCatalogHistory(rep, {
      itemId: item.id,
      mode: "orders",
      category: "all",
    })
    expect(emptyOrders.page.items).toEqual([])
    expect(emptyOrders.answers[0]?.detail).toContain("your own sales")
  }
}
