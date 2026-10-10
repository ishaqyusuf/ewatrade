import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import {
  amendCommercialOrderMetadata,
  amendCommercialOrderMetadataInTransaction,
  createCommercialOrder,
  createSimpleCatalogItem,
  previewCommercialOrderMetadataAmendment,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"

/** Canonical-only evidence; assistant transport and dashboard require separate gates. */
export async function verifyOrderMetadataAmendment(ctx: GeneralContext) {
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
    name: "Metadata amendment QA",
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
  const customer = await db.customer.create({
    data: { tenantId, name: "Metadata QA customer" },
  })
  const original = await db.offeringSnapshot.findFirstOrThrow({
    where: { orderLine: { orderId: order.id } },
  })
  const readOrder = () =>
    db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } })
  const readBalance = () =>
    db.stockBalanceSource.findUniqueOrThrow({ where: { id: source.id } })
  const patch = {
    customerId: customer.id,
    notes: "Deliver at reception",
    deliveryDueAt: "2026-10-15T11:00:00+01:00",
  }
  const review = await previewCommercialOrderMetadataAmendment(db, {
    ...scope,
    patch,
  })
  expect(review.eligible).toBe(true)
  expect(review.after).toMatchObject({
    customerId: customer.id,
    customerName: customer.name,
    deliveryDueAt: "2026-10-15T10:00:00.000Z",
  })
  await expect(
    previewCommercialOrderMetadataAmendment(db, {
      ...scope,
      storeId: "foreign",
      patch,
    }),
  ).rejects.toThrow("not found")
  await expect(
    previewCommercialOrderMetadataAmendment(db, {
      ...scope,
      patch: { customerId: "foreign" },
    }),
  ).rejects.toThrow("not found")
  const command = {
    ...scope,
    actorUserId,
    clientOperationId: randomUUID(),
    reason: "Requested delivery update",
    patch,
    expectedReviewDigest: review.reviewDigest,
  }
  console.info("Order metadata: atomic receipt rollback")
  await expect(
    withPerformanceTrace(
      "job",
      () =>
        db.$transaction(
          async (tx) => {
            await amendCommercialOrderMetadataInTransaction(tx, command)
            throw Error("Metadata receipt rollback")
          },
          { maxWait: 10000, timeout: 30000 },
        ),
      (trace) => console.info("Metadata rollback:", JSON.stringify(trace)),
    ),
  ).rejects.toThrow("Metadata receipt rollback")
  expect((await readOrder()).customerId).toBeNull()
  expect((await readOrder()).notes).toBeNull()
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    0,
  )
  expect((await readBalance()).reservedQuantity.toFixed()).toBe("2")
  console.info("Order metadata: confirmation and exact replay")
  const saved = await withPerformanceTrace(
    "job",
    () => amendCommercialOrderMetadata(db, command),
    (trace) => console.info("Metadata confirmation:", JSON.stringify(trace)),
  )
  expect(saved.kind).toBe("METADATA")
  expect(saved.beforeSnapshot).toMatchObject({
    customerId: null,
    totalMinor: 200,
  })
  expect(saved.afterSnapshot).toMatchObject({
    metadata: { customerId: customer.id, notes: patch.notes },
    totalChangeMinor: 0,
    moneyMovementMinor: 0,
  })
  expect((await amendCommercialOrderMetadata(db, command)).id).toBe(saved.id)
  await expect(
    amendCommercialOrderMetadata(db, {
      ...command,
      reason: "Different request",
    }),
  ).rejects.toThrow("different input")
  const updated = await readOrder()
  expect(updated.status).toBe("CONFIRMED")
  expect(updated.customerId).toBe(customer.id)
  expect(updated.deliveryDueAt?.toISOString()).toBe("2026-10-15T10:00:00.000Z")
  expect(updated.totalMinor).toBe(200)
  expect((await readBalance()).reservedQuantity.toFixed()).toBe("2")
  expect((await readBalance()).onHandQuantity.toFixed()).toBe("6")
  expect(
    await db.offeringSnapshot.findUniqueOrThrow({ where: { id: original.id } }),
  ).toEqual(original)
  expect(
    await db.stockMovement.count({ where: { operation: { tenantId } } }),
  ).toBe(0)
  console.info("Order metadata: changed customer rejects stale review")
  const next = await db.customer.create({
    data: { tenantId, name: "Next customer" },
  })
  const nextPatch = { customerId: next.id }
  const nextReview = await previewCommercialOrderMetadataAmendment(db, {
    ...scope,
    patch: nextPatch,
  })
  await db.customer.update({
    where: { id: next.id },
    data: { name: "Changed customer" },
  })
  await expect(
    amendCommercialOrderMetadata(db, {
      ...command,
      clientOperationId: randomUUID(),
      patch: nextPatch,
      expectedReviewDigest: nextReview.reviewDigest,
    }),
  ).rejects.toThrow("Review the amendment again")
  expect((await readOrder()).customerId).toBe(customer.id)
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    1,
  )
  const clearPatch = { customerId: null, notes: null, deliveryDueAt: null }
  const clearReview = await previewCommercialOrderMetadataAmendment(db, {
    ...scope,
    patch: clearPatch,
  })
  await amendCommercialOrderMetadata(db, {
    ...command,
    clientOperationId: randomUUID(),
    patch: clearPatch,
    expectedReviewDigest: clearReview.reviewDigest,
  })
  expect(await readOrder()).toMatchObject({
    customerId: null,
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    notes: null,
    deliveryDueAt: null,
    totalMinor: 200,
    status: "CONFIRMED",
  })
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    2,
  )
  expect((await readBalance()).reservedQuantity.toFixed()).toBe("2")
}
