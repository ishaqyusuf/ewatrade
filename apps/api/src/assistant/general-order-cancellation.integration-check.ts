import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import {
  cancelCommercialOrder,
  cancelCommercialOrderInTransaction,
  createCommercialOrder,
  createSimpleCatalogItem,
  previewCommercialOrderCancellation,
  releaseCatalogStockReservation,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"

/** Canonical D01 gate only: this does not claim assistant/HTTP or dashboard acceptance. */
export async function verifyOrderCancellation(ctx: GeneralContext) {
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
    name: "Cancellation composition QA",
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
  console.info("Order cancellation: prepare two orders sharing reserved stock")
  const first = await create("2")
  const second = await create("1")
  const scope = { tenantId, storeId, orderId: first.id }
  const review = await previewCommercialOrderCancellation(db, scope)
  expect(review.eligible).toBe(true)
  expect(review.releases.map((row) => row.quantity)).toEqual(["2"])
  expect(review.moneyRefundMinor).toBe(0)
  await expect(
    previewCommercialOrderCancellation(db, { ...scope, storeId: "foreign" }),
  ).rejects.toThrow("not found")
  const command = {
    ...scope,
    actorUserId,
    clientOperationId: randomUUID(),
    reason: "Customer cancelled before fulfillment",
    expectedReviewDigest: review.reviewDigest,
  }
  const readBalance = () =>
    db.stockBalanceSource.findUniqueOrThrow({ where: { id: source.id } })
  console.info("Order cancellation: receipt rollback")
  await expect(
    withPerformanceTrace(
      "job",
      () =>
        db.$transaction(
          async (tx) => {
            await cancelCommercialOrderInTransaction(tx, command)
            throw Error("Cancellation receipt rollback")
          },
          { maxWait: 10000, timeout: 30000 },
        ),
      (trace) => console.info("Cancellation rollback:", JSON.stringify(trace)),
    ),
  ).rejects.toThrow("Cancellation receipt rollback")
  expect((await readBalance()).reservedQuantity.toFixed()).toBe("3")
  expect(
    (await db.commercialOrder.findUniqueOrThrow({ where: { id: first.id } }))
      .status,
  ).toBe("CONFIRMED")
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    0,
  )
  console.info("Order cancellation: confirmation and exact replay")
  const saved = await withPerformanceTrace(
    "job",
    () => cancelCommercialOrder(db, command),
    (trace) =>
      console.info("Cancellation confirmation:", JSON.stringify(trace)),
  )
  expect(saved.kind).toBe("CANCEL")
  expect(saved.beforeSnapshot).toMatchObject({
    status: "CONFIRMED",
    totalMinor: 200,
  })
  expect(saved.afterSnapshot).toMatchObject({
    status: "CANCELLED",
    stockOnHandChange: "0",
    moneyRefundMinor: 0,
  })
  expect((await cancelCommercialOrder(db, command)).id).toBe(saved.id)
  await expect(
    cancelCommercialOrder(db, { ...command, reason: "Changed request" }),
  ).rejects.toThrow("different input")
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    1,
  )
  expect((await readBalance()).reservedQuantity.toFixed()).toBe("1")
  expect((await readBalance()).onHandQuantity.toFixed()).toBe("6")
  expect(
    await db.stockMovement.count({ where: { operation: { tenantId } } }),
  ).toBe(0)
  const original = await db.offeringSnapshot.findFirstOrThrow({
    where: { orderLine: { orderId: first.id } },
  })
  expect(original.quantity.toFixed()).toBe("2")
  expect(original.totalMinor).toBe(200)
  console.info(
    "Order cancellation: changed reservation invalidates prior review",
  )
  const nextScope = { tenantId, storeId, orderId: second.id }
  const nextReview = await previewCommercialOrderCancellation(db, nextScope)
  const reservation = nextReview.releases[0]
  if (!reservation) throw Error("Second reservation required")
  await releaseCatalogStockReservation(db, {
    tenantId,
    reservationId: reservation.reservationId,
  })
  const nextCommand = {
    ...nextScope,
    actorUserId,
    clientOperationId: randomUUID(),
    reason: "Second cancellation",
    expectedReviewDigest: nextReview.reviewDigest,
  }
  await expect(cancelCommercialOrder(db, nextCommand)).rejects.toThrow(
    "Review cancellation again",
  )
  expect(
    (await db.commercialOrder.findUniqueOrThrow({ where: { id: second.id } }))
      .status,
  ).toBe("CONFIRMED")
  const fresh = await previewCommercialOrderCancellation(db, nextScope)
  expect(fresh.releases).toHaveLength(0)
  await cancelCommercialOrder(db, {
    ...nextCommand,
    expectedReviewDigest: fresh.reviewDigest,
  })
  expect((await readBalance()).reservedQuantity.toFixed()).toBe("0")
  expect((await readBalance()).onHandQuantity.toFixed()).toBe("6")
}
