import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createSimpleCatalogItem,
  listCatalogLowStockPage,
  listInventoryBalancePage,
} from "@ewatrade/db/queries"
import { inventoryRouter } from "../trpc/routers/inventory"
import type { GeneralContext } from "./general-context"

/** Owned fixtures in the guarded isolated Development database only. */
export async function verifyLowStock(ctx: GeneralContext) {
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
    name: "Low stock QA",
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
  if (!unit) throw Error("Unit fixture missing")
  const caller = inventoryRouter.createCaller(ctx)
  const input = { storeId, threshold: "1", catalogItemId: item.id }
  const missing = await caller.lowStockPage(input)
  expect(missing.unavailable.map((row) => row.offeringId)).toEqual([
    offering.id,
  ])
  expect(missing.lowStock).toEqual([])
  expect(await ctx.db.stockBalanceSource.count({ where: { tenantId } })).toBe(0)
  const balance = await ctx.db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      variantId: offering.variantId,
      productId: unit.configurationVersion.productId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "10",
      reservedQuantity: "9",
    },
  })
  const low = await caller.lowStockPage(input)
  expect(low.lowStock).toMatchObject([
    {
      offeringId: offering.id,
      availableOfferingQuantity: "1",
      unitName: "Piece",
    },
  ])
  expect(low.unavailable).toEqual([])
  expect(
    (await caller.lowStockPage({ ...input, threshold: "0" })).lowStock,
  ).toEqual([])
  await ctx.db.stockBalanceSource.update({
    where: { id: balance.id },
    data: { onHandQuantity: "9" },
  })
  expect(
    (await caller.lowStockPage({ ...input, threshold: "0" })).lowStock,
  ).toMatchObject([{ availableOfferingQuantity: "0" }])
  expect(
    (await listCatalogLowStockPage(ctx.db, { ...input, tenantId: "other" }))
      .scannedCount,
  ).toBe(0)
  await expect(
    caller.lowStockPage({ ...input, storeId: "other" }),
  ).rejects.toThrow("Store not found")
  const cashier = {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      membership: { ...ctx.tenantContext.membership, role: "CASHIER" as const },
    },
  }
  await expect(
    inventoryRouter.createCaller(cashier).lowStockPage(input),
  ).rejects.toThrow("permission")
  await ctx.db.storeOfferingAvailability.updateMany({
    where: { offeringId: offering.id, storeId },
    data: { isAvailable: false },
  })
  expect((await caller.lowStockPage(input)).scannedCount).toBe(0)
  if (process.env.RUN_GENERAL_BALANCE_PAGE === "1") {
    await ctx.db.stockBalanceSource.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        tenantId,
        storeId,
        variantId: offering.variantId,
        productId: unit.configurationVersion.productId,
        inventoryUnitId: unit.id,
        kind: "SHARED_POOL" as const,
        custodyType: "TRANSIT" as const,
        custodyReferenceId: `qa-transit-${i}`,
        onHandQuantity: "9007199254740993.125",
        reservedQuantity: "0.125",
      })),
    })
    const first = await caller.balancePage({
      storeId,
      catalogItemId: item.id,
      limit: 10,
    })
    const second = await caller.balancePage({
      storeId,
      catalogItemId: item.id,
      limit: 10,
      cursor: first.nextCursor!,
    })
    const rows = [...first.rows, ...second.rows]
    expect(rows).toHaveLength(13)
    expect(new Set(rows.map((row) => row.balanceSourceId)).size).toBe(13)
    expect(second.nextCursor).toBeNull()
    const totalsFirst = await caller.compatibleTotalsPage({
      storeId,
      catalogItemId: item.id,
      limit: 10,
    })
    const totalsSecond = await caller.compatibleTotalsPage({
      storeId,
      catalogItemId: item.id,
      limit: 10,
      cursor: totalsFirst.nextCursor!,
    })
    const groups = [...totalsFirst.items, ...totalsSecond.items]
    expect(groups).toHaveLength(13)
    expect(new Set(groups.map((group) => group.key)).size).toBe(13)
    expect(totalsSecond.nextCursor).toBeNull()
    expect(
      groups.every(
        (group) =>
          group.canonicalUnitName === "Piece" && group.sourceCount === 1,
      ),
    ).toBe(true)
    expect(
      groups
        .filter((group) => group.custodyType === "TRANSIT")
        .every((group) => group.availableCanonicalQuantity === "0"),
    ).toBe(true)
    await expect(
      caller.compatibleTotalsPage({
        storeId,
        catalogItemId: "other",
        cursor: totalsFirst.nextCursor!,
      }),
    ).rejects.toThrow("totals changed")
    await expect(
      inventoryRouter.createCaller(cashier).compatibleTotalsPage({ storeId }),
    ).rejects.toThrow("permission")

    const full = await caller.balanceReport({
      storeId,
      includeCompatibleTotals: true,
    })
    expect(
      full.compatibleCanonicalTotals.filter(
        (group) => group.custodyType === "TRANSIT",
      ),
    ).toHaveLength(12)
    expect(
      full.compatibleCanonicalTotals
        .filter((group) => group.custodyType === "TRANSIT")
        .every((group) => group.availableCanonicalQuantity === "0"),
    ).toBe(true)
    expect(
      full.compatibleCanonicalTotals.every(
        (group) => group.configurationVersionId === unit.configurationVersionId,
      ),
    ).toBe(true)

    expect(
      rows
        .filter((row) => row.custodyType === "TRANSIT")
        .every(
          (row) =>
            row.availableQuantity === "0" &&
            row.onHandQuantity === "9007199254740993.125",
        ),
    ).toBe(true)
    await expect(
      caller.balancePage({
        storeId,
        catalogItemId: "other",
        cursor: first.nextCursor!,
      }),
    ).rejects.toThrow("list changed")
    await expect(
      caller.balancePage({ storeId, cursor: "foreign" }),
    ).rejects.toThrow("list changed")
    await expect(
      inventoryRouter.createCaller(cashier).balancePage({ storeId }),
    ).rejects.toThrow("permission")
    expect(
      (await listInventoryBalancePage(ctx.db, { tenantId: "other", storeId }))
        .rows,
    ).toEqual([])
  }
}
