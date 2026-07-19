import { createHash } from "node:crypto"

import {
  EXACT_CANONICAL_MAX_SCALE,
  addExactDecimals,
  compareExactDecimals,
  floorExactDecimalQuotient,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  StockBalanceKind,
  StockCustodyType,
  StockOperationType,
  StockReservationStatus,
  UnitConfigurationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"

type InventoryDb = Prisma.TransactionClient | PrismaClient

function stableJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function assertSchemaVersion(schemaVersion: number) {
  if (schemaVersion !== 1) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "CLIENT_SCHEMA_UNSUPPORTED: inventory commands require schema version 1.",
    )
  }
}

async function resolveOfferingInventory(
  db: InventoryDb,
  input: { offeringId: string; storeId: string; tenantId: string },
) {
  const offering = await db.sellableOffering.findFirst({
    include: {
      productUnitOffering: {
        include: {
          inventoryUnit: {
            include: {
              configurationVersion: {
                include: {
                  units: true,
                  product: {
                    include: {
                      currentUnitConfiguration: {
                        include: { units: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      storeAvailability: {
        where: { storeId: input.storeId },
      },
      variant: true,
    },
    where: {
      id: input.offeringId,
      status: CatalogRecordStatus.ACTIVE,
      tenantId: input.tenantId,
    },
  })
  if (!offering?.productUnitOffering) {
    throw new CatalogError(
      "OFFERING_UNAVAILABLE",
      "An active Product Unit Offering is required for inventory.",
    )
  }
  if (!offering.storeAvailability[0]?.isAvailable) {
    throw new CatalogError(
      "OFFERING_UNAVAILABLE",
      "This Offering is not available at the selected Store.",
    )
  }

  const enteredUnit = offering.productUnitOffering.inventoryUnit
  const configuration = enteredUnit.configurationVersion
  const product = configuration.product
  if (
    configuration.status !== UnitConfigurationStatus.CURRENT ||
    product.currentUnitConfigurationVersionId !== configuration.id
  ) {
    throw new CatalogError(
      "STALE_CONFIGURATION",
      "The Offering does not use the Product's Current unit configuration.",
    )
  }

  const usesSharedPool =
    enteredUnit.stockBehavior !== InventoryUnitStockBehavior.PACKAGED_STOCK
  const balanceUnit = usesSharedPool
    ? configuration.units.find(
        (unit) =>
          unit.stockBehavior === InventoryUnitStockBehavior.CANONICAL_SHARED,
      )
    : enteredUnit
  if (!balanceUnit) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "The Current configuration has no Canonical Inventory Unit.",
    )
  }

  const balance = await db.stockBalanceSource.upsert({
    create: {
      inventoryUnitId: balanceUnit.id,
      kind: usesSharedPool
        ? StockBalanceKind.SHARED_POOL
        : StockBalanceKind.PACKAGED_STOCK,
      productId: product.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
      variantId: offering.variantId,
    },
    update: {},
    where: {
      storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
        custodyReferenceId: "",
        custodyType: StockCustodyType.STORE,
        inventoryUnitId: balanceUnit.id,
        storeId: input.storeId,
        variantId: offering.variantId,
      },
    },
  })

  return { balance, configuration, enteredUnit, offering, usesSharedPool }
}

function balanceAvailable(balance: {
  onHandQuantity: { toString(): string }
  reservedQuantity: { toString(): string }
}) {
  return subtractExactDecimals(
    balance.onHandQuantity.toString(),
    balance.reservedQuantity.toString(),
  )
}

function serializeReservation(
  reservation: Prisma.StockReservationGetPayload<Record<string, never>>,
) {
  return {
    balanceRevisionSnapshot: reservation.balanceRevisionSnapshot,
    balanceSourceId: reservation.balanceSourceId,
    canonicalQuantity: reservation.canonicalQuantity.toString(),
    clientReservationId: reservation.clientReservationId,
    committedAt: reservation.committedAt,
    configurationVersionId: reservation.configurationVersionId,
    enteredInventoryUnitId: reservation.enteredInventoryUnitId,
    enteredQuantity: reservation.enteredQuantity.toString(),
    expiresAt: reservation.expiresAt,
    id: reservation.id,
    offeringId: reservation.offeringId,
    releasedAt: reservation.releasedAt,
    status:
      reservation.status === StockReservationStatus.ACTIVE
        ? ("active" as const)
        : reservation.status === StockReservationStatus.COMMITTED
          ? ("committed" as const)
          : reservation.status === StockReservationStatus.EXPIRED
            ? ("expired" as const)
            : ("released" as const),
    storeId: reservation.storeId,
    unitFactorSnapshot: reservation.unitFactorSnapshot.toString(),
  }
}

export async function getCatalogOfferingAvailability(
  db: PrismaClient,
  input: { offeringId: string; storeId: string; tenantId: string },
) {
  const resolved = await resolveOfferingInventory(db, input)
  const availableBalanceQuantity = balanceAvailable(resolved.balance)
  const availableOfferingQuantity = resolved.usesSharedPool
    ? floorExactDecimalQuotient(
        availableBalanceQuantity,
        resolved.enteredUnit.factor.toString(),
        resolved.enteredUnit.transactionScale,
      )
    : parseExactDecimal(availableBalanceQuantity, {
        maxScale: resolved.enteredUnit.transactionScale,
      })

  return {
    availableBalanceQuantity,
    availableOfferingQuantity,
    balanceSourceId: resolved.balance.id,
    balanceUnitId: resolved.balance.inventoryUnitId,
    configurationVersionId: resolved.configuration.id,
    enteredInventoryUnitId: resolved.enteredUnit.id,
    factor: resolved.enteredUnit.factor.toString(),
    offeringId: resolved.offering.id,
    onHandQuantity: resolved.balance.onHandQuantity.toString(),
    reservedQuantity: resolved.balance.reservedQuantity.toString(),
    revision: resolved.balance.revision,
    stockBehavior:
      resolved.enteredUnit.stockBehavior ===
      InventoryUnitStockBehavior.PACKAGED_STOCK
        ? ("packaged_stock" as const)
        : resolved.enteredUnit.stockBehavior ===
            InventoryUnitStockBehavior.ALTERNATE_TRANSACTION
          ? ("alternate_transaction" as const)
          : ("canonical_shared" as const),
  }
}

export type ReserveCatalogOfferingStockInput = {
  clientReservationId: string
  commercialOrderLineId?: string
  enteredQuantity: string
  expectedBalanceRevision?: number
  expectedConfigurationVersionId: string
  expiresAt?: Date
  offeringId: string
  schemaVersion: number
  storeId: string
  tenantId: string
}

export async function reserveCatalogOfferingStockInTransaction(
  tx: Prisma.TransactionClient,
  input: ReserveCatalogOfferingStockInput,
) {
  assertSchemaVersion(input.schemaVersion)
  const hash = payloadHash(input)

  const previous = await tx.stockReservation.findUnique({
    where: {
      tenantId_clientReservationId: {
        clientReservationId: input.clientReservationId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    if (previous.payloadHash !== hash) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This reservation identity was already used with different input.",
      )
    }
    return serializeReservation(previous)
  }

  const resolved = await resolveOfferingInventory(tx, input)
  if (resolved.configuration.id !== input.expectedConfigurationVersionId) {
    throw new CatalogError(
      "STALE_CONFIGURATION",
      "The Product unit configuration changed before reservation.",
    )
  }
  if (
    input.expectedBalanceRevision !== undefined &&
    resolved.balance.revision !== input.expectedBalanceRevision
  ) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "The inventory balance changed before reservation.",
    )
  }

  const enteredQuantity = parseExactDecimal(input.enteredQuantity, {
    allowZero: false,
    maxScale: resolved.enteredUnit.transactionScale,
  })
  const canonicalQuantity = multiplyExactDecimals(
    enteredQuantity,
    resolved.enteredUnit.factor.toString(),
    EXACT_CANONICAL_MAX_SCALE,
  )
  const reservedBalanceQuantity = resolved.usesSharedPool
    ? canonicalQuantity
    : enteredQuantity
  if (
    compareExactDecimals(
      balanceAvailable(resolved.balance),
      reservedBalanceQuantity,
    ) < 0
  ) {
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The selected Balance Source has insufficient available stock.",
    )
  }

  const nextReserved = addExactDecimals(
    resolved.balance.reservedQuantity.toString(),
    reservedBalanceQuantity,
  )
  const updated = await tx.stockBalanceSource.updateMany({
    data: {
      reservedQuantity: nextReserved,
      revision: { increment: 1 },
    },
    where: { id: resolved.balance.id, revision: resolved.balance.revision },
  })
  if (updated.count !== 1) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "The inventory balance changed while reserving stock.",
    )
  }

  const reservation = await tx.stockReservation.create({
    data: {
      balanceRevisionSnapshot: resolved.balance.revision,
      balanceSourceId: resolved.balance.id,
      canonicalQuantity,
      clientReservationId: input.clientReservationId,
      commercialOrderLineId: input.commercialOrderLineId,
      configurationVersionId: resolved.configuration.id,
      enteredInventoryUnitId: resolved.enteredUnit.id,
      enteredQuantity,
      expiresAt: input.expiresAt,
      offeringId: resolved.offering.id,
      payloadHash: hash,
      schemaVersion: input.schemaVersion,
      storeId: input.storeId,
      tenantId: input.tenantId,
      unitFactorSnapshot: resolved.enteredUnit.factor,
    },
  })
  return serializeReservation(reservation)
}

export async function reserveCatalogOfferingStock(
  db: PrismaClient,
  input: ReserveCatalogOfferingStockInput,
) {
  return db.$transaction((tx) =>
    reserveCatalogOfferingStockInTransaction(tx, input),
  )
}

export async function releaseCatalogStockReservation(
  db: PrismaClient,
  input: { reservationId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    const reservation = await tx.stockReservation.findFirst({
      include: { balanceSource: true, enteredInventoryUnit: true },
      where: { id: input.reservationId, tenantId: input.tenantId },
    })
    if (!reservation) {
      throw new CatalogError(
        "RESERVATION_NOT_FOUND",
        "Stock Reservation not found.",
      )
    }
    if (reservation.status !== StockReservationStatus.ACTIVE) {
      return serializeReservation(reservation)
    }

    const reservedBalanceQuantity =
      reservation.enteredInventoryUnit.stockBehavior ===
      InventoryUnitStockBehavior.PACKAGED_STOCK
        ? reservation.enteredQuantity.toString()
        : reservation.canonicalQuantity.toString()
    const nextReserved = subtractExactDecimals(
      reservation.balanceSource.reservedQuantity.toString(),
      reservedBalanceQuantity,
    )
    const updated = await tx.stockBalanceSource.updateMany({
      data: { reservedQuantity: nextReserved, revision: { increment: 1 } },
      where: {
        id: reservation.balanceSourceId,
        revision: reservation.balanceSource.revision,
      },
    })
    if (updated.count !== 1) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "The inventory balance changed while releasing stock.",
      )
    }
    const released = await tx.stockReservation.update({
      data: { releasedAt: new Date(), status: StockReservationStatus.RELEASED },
      where: { id: reservation.id },
    })
    return serializeReservation(released)
  })
}

export type CommitCatalogStockReservationInput = {
  actorUserId: string
  clientOperationId: string
  operationType?: "reservation_commit" | "sale_fulfillment"
  reason?: string
  reservationId: string
  schemaVersion: number
  source: string
  tenantId: string
}

export async function commitCatalogStockReservationInTransaction(
  tx: Prisma.TransactionClient,
  input: CommitCatalogStockReservationInput,
) {
  assertSchemaVersion(input.schemaVersion)
  const hash = payloadHash(input)

  const previous = await tx.stockOperation.findUnique({
    include: { movements: true },
    where: {
      tenantId_clientOperationId: {
        clientOperationId: input.clientOperationId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    if (previous.payloadHash !== hash) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This stock operation identity was already used with different input.",
      )
    }
    return {
      id: previous.id,
      movements: previous.movements.map((movement) => ({
        balanceSourceId: movement.balanceSourceId,
        enteredQuantity: movement.enteredQuantity.toString(),
        resultingOnHandQuantity: movement.resultingOnHandQuantity.toString(),
        signedCanonicalEffect: movement.signedCanonicalEffect.toString(),
      })),
    }
  }

  const reservation = await tx.stockReservation.findFirst({
    include: { balanceSource: true, enteredInventoryUnit: true },
    where: { id: input.reservationId, tenantId: input.tenantId },
  })
  if (!reservation) {
    throw new CatalogError(
      "RESERVATION_NOT_FOUND",
      "Stock Reservation not found.",
    )
  }
  if (reservation.status !== StockReservationStatus.ACTIVE) {
    throw new CatalogError(
      "RESERVATION_NOT_FOUND",
      "Only an active Stock Reservation can be committed.",
    )
  }

  const isPackaged =
    reservation.enteredInventoryUnit.stockBehavior ===
    InventoryUnitStockBehavior.PACKAGED_STOCK
  const balanceQuantity = isPackaged
    ? reservation.enteredQuantity.toString()
    : reservation.canonicalQuantity.toString()
  const resultingOnHand = subtractExactDecimals(
    reservation.balanceSource.onHandQuantity.toString(),
    balanceQuantity,
  )
  const resultingReserved = subtractExactDecimals(
    reservation.balanceSource.reservedQuantity.toString(),
    balanceQuantity,
  )
  if (
    compareExactDecimals(resultingOnHand, "0") < 0 ||
    compareExactDecimals(resultingReserved, "0") < 0
  ) {
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The reserved stock is no longer available for commitment.",
    )
  }

  const updated = await tx.stockBalanceSource.updateMany({
    data: {
      onHandQuantity: resultingOnHand,
      reservedQuantity: resultingReserved,
      revision: { increment: 1 },
    },
    where: {
      id: reservation.balanceSourceId,
      revision: reservation.balanceSource.revision,
    },
  })
  if (updated.count !== 1) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "The inventory balance changed while committing stock.",
    )
  }

  const operation = await tx.stockOperation.create({
    data: {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      payloadHash: hash,
      reason: input.reason?.trim() || null,
      source: input.source,
      storeId: reservation.storeId,
      tenantId: input.tenantId,
      type:
        input.operationType === "sale_fulfillment"
          ? StockOperationType.SALE_FULFILLMENT
          : StockOperationType.RESERVATION_COMMIT,
    },
  })
  const movement = await tx.stockMovement.create({
    data: {
      balanceSourceId: reservation.balanceSourceId,
      configurationVersionId: reservation.configurationVersionId,
      enteredInventoryUnitId: reservation.enteredInventoryUnitId,
      enteredQuantity: reservation.enteredQuantity,
      operationId: operation.id,
      previousOnHandQuantity: reservation.balanceSource.onHandQuantity,
      resultingOnHandQuantity: resultingOnHand,
      signedCanonicalEffect: subtractExactDecimals(
        "0",
        reservation.canonicalQuantity.toString(),
      ),
      transactionScaleSnapshot:
        reservation.enteredInventoryUnit.transactionScale,
      unitFactorSnapshot: reservation.unitFactorSnapshot,
    },
  })
  await tx.stockReservation.update({
    data: {
      committedAt: new Date(),
      status: StockReservationStatus.COMMITTED,
    },
    where: { id: reservation.id },
  })

  return {
    id: operation.id,
    movements: [
      {
        balanceSourceId: movement.balanceSourceId,
        enteredQuantity: movement.enteredQuantity.toString(),
        resultingOnHandQuantity: movement.resultingOnHandQuantity.toString(),
        signedCanonicalEffect: movement.signedCanonicalEffect.toString(),
      },
    ],
  }
}

export async function commitCatalogStockReservation(
  db: PrismaClient,
  input: CommitCatalogStockReservationInput,
) {
  return db.$transaction((tx) =>
    commitCatalogStockReservationInTransaction(tx, input),
  )
}
