import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createCommercialOrder,
  createSimpleCatalogItem,
  previewCommercialOrderReplacement,
  replaceCommercialOrder,
  replaceCommercialOrderInTransaction,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
/** Canonical replacement gate; assistant and dashboard acceptance are separate. */
export async function verifyOrderReplacementPreview(ctx: GeneralContext) {
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("Owned QA Store required")
  const actorUserId = ctx.session.user.id
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Replacement preview QA",
    canonicalUnitName: "Piece",
    priceMinor: 100,
  })
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
    include: {
      productUnitOffering: {
        include: { inventoryUnit: { include: { configurationVersion: true } } },
      },
    },
  })
  const unit = offering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("Unit required")
  const source = await db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "6",
    },
  })
  const create = async (quantity: string) => {
    const current = await db.stockBalanceSource.findUniqueOrThrow({
      where: { id: source.id },
    })
    return createCommercialOrder(db, {
      tenantId,
      storeId,
      actorUserId,
      clientOrderId: randomUUID(),
      schemaVersion: 1,
      lines: [
        {
          offeringId: offering.id,
          quantity,
          expectedFixedPriceMinor: 100,
          expectedConfigurationVersionId: unit.configurationVersionId,
          expectedBalanceRevision: current.revision,
        },
      ],
    })
  }

  const order = await create("2")
  const scope = { tenantId, storeId, orderId: order.id }

  const line = await db.commercialOrderLine.findFirstOrThrow({
    where: { orderId: order.id },
  })
  const original = await db.offeringSnapshot.findUniqueOrThrow({
    where: { orderLineId: line.id },
  })
  const review = await previewCommercialOrderReplacement(db, {
    ...scope,
    changes: [{ orderLineId: line.id, quantity: "3", unitPriceMinor: 125 }],
  })
  expect(review.eligible).toBe(true)
  expect(review.terms).toMatchObject({
    originalTotalMinor: 200,
    totalMinor: 375,
    totalChangeMinor: 175,
  })
  expect(review.reservationChanges).toHaveLength(1)
  expect(review.reservationChanges[0]).toMatchObject({
    releaseQuantity: "2",
    replacementQuantity: "3",
    reservationChange: "1",
    availableBeforeRelease: "4",
    availableAfterRelease: "6",
    sufficient: true,
  })
  const unavailable = await previewCommercialOrderReplacement(db, {
    ...scope,
    changes: [{ orderLineId: line.id, quantity: "7" }],
  })
  expect(unavailable.eligible).toBe(false)
  expect(unavailable.reservationChanges[0]?.sufficient).toBe(false)
  await expect(
    previewCommercialOrderReplacement(db, {
      ...scope,
      changes: [{ orderLineId: "foreign", quantity: "3" }],
    }),
  ).rejects.toThrow("outside this order")
  await expect(
    previewCommercialOrderReplacement(db, {
      ...scope,
      storeId: "foreign",
      changes: [{ orderLineId: line.id, quantity: "3" }],
    }),
  ).rejects.toThrow("not found")
  expect(
    await db.offeringSnapshot.findUniqueOrThrow({ where: { id: original.id } }),
  ).toEqual(original)
  expect(
    (
      await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).reservedQuantity.toFixed(),
  ).toBe("2")
  expect(
    (await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } }))
      .totalMinor,
  ).toBe(200)
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    0,
  )
  await db.sellableOffering.update({
    where: { id: offering.id },
    data: { fixedPriceMinor: 150 },
  })
  const refreshed = await previewCommercialOrderReplacement(db, {
    ...scope,
    changes: [{ orderLineId: line.id, quantity: "3", unitPriceMinor: 125 }],
  })
  expect(refreshed.reviewDigest).not.toBe(review.reviewDigest)
  expect(refreshed.terms.totalMinor).toBe(375)
  const currentBalance = await db.stockBalanceSource.findUniqueOrThrow({
    where: { id: source.id },
  })
  const sharedOrder = await createCommercialOrder(db, {
    tenantId,
    storeId,
    actorUserId,
    clientOrderId: randomUUID(),
    schemaVersion: 1,
    lines: [0, 1].map(() => ({
      offeringId: offering.id,
      quantity: "1",
      expectedFixedPriceMinor: 150,
      expectedConfigurationVersionId: unit.configurationVersionId,
      expectedBalanceRevision: currentBalance.revision,
    })),
  })
  const sharedLines = await db.commercialOrderLine.findMany({
    where: { orderId: sharedOrder.id },
  })
  const combined = await previewCommercialOrderReplacement(db, {
    ...scope,
    orderId: sharedOrder.id,
    changes: sharedLines.map((row) => ({ orderLineId: row.id, quantity: "3" })),
  })
  expect(combined.eligible).toBe(false)
  expect(combined.reservationChanges).toHaveLength(1)
  expect(combined.reservationChanges[0]).toMatchObject({
    replacementQuantity: "6",
    releaseQuantity: "2",
    availableAfterRelease: "4",
    sufficient: false,
  })
  expect(
    combined.blockers.some((row) => row.code === "INSUFFICIENT_STOCK"),
  ).toBe(true)
  const changes = [{ orderLineId: line.id, quantity: "3", unitPriceMinor: 125 }]
  const fresh = await previewCommercialOrderReplacement(db, {
    ...scope,
    changes,
  })
  const command = {
    ...scope,
    changes,
    actorUserId,
    clientOperationId: randomUUID(),
    reason: "Customer changed quantity and agreed price",
    expectedReviewDigest: fresh.reviewDigest,
  }
  await expect(
    replaceCommercialOrder(db, {
      ...command,
      expectedReviewDigest: refreshed.reviewDigest,
    }),
  ).rejects.toThrow("Review replacement again")
  console.info("Replacement command: rollback after receipt")
  await expect(
    db.$transaction(
      async (tx) => {
        await replaceCommercialOrderInTransaction(tx, command)
        throw Error("Replacement receipt rollback")
      },
      { maxWait: 10000, timeout: 30000 },
    ),
  ).rejects.toThrow("Replacement receipt rollback")
  expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(2)
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    0,
  )
  expect(
    (await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
  ).toBe("CONFIRMED")
  expect(
    (
      await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).reservedQuantity.toFixed(),
  ).toBe("4")
  console.info("Replacement command: confirmation and exact replay")
  const receipt = await replaceCommercialOrder(db, command)
  expect(receipt.kind).toBe("REPLACE")
  expect(receipt.replacementOrderId).not.toBeNull()
  expect((await replaceCommercialOrder(db, command)).id).toBe(receipt.id)
  await expect(
    replaceCommercialOrder(db, { ...command, reason: "Different request" }),
  ).rejects.toThrow("different input")
  expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(3)
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    1,
  )
  expect(
    (await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
  ).toBe("CANCELLED")
  const replacementId = receipt.replacementOrderId
  if (!replacementId) throw Error("Replacement ID required")
  const replacement = await db.commercialOrder.findUniqueOrThrow({
    where: { id: replacementId },
    include: { lines: { include: { snapshot: true } } },
  })
  expect(replacement).toMatchObject({
    totalMinor: 375,
    status: "CONFIRMED",
    amountPaidMinor: 0,
    storeId,
    tenantId,
  })
  const originalOrder = await db.commercialOrder.findUniqueOrThrow({
    where: { id: order.id },
  })
  expect(replacement.deliveryDueAt?.toISOString()).toBe(
    originalOrder.deliveryDueAt?.toISOString(),
  )
  expect(replacement.lines[0]?.quantity.toFixed()).toBe("3")
  expect(replacement.lines[0]?.snapshot?.unitPriceMinor).toBe(125)
  expect(
    await db.offeringSnapshot.findUniqueOrThrow({ where: { id: original.id } }),
  ).toEqual(original)
  const finalBalance = await db.stockBalanceSource.findUniqueOrThrow({
    where: { id: source.id },
  })
  expect(finalBalance.reservedQuantity.toFixed()).toBe("5")
  expect(finalBalance.onHandQuantity.toFixed()).toBe("6")
  expect(
    await db.stockMovement.count({ where: { operation: { tenantId } } }),
  ).toBe(0)
}
