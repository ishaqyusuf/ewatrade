import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  type ProductUsage,
  QaDataClassification,
  TenantMode,
  TenantType,
} from "../../generated/prisma/enums"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import { listCatalogItemActivity } from "./catalog-detail"
import { postSingleBalanceStockOperation } from "./inventory-operations"

setDefaultTimeout(120_000)
describeWithServiceCommerceDatabase("recording internal use on Neon", () => {
  let db: PrismaClient
  let tenantId: string
  let storeId: string
  let actorUserId: string
  const fixtures = new Map<
    ProductUsage,
    { itemId: string; balanceSourceId: string }
  >()

  beforeAll(async () => {
    db = (await import("../client")).prisma
    actorUserId = (
      await db.user.create({
        data: {
          name: "Internal Use Operator",
          email: `internal-use-${randomUUID()}@example.invalid`,
          emailVerified: true,
        },
      })
    ).id
    tenantId = (
      await db.tenant.create({
        data: {
          slug: `internal-use-${randomUUID()}`,
          name: "Internal use acceptance",
          type: TenantType.MERCHANT,
          enabledModes: [TenantMode.MERCHANT],
          dataClassification: QaDataClassification.QA,
        },
      })
    ).id
    storeId = (
      await db.store.create({
        data: { tenantId, slug: "office", name: "Office" },
      })
    ).id
    for (const usage of ["INTERNAL_USE", "BOTH", "FOR_SALE"] as const) {
      const item = await db.catalogItem.create({
        data: {
          tenantId,
          slug: `internal-use-${randomUUID()}`,
          kind: "PRODUCT",
          name: `Printer paper ${usage}`,
          product: { create: { usage } },
          variants: {
            create: { key: "default", name: "Default", isDefault: true },
          },
        },
        include: { product: true, variants: true },
      })
      if (!item.product || !item.variants[0])
        throw new Error("Incomplete internal use fixture")
      const configuration = await db.unitConfigurationVersion.create({
        data: {
          productId: item.product.id,
          version: 1,
          status: "CURRENT",
          canonicalBalanceScale: 18,
          units: {
            create: {
              key: "piece",
              name: "pieces",
              factor: "1",
              stockBehavior: "CANONICAL_SHARED",
              transactionScale: 0,
            },
          },
        },
        include: { units: true },
      })
      if (!configuration.units[0]) throw new Error("Missing fixture unit")
      await db.catalogProduct.update({
        where: { id: item.product.id },
        data: { currentUnitConfigurationVersionId: configuration.id },
      })
      const balance = await db.stockBalanceSource.create({
        data: {
          tenantId,
          storeId,
          productId: item.product.id,
          variantId: item.variants[0].id,
          inventoryUnitId: configuration.units[0].id,
          kind: "SHARED_POOL",
          onHandQuantity: "10",
        },
      })
      fixtures.set(usage, { itemId: item.id, balanceSourceId: balance.id })
    }
  })

  afterAll(async () => {
    if (!db) return
    if (!tenantId) {
      if (actorUserId) await db.user.deleteMany({ where: { id: actorUserId } })
      return
    }
    await db.$transaction(async (tx) => {
      await tx.financeInventoryValuationEvent.deleteMany({
        where: { tenantId },
      })
      await tx.financeInventoryPool.deleteMany({ where: { tenantId } })
      await tx.stockMovement.deleteMany({ where: { operation: { tenantId } } })
      await tx.stockOperation.deleteMany({ where: { tenantId } })
      await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
      await tx.catalogItem.deleteMany({ where: { tenantId } })
      await tx.tenant.deleteMany({ where: { id: tenantId } })
      await tx.user.deleteMany({ where: { id: actorUserId } })
    })
  })

  function fixture(usage: ProductUsage) {
    const found = fixtures.get(usage)
    if (!found) throw new Error(`Missing ${usage} fixture`)
    return found
  }

  async function useCommand(usage: ProductUsage, reason?: string) {
    const balance = await db.stockBalanceSource.findUniqueOrThrow({
      where: { id: fixture(usage).balanceSourceId },
      include: { inventoryUnit: true },
    })
    return {
      actorUserId,
      balanceSourceId: balance.id,
      clientOperationId: randomUUID(),
      direction: "decrease" as "decrease" | "increase",
      enteredInventoryUnitId: balance.inventoryUnitId,
      enteredQuantity: "2",
      expectedBalanceRevision: balance.revision,
      expectedConfigurationVersionId:
        balance.inventoryUnit.configurationVersionId,
      schemaVersion: 1,
      source: "internal_use_acceptance",
      storeId,
      tenantId,
      type: "internal_use" as const,
      ...(reason === undefined ? {} : { reason }),
    }
  }

  test("used 2 pieces drops stock by 2 and shows in item activity", async () => {
    const command = await useCommand("INTERNAL_USE", "Office printing")
    const operation = await postSingleBalanceStockOperation(db, command)
    expect(operation.type).toBe("INTERNAL_USE")
    expect(operation.movements[0]?.signedCanonicalEffect).toBe("-2")

    const balance = await db.stockBalanceSource.findUniqueOrThrow({
      where: { id: command.balanceSourceId },
    })
    expect(balance.onHandQuantity.toFixed()).toBe("8")

    // A retry of the same request replays instead of using stock twice.
    const replay = await postSingleBalanceStockOperation(db, command)
    expect(replay.id).toBe(operation.id)
    const unchanged = await db.stockBalanceSource.findUniqueOrThrow({
      where: { id: command.balanceSourceId },
    })
    expect(unchanged.onHandQuantity.toFixed()).toBe("8")

    const activity = await listCatalogItemActivity(
      db,
      {
        tenantId,
        storeId,
        itemId: fixture("INTERNAL_USE").itemId,
        inventory: true,
      },
      { limit: 10, category: "stock" },
    )
    expect(activity.items[0]).toMatchObject({
      title: "internal use",
      changeDirection: "decrease",
      actorName: "Internal Use Operator",
    })
    expect(activity.items[0]?.description).toContain("balance 10 → 8")
    expect(activity.items[0]?.description).toContain("Office printing")
  })

  test("Both Products record use without a note", async () => {
    const operation = await postSingleBalanceStockOperation(
      db,
      await useCommand("BOTH"),
    )
    expect(operation.type).toBe("INTERNAL_USE")
    expect(operation.reason).toBeNull()
  })

  test("For sale Products and increases are refused without changing stock", async () => {
    await expect(
      postSingleBalanceStockOperation(db, await useCommand("FOR_SALE")),
    ).rejects.toThrow("Internal use or Both")
    await expect(
      postSingleBalanceStockOperation(db, {
        ...(await useCommand("INTERNAL_USE")),
        direction: "increase",
      }),
    ).rejects.toThrow("only decreases stock")
    const forSale = await db.stockBalanceSource.findUniqueOrThrow({
      where: { id: fixture("FOR_SALE").balanceSourceId },
    })
    expect(forSale.onHandQuantity.toFixed()).toBe("10")
  })
})
