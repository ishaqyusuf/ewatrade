import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { releaseCatalogStockReservationInTransaction } from "./catalog-inventory"
import {
  orderAmendmentDigest as digest,
  orderAmendmentJson as json,
} from "./commercial-order-amendment-evidence"
import { previewCommercialOrderReplacement } from "./commercial-order-replacement-review"
import {
  type OrderReplacementChanges,
  orderReplacementChangesSchema,
} from "./commercial-order-replacement-terms"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import {
  lockCommerceFinancialContext,
  lockCommerceFinancialOrder,
} from "./customer-ledger/commerce-locks"
import { runInOwnTransaction } from "./own-transaction"

export type ReplaceCommercialOrderInput = {
  tenantId: string
  storeId: string
  orderId: string
  actorUserId: string
  clientOperationId: string
  expectedReviewDigest: string
  reason: string
  changes: OrderReplacementChanges
}
/** Caller owns current amendment AND price-override authority. No payment or fulfillment is performed. */
export async function replaceCommercialOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: ReplaceCommercialOrderInput,
) {
  const parsed = orderReplacementChangesSchema.safeParse(input.changes)
  if (
    !parsed.success ||
    !input.actorUserId.trim() ||
    !input.clientOperationId.trim() ||
    input.clientOperationId.length > 128 ||
    !input.reason.trim() ||
    input.reason.trim().length > 500 ||
    !/^[a-f0-9]{64}$/.test(input.expectedReviewDigest)
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "A reviewed replacement, command identity and reason are required.",
    )
  const payloadHash = digest({
    ...input,
    changes: parsed.data,
    reason: input.reason.trim(),
  })
  const readPrevious = () =>
    tx.commercialOrderAmendment.findUnique({
      where: {
        tenantId_clientOperationId: {
          tenantId: input.tenantId,
          clientOperationId: input.clientOperationId,
        },
      },
    })
  const replay = (
    row: NonNullable<Awaited<ReturnType<typeof readPrevious>>>,
  ) => {
    if (
      row.kind !== "REPLACE" ||
      row.orderId !== input.orderId ||
      row.payloadHash !== payloadHash
    )
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This amendment identity was used with different input.",
      )
    return row
  }
  const previous = await readPrevious()
  if (previous) return replay(previous)
  const identity = await tx.commercialOrder.findFirst({
    where: {
      id: input.orderId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: { currencyCode: true, customerId: true },
  })
  if (!identity)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  await lockCommerceFinancialContext(tx, {
    tenantId: input.tenantId,
    ...identity,
  })
  // Creation allocates the order number before reserving stock. Acquire this row before any stock locks.
  const tenant = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} FOR UPDATE`
  if (tenant.length !== 1)
    throw new CatalogError("INVALID_ORDER", "Business unavailable.")
  const locked = await lockCommerceFinancialOrder(tx, {
    ...input,
    expectedIdentity: identity,
  })
  if (!locked || locked.order.storeId !== input.storeId)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  const concurrent = await readPrevious()
  if (concurrent) return replay(concurrent)
  const reservations = await tx.$queryRaw<
    Array<{ id: string; balanceSourceId: string }>
  >`SELECT r."id",r."balanceSourceId" FROM "StockReservation" r JOIN "CommercialOrderLine" l ON l."id"=r."commercialOrderLineId" WHERE l."orderId"=${input.orderId} AND r."tenantId"=${input.tenantId} AND r."storeId"=${input.storeId} ORDER BY r."id" FOR UPDATE OF r`
  const review = await previewCommercialOrderReplacement(tx, {
    ...input,
    changes: parsed.data,
  })
  if (!review.eligible)
    throw new CatalogError(
      "INVALID_ORDER",
      review.blockers.map((row) => row.reason).join(" "),
    )
  if (review.reviewDigest !== input.expectedReviewDigest)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Order or stock changed. Review replacement again.",
    )
  const balanceIds = review.reservationChanges
    .map((row) => row.balanceSourceId)
    .sort()
  if (balanceIds.length) {
    const balances = await tx.$queryRaw<
      Array<{ id: string; revision: number }>
    >`SELECT "id","revision" FROM "StockBalanceSource" WHERE "id" IN (${Prisma.join(balanceIds)}) AND "tenantId"=${input.tenantId} AND "storeId"=${input.storeId} ORDER BY "id" FOR UPDATE`
    if (
      balances.length !== balanceIds.length ||
      balances.some(
        (row) =>
          review.reservationChanges.find(
            (expected) => expected.balanceSourceId === row.id,
          )?.revision !== row.revision,
      )
    )
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Stock changed during replacement confirmation.",
      )
  }
  for (const release of review.releasedReservations) {
    if (
      !reservations.some(
        (row) =>
          row.id === release.reservationId &&
          row.balanceSourceId === release.balanceSourceId,
      )
    )
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Order reservations changed during replacement.",
      )
    await releaseCatalogStockReservationInTransaction(
      tx,
      { tenantId: input.tenantId, reservationId: release.reservationId },
      {
        expectedStoreId: input.storeId,
        expectedCommercialOrderLineId: release.orderLineId,
        requireUncommitted: true,
      },
    )
  }
  const originals = await tx.offeringSnapshot.findMany({
    where: { orderLine: { orderId: input.orderId } },
  })
  const replacement = await createCommercialOrderInTransaction(tx, {
    tenantId: input.tenantId,
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    clientOrderId: `amendment:${createHash("sha256").update(`${input.tenantId}:${input.clientOperationId}`).digest("hex")}`,
    schemaVersion: 1,
    createTrackedServiceWork: false,
    customerId: locked.order.customerId ?? undefined,
    customerName: locked.order.customerName ?? undefined,
    customerPhone: locked.order.customerPhone ?? undefined,
    customerEmail: locked.order.customerEmail ?? undefined,
    notes: locked.order.notes ?? undefined,
    deliveryDueAt: locked.order.deliveryDueAt ?? undefined,
    discountMinor: review.terms.discountMinor,
    taxMinor: review.terms.taxMinor,
    serviceChargeMinor: review.terms.serviceChargeMinor,
    lines: review.terms.lines.map((line) => {
      const original = originals.find(
        (row) => row.orderLineId === line.orderLineId,
      )
      if (!original)
        throw new CatalogError(
          "INVALID_ORDER",
          "Original snapshot unavailable.",
        )
      return {
        offeringId: line.offeringId,
        quantity: line.quantity,
        note: original.note ?? undefined,
        expectedConfigurationVersionId:
          original.configurationVersionId ?? undefined,
        ...(line.unitPriceMinor === null
          ? { enteredTotalMinor: line.totalMinor }
          : { trustedUnitPriceMinor: line.unitPriceMinor }),
      }
    }),
  })
  // Verify canonical creation honored the reviewed terms and did not change unit/service meaning.
  const created = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: replacement.id },
    include: {
      lines: { include: { snapshot: true }, orderBy: { createdAt: "asc" } },
    },
  })
  if (
    created.totalMinor !== review.terms.totalMinor ||
    created.currencyCode !== locked.order.currencyCode ||
    created.lines.length !== review.terms.lines.length
  )
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Replacement terms changed during creation.",
    )
  const unmatched = [...created.lines]
  for (const line of review.terms.lines) {
    const original = originals.find(
      (row) => row.orderLineId === line.orderLineId,
    )
    const index = unmatched.findIndex(
      (row) =>
        row.offeringId === line.offeringId &&
        row.quantity.toString() === line.quantity &&
        row.unitPriceMinor === line.unitPriceMinor &&
        row.totalMinor === line.totalMinor &&
        row.snapshot?.note === original?.note,
    )
    const snapshot = unmatched[index]?.snapshot
    if (
      index < 0 ||
      !original ||
      !snapshot ||
      snapshot.configurationVersionId !== original.configurationVersionId ||
      snapshot.inventoryUnitId !== original.inventoryUnitId ||
      snapshot.unitFactor?.toString() !== original.unitFactor?.toString() ||
      snapshot.stockBehavior !== original.stockBehavior ||
      snapshot.transactionScale !== original.transactionScale ||
      (snapshot.balanceSourceId !== null &&
        !balanceIds.includes(snapshot.balanceSourceId)) ||
      snapshot.pricingPolicy !== original.pricingPolicy ||
      snapshot.serviceWorkPolicy !== original.serviceWorkPolicy ||
      snapshot.serviceAuthorizationPolicy !==
        original.serviceAuthorizationPolicy
    )
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Replacement line meaning changed during creation.",
      )
    unmatched.splice(index, 1)
  }
  if (
    created.deliveryDueAt?.getTime() !== locked.order.deliveryDueAt?.getTime()
  )
    await tx.commercialOrder.update({
      where: { id: replacement.id },
      data: { deliveryDueAt: locked.order.deliveryDueAt },
    })
  await tx.commercialOrder.update({
    where: { id: input.orderId },
    data: { status: "CANCELLED" },
  })
  return tx.commercialOrderAmendment.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      replacementOrderId: replacement.id,
      clientOperationId: input.clientOperationId,
      payloadHash,
      kind: "REPLACE",
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
      beforeSnapshot: review.beforeSnapshot,
      afterSnapshot: json({
        status: "CANCELLED",
        replacementOrderId: replacement.id,
        replacementOrderNumber: replacement.orderNumber,
        terms: review.terms,
        reservationChanges: review.reservationChanges,
        stockOnHandChange: "0",
        moneyMovementMinor: 0,
      }),
    },
  })
}
export async function replaceCommercialOrder(
  db: PrismaClient,
  input: ReplaceCommercialOrderInput,
) {
  return runInOwnTransaction(db, (tx) =>
    replaceCommercialOrderInTransaction(tx, input),
  )
}
