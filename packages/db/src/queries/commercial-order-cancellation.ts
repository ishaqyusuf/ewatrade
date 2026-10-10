import {
  addExactDecimals,
  compareExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { releaseCatalogStockReservationInTransaction } from "./catalog-inventory"
import {
  orderAmendmentDigest as digest,
  orderAmendmentJson as json,
} from "./commercial-order-amendment-evidence"
import { getCommercialOrderAmendmentEligibility } from "./commercial-order-amendment-review"
import { lockCommerceFinancialOrder } from "./customer-ledger/commerce-locks"
import { runInOwnTransaction } from "./own-transaction"

type Scope = { tenantId: string; storeId: string; orderId: string }

/** Preview is read-only and does not authorize a write or promise an actual refund. */
export async function previewCommercialOrderCancellation(
  db: Prisma.TransactionClient,
  input: Scope,
) {
  const review = await getCommercialOrderAmendmentEligibility(db, input)
  return buildCommercialOrderCancellationPreview(review, input)
}

/** Internal composition from the same scoped source read; never authorizes a write. */
export function buildCommercialOrderCancellationPreview(
  review: Awaited<ReturnType<typeof getCommercialOrderAmendmentEligibility>>,
  input: Scope,
) {
  const releases = review.source.lines.flatMap((line) => {
    const reservation = line.stockReservation
    if (!reservation) return []
    if (
      reservation.tenantId !== input.tenantId ||
      reservation.storeId !== input.storeId ||
      reservation.commercialOrderLineId !== line.id ||
      reservation.balanceSource.id !== reservation.balanceSourceId ||
      reservation.balanceSource.tenantId !== input.tenantId ||
      reservation.balanceSource.storeId !== input.storeId
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "Order reservation ownership is inconsistent.",
      )
    if (reservation.status !== "ACTIVE") return []
    const quantity =
      reservation.enteredInventoryUnit.stockBehavior === "PACKAGED_STOCK"
        ? reservation.enteredQuantity.toString()
        : reservation.canonicalQuantity.toString()
    if (
      compareExactDecimals(quantity, "0") <= 0 ||
      compareExactDecimals(
        reservation.balanceSource.reservedQuantity.toString(),
        quantity,
      ) < 0
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "Order reservation quantities need reconciliation.",
      )
    return [
      {
        reservationId: reservation.id,
        orderLineId: line.id,
        balanceSourceId: reservation.balanceSourceId,
        quantity,
      },
    ]
  })
  const releasedByBalance = new Map<string, string>()
  const reservationIds = new Set<string>()
  for (const release of releases) {
    if (reservationIds.has(release.reservationId))
      throw new CatalogError(
        "INVALID_ORDER",
        "An order reservation was counted more than once.",
      )
    reservationIds.add(release.reservationId)
    releasedByBalance.set(
      release.balanceSourceId,
      addExactDecimals(
        releasedByBalance.get(release.balanceSourceId) ?? "0",
        release.quantity,
      ),
    )
  }
  for (const line of review.source.lines) {
    const reservation = line.stockReservation
    if (
      reservation &&
      compareExactDecimals(
        releasedByBalance.get(reservation.balanceSourceId) ?? "0",
        reservation.balanceSource.reservedQuantity.toString(),
      ) > 0
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "Combined order reservations need reconciliation.",
      )
  }
  const beforeSnapshot = json(review.source)
  return {
    orderId: review.orderId,
    orderNumber: review.orderNumber,
    eligible: review.eligibility.eligibleForOrdinaryAmendment,
    blockers: review.eligibility.blockers,
    releases,
    stockOnHandChange: "0" as const,
    moneyRefundMinor: 0 as const,
    beforeSnapshot,
    reviewDigest: digest({
      beforeSnapshot,
      evidence: review.evidence,
      releases,
    }),
  }
}
export type CancelCommercialOrderInput = Scope & {
  actorUserId: string
  clientOperationId: string
  expectedReviewDigest: string
  reason: string
}

/** Caller owns current actor authorization. Financial/order locks precede stock. */
export async function cancelCommercialOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: CancelCommercialOrderInput,
) {
  if (
    !input.actorUserId.trim() ||
    !input.clientOperationId.trim() ||
    input.clientOperationId.length > 128 ||
    !input.reason.trim() ||
    input.reason.trim().length > 500 ||
    !/^[a-f0-9]{64}$/.test(input.expectedReviewDigest)
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "A reviewed cancellation, command identity and reason are required.",
    )
  const payloadHash = digest({ ...input, reason: input.reason.trim() })
  const readPrevious = () =>
    tx.commercialOrderAmendment.findUnique({
      where: {
        tenantId_clientOperationId: {
          tenantId: input.tenantId,
          clientOperationId: input.clientOperationId,
        },
      },
    })
  function replay(
    previous: NonNullable<Awaited<ReturnType<typeof readPrevious>>>,
  ) {
    if (
      previous.payloadHash !== payloadHash ||
      previous.kind !== "CANCEL" ||
      previous.orderId !== input.orderId
    )
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This amendment identity was used with different input.",
      )
    return previous
  }
  const previous = await readPrevious()
  if (previous) return replay(previous)
  const locked = await lockCommerceFinancialOrder(tx, input)
  if (!locked || locked.order.storeId !== input.storeId)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  const concurrent = await readPrevious()
  if (concurrent) return replay(concurrent)
  const reservations = await tx.$queryRaw<
    Array<{ id: string; balanceSourceId: string }>
  >`
    SELECT r."id", r."balanceSourceId" FROM "StockReservation" r
    JOIN "CommercialOrderLine" l ON l."id" = r."commercialOrderLineId"
    WHERE l."orderId" = ${input.orderId} AND r."tenantId" = ${input.tenantId}
      AND r."storeId" = ${input.storeId} ORDER BY r."id" FOR UPDATE OF r
  `
  const ids = [
    ...new Set(reservations.map((row) => row.balanceSourceId)),
  ].sort()
  if (ids.length) {
    const balances = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockBalanceSource" WHERE "id" IN (${Prisma.join(ids)})
      AND "tenantId" = ${input.tenantId} AND "storeId" = ${input.storeId}
      ORDER BY "id" FOR UPDATE
    `
    if (
      balances.length !== ids.length ||
      new Set(balances.map((row) => row.id)).size !== ids.length ||
      balances.some((row) => !ids.includes(row.id))
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "Order reservation balances changed scope.",
      )
  }
  const preview = await previewCommercialOrderCancellation(tx, input)
  if (!preview.eligible)
    throw new CatalogError(
      "INVALID_ORDER",
      preview.blockers.map((block) => block.reason).join(" "),
    )
  if (preview.reviewDigest !== input.expectedReviewDigest)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Order or reserved stock changed. Review cancellation again.",
    )
  for (const release of preview.releases) {
    if (
      !reservations.some(
        (row) =>
          row.id === release.reservationId &&
          row.balanceSourceId === release.balanceSourceId,
      )
    )
      throw new CatalogError(
        "INVALID_ORDER",
        "Order reservation changed during confirmation.",
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
  await tx.commercialOrder.update({
    where: { id: input.orderId },
    data: { status: "CANCELLED" },
  })
  return tx.commercialOrderAmendment.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      clientOperationId: input.clientOperationId,
      payloadHash,
      kind: "CANCEL",
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
      beforeSnapshot: preview.beforeSnapshot,
      afterSnapshot: json({
        status: "CANCELLED",
        releasedReservations: preview.releases,
        stockOnHandChange: "0",
        moneyRefundMinor: 0,
      }),
    },
  })
}
export async function cancelCommercialOrder(
  db: PrismaClient,
  input: CancelCommercialOrderInput,
) {
  return runInOwnTransaction(db, (tx) =>
    cancelCommercialOrderInTransaction(tx, input),
  )
}
