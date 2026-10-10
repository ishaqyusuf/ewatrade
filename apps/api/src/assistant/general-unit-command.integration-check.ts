import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createProductUnitConfigurationDraft,
  createProductUnitConfigurationDraftInTransaction,
  createSimpleCatalogItem,
  publishProductUnitConfigurationInTransaction,
  updateProductUnitConfigurationDraftInTransaction,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"

/** Runs only inside the guarded isolated GENERAL fixture and its cleanup. */
export async function verifyUnitCommands(ctx: GeneralContext) {
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const actorUserId = ctx.session.user.id
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Unit lifecycle QA",
    canonicalUnitName: "Piece",
    priceMinor: 25000,
  })
  const product = await db.catalogProduct.findUniqueOrThrow({
    where: { catalogItemId: item.id },
  })
  const original = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
  })
  const input = { productId: product.id, tenantId }
  await expect(
    db.$transaction(
      async (tx) => {
        await createProductUnitConfigurationDraftInTransaction(tx, input)
        throw Error("Receipt failure")
      },
      { maxWait: 10000, timeout: 30000 },
    ),
  ).rejects.toThrow("Receipt failure")
  expect(
    await db.unitConfigurationVersion.count({
      where: { productId: product.id, status: "DRAFT" },
    }),
  ).toBe(0)
  const draft = await createProductUnitConfigurationDraft(db, input)
  expect(draft.status).toBe("draft")
  const edit = {
    tenantId,
    configurationId: draft.id,
    canonicalBalanceScale: draft.canonicalBalanceScale,
    units: draft.units.map((unit) => ({
      key: unit.key,
      name: "Single piece",
      factor: unit.factor,
      stockBehavior: unit.stockBehavior,
      transactionScale: unit.transactionScale,
    })),
  }
  await expect(
    db.$transaction(
      async (tx) => {
        await updateProductUnitConfigurationDraftInTransaction(tx, edit)
        throw Error("Receipt failure")
      },
      { maxWait: 10000, timeout: 30000 },
    ),
  ).rejects.toThrow("Receipt failure")
  expect(
    (
      await db.inventoryUnit.findFirstOrThrow({
        where: { configurationVersionId: draft.id },
      })
    ).name,
  ).toBe("Piece")
  const publish = { tenantId, actorUserId, configurationId: draft.id }
  await expect(
    db.$transaction(
      async (tx) => {
        await updateProductUnitConfigurationDraftInTransaction(tx, edit)
        await publishProductUnitConfigurationInTransaction(tx, publish)
        throw Error("Receipt failure")
      },
      { maxWait: 10000, timeout: 30000 },
    ),
  ).rejects.toThrow("Receipt failure")
  expect(
    (await db.catalogProduct.findUniqueOrThrow({ where: { id: product.id } }))
      .currentUnitConfigurationVersionId,
  ).toBe(product.currentUnitConfigurationVersionId)
  expect(
    (
      await db.sellableOffering.findUniqueOrThrow({
        where: { id: original.id },
      })
    ).status,
  ).toBe("ACTIVE")
  expect(
    await db.sellableOffering.count({ where: { catalogItemId: item.id } }),
  ).toBe(1)
  const published = await db.$transaction(
    async (tx) => {
      await updateProductUnitConfigurationDraftInTransaction(tx, edit)
      return publishProductUnitConfigurationInTransaction(tx, publish)
    },
    { maxWait: 10000, timeout: 30000 },
  )
  expect(published.status).toBe("current")
  expect(published.units[0]?.name).toBe("Single piece")
  expect(
    (
      await db.sellableOffering.findUniqueOrThrow({
        where: { id: original.id },
      })
    ).status,
  ).toBe("ARCHIVED")
  const replacement = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id, status: "ACTIVE" },
    include: { storeAvailability: true },
  })
  expect(replacement.fixedPriceMinor).toBe(25000)
  expect(replacement.variantId).toBe(original.variantId)
  expect(
    replacement.storeAvailability.map((row) => ({
      storeId: row.storeId,
      isAvailable: row.isAvailable,
    })),
  ).toEqual([{ storeId, isAvailable: true }])
}
