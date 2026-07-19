import {
  EXACT_FACTOR_MAX_SCALE,
  compareExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  StockOperationType,
  UnitConfigurationStatus,
} from "../../generated/prisma/enums"
import { CatalogError, type InventoryUnitStockBehaviorValue } from "./catalog"

export type UnitConfigurationUnitInput = {
  factor: string
  key: string
  name: string
  stockBehavior: InventoryUnitStockBehaviorValue
  symbol?: string
  transactionScale: number
  unitDefinitionId?: string
}

function slugKey(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unit"
  )
}

function behavior(value: InventoryUnitStockBehaviorValue) {
  if (value === "canonical_shared") {
    return InventoryUnitStockBehavior.CANONICAL_SHARED
  }
  if (value === "alternate_transaction") {
    return InventoryUnitStockBehavior.ALTERNATE_TRANSACTION
  }
  return InventoryUnitStockBehavior.PACKAGED_STOCK
}

function behaviorValue(value: InventoryUnitStockBehavior) {
  if (value === InventoryUnitStockBehavior.CANONICAL_SHARED) {
    return "canonical_shared" as const
  }
  if (value === InventoryUnitStockBehavior.ALTERNATE_TRANSACTION) {
    return "alternate_transaction" as const
  }
  return "packaged_stock" as const
}

function validateUnits(units: UnitConfigurationUnitInput[]) {
  if (units.length === 0) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "A Product unit configuration requires at least one unit.",
    )
  }

  const keys = units.map((unit) => unit.key.trim().toLowerCase())
  if (new Set(keys).size !== keys.length) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "Unit keys must be unique within a configuration.",
    )
  }

  let canonicalCount = 0
  for (const unit of units) {
    if (!unit.name.trim()) {
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "Every configured unit requires a name.",
      )
    }
    const factor = parseExactDecimal(unit.factor, {
      allowZero: false,
      maxScale: EXACT_FACTOR_MAX_SCALE,
    })
    if (
      !Number.isInteger(unit.transactionScale) ||
      unit.transactionScale < 0 ||
      unit.transactionScale > 6
    ) {
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        `Transaction precision for ${unit.name} must be from 0 to 6 decimal places.`,
      )
    }
    if (unit.stockBehavior === "canonical_shared") {
      canonicalCount += 1
      if (compareExactDecimals(factor, "1") !== 0) {
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          "The Canonical Inventory Unit must have factor 1.",
        )
      }
    }
  }

  if (canonicalCount !== 1) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "A Product requires exactly one Canonical Inventory Unit.",
    )
  }
}

function serializeConfiguration(
  configuration: Prisma.UnitConfigurationVersionGetPayload<{
    include: { units: true }
  }>,
) {
  return {
    canonicalBalanceScale: configuration.canonicalBalanceScale,
    id: configuration.id,
    productId: configuration.productId,
    publishedAt: configuration.publishedAt,
    status:
      configuration.status === UnitConfigurationStatus.CURRENT
        ? ("current" as const)
        : configuration.status === UnitConfigurationStatus.SUPERSEDED
          ? ("superseded" as const)
          : ("draft" as const),
    supersededAt: configuration.supersededAt,
    units: configuration.units.map((unit) => ({
      factor: unit.factor.toString(),
      id: unit.id,
      key: unit.key,
      name: unit.name,
      stockBehavior: behaviorValue(unit.stockBehavior),
      symbol: unit.symbol,
      transactionScale: unit.transactionScale,
      unitDefinitionId: unit.unitDefinitionId,
    })),
    version: configuration.version,
  }
}

async function tenantProduct(
  db: Prisma.TransactionClient | PrismaClient,
  input: { productId: string; tenantId: string },
) {
  const product = await db.catalogProduct.findFirst({
    include: {
      currentUnitConfiguration: { include: { units: true } },
      unitConfigurations: {
        include: { units: { orderBy: { sortOrder: "asc" } } },
        orderBy: { version: "desc" },
      },
    },
    where: {
      catalogItem: { tenantId: input.tenantId },
      id: input.productId,
    },
  })
  if (!product) {
    throw new CatalogError(
      "CATALOG_ITEM_NOT_FOUND",
      "Catalog Product not found.",
    )
  }
  return product
}

export async function listCatalogUnitDefinitions(
  db: PrismaClient,
  input: { tenantId: string },
) {
  return db.unitDefinition.findMany({
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    where: {
      isActive: true,
      OR: [{ isSystem: true }, { tenantId: input.tenantId }],
    },
  })
}

export async function createCatalogUnitDefinition(
  db: PrismaClient,
  input: { name: string; symbol?: string; tenantId: string },
) {
  const name = input.name.trim()
  if (!name) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "Unit Definition name is required.",
    )
  }
  const existing = await db.unitDefinition.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      tenantId: input.tenantId,
    },
  })
  if (existing) return existing

  return db.unitDefinition.create({
    data: {
      name,
      scopeKey: `tenant:${input.tenantId}:${slugKey(name)}`,
      symbol: input.symbol?.trim() || null,
      tenantId: input.tenantId,
    },
  })
}

export async function listProductUnitConfigurations(
  db: PrismaClient,
  input: { productId: string; tenantId: string },
) {
  const product = await tenantProduct(db, input)
  return product.unitConfigurations.map(serializeConfiguration)
}

export async function createProductUnitConfigurationDraft(
  db: PrismaClient,
  input: { productId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    const product = await tenantProduct(tx, input)
    const existingDraft = product.unitConfigurations.find(
      (configuration) => configuration.status === UnitConfigurationStatus.DRAFT,
    )
    if (existingDraft) return serializeConfiguration(existingDraft)

    const current = product.currentUnitConfiguration
    if (!current) {
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "The Product has no Current unit configuration to copy.",
      )
    }
    const version =
      Math.max(...product.unitConfigurations.map((row) => row.version)) + 1
    const draft = await tx.unitConfigurationVersion.create({
      data: {
        canonicalBalanceScale: current.canonicalBalanceScale,
        productId: product.id,
        status: UnitConfigurationStatus.DRAFT,
        version,
      },
    })
    await tx.inventoryUnit.createMany({
      data: current.units.map((unit) => ({
        configurationVersionId: draft.id,
        factor: unit.factor,
        key: unit.key,
        name: unit.name,
        sortOrder: unit.sortOrder,
        stockBehavior: unit.stockBehavior,
        symbol: unit.symbol,
        transactionScale: unit.transactionScale,
        unitDefinitionId: unit.unitDefinitionId,
      })),
    })
    const created = await tx.unitConfigurationVersion.findUniqueOrThrow({
      include: { units: { orderBy: { sortOrder: "asc" } } },
      where: { id: draft.id },
    })
    return serializeConfiguration(created)
  })
}

export async function updateProductUnitConfigurationDraft(
  db: PrismaClient,
  input: {
    canonicalBalanceScale: number
    configurationId: string
    tenantId: string
    units: UnitConfigurationUnitInput[]
  },
) {
  if (
    !Number.isInteger(input.canonicalBalanceScale) ||
    input.canonicalBalanceScale < 0 ||
    input.canonicalBalanceScale > 18
  ) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "Canonical balance precision must be from 0 to 18 decimal places.",
    )
  }
  validateUnits(input.units)

  return db.$transaction(async (tx) => {
    const configuration = await tx.unitConfigurationVersion.findFirst({
      where: {
        id: input.configurationId,
        product: { catalogItem: { tenantId: input.tenantId } },
        status: UnitConfigurationStatus.DRAFT,
      },
      select: { id: true },
    })
    if (!configuration) {
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "Only a tenant-owned Draft unit configuration can be edited.",
      )
    }

    const definitionIds = input.units.flatMap((unit) =>
      unit.unitDefinitionId ? [unit.unitDefinitionId] : [],
    )
    if (definitionIds.length > 0) {
      const definitions = await tx.unitDefinition.count({
        where: {
          id: { in: definitionIds },
          OR: [{ isSystem: true }, { tenantId: input.tenantId }],
        },
      })
      if (definitions !== new Set(definitionIds).size) {
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          "One or more Unit Definitions are unavailable to this business.",
        )
      }
    }

    await tx.inventoryUnit.deleteMany({
      where: { configurationVersionId: configuration.id },
    })
    await tx.unitConfigurationVersion.update({
      data: { canonicalBalanceScale: input.canonicalBalanceScale },
      where: { id: configuration.id },
    })
    await tx.inventoryUnit.createMany({
      data: input.units.map((unit, index) => ({
        configurationVersionId: configuration.id,
        factor: parseExactDecimal(unit.factor, {
          allowZero: false,
          maxScale: EXACT_FACTOR_MAX_SCALE,
        }),
        key: unit.key.trim().toLowerCase(),
        name: unit.name.trim(),
        sortOrder: index,
        stockBehavior: behavior(unit.stockBehavior),
        symbol: unit.symbol?.trim() || null,
        transactionScale: unit.transactionScale,
        unitDefinitionId: unit.unitDefinitionId,
      })),
    })
    const updated = await tx.unitConfigurationVersion.findUniqueOrThrow({
      include: { units: { orderBy: { sortOrder: "asc" } } },
      where: { id: configuration.id },
    })
    return serializeConfiguration(updated)
  })
}

export async function publishProductUnitConfiguration(
  db: PrismaClient,
  input: {
    configurationId: string
    stockTransitionOperationId?: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const draft = await tx.unitConfigurationVersion.findFirst({
      include: {
        product: {
          include: {
            catalogItem: true,
            currentUnitConfiguration: { include: { units: true } },
            stockBalanceSources: true,
          },
        },
        units: { orderBy: { sortOrder: "asc" } },
      },
      where: {
        id: input.configurationId,
        product: { catalogItem: { tenantId: input.tenantId } },
        status: UnitConfigurationStatus.DRAFT,
      },
    })
    if (!draft) {
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "Only a tenant-owned Draft unit configuration can be published.",
      )
    }
    validateUnits(
      draft.units.map((unit) => ({
        factor: unit.factor.toString(),
        key: unit.key,
        name: unit.name,
        stockBehavior: behaviorValue(unit.stockBehavior),
        symbol: unit.symbol ?? undefined,
        transactionScale: unit.transactionScale,
        unitDefinitionId: unit.unitDefinitionId ?? undefined,
      })),
    )

    const current = draft.product.currentUnitConfiguration
    if (!current) {
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "The Product has no Current unit configuration.",
      )
    }
    const currentByKey = new Map(current.units.map((unit) => [unit.key, unit]))
    const draftByKey = new Map(draft.units.map((unit) => [unit.key, unit]))
    const semanticsChanged =
      current.units.length !== draft.units.length ||
      draft.units.some((unit) => {
        const previous = currentByKey.get(unit.key)
        return (
          !previous ||
          previous.stockBehavior !== unit.stockBehavior ||
          previous.transactionScale !== unit.transactionScale ||
          compareExactDecimals(
            previous.factor.toString(),
            unit.factor.toString(),
          ) !== 0
        )
      })
    const hasBalances = draft.product.stockBalanceSources.some(
      (balance) =>
        compareExactDecimals(balance.onHandQuantity.toString(), "0") !== 0 ||
        compareExactDecimals(balance.reservedQuantity.toString(), "0") !== 0,
    )

    if (semanticsChanged && hasBalances) {
      if (!input.stockTransitionOperationId) {
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          "Publishing this semantic change requires an explicit Stock Transition.",
        )
      }
      const transition = await tx.stockOperation.findFirst({
        where: {
          id: input.stockTransitionOperationId,
          movements: {
            some: { balanceSource: { productId: draft.productId } },
          },
          tenantId: input.tenantId,
          type: StockOperationType.STOCK_TRANSITION,
        },
        select: { id: true },
      })
      if (!transition) {
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          "The supplied Stock Transition does not cover this Product.",
        )
      }
    }

    const offeringUnits = await tx.productUnitOffering.findMany({
      include: {
        inventoryUnit: true,
        offering: { include: { storeAvailability: true } },
      },
      where: {
        inventoryUnit: { configurationVersionId: current.id },
        offering: {
          catalogItemId: draft.product.catalogItemId,
          status: { in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT] },
        },
      },
    })
    for (const offering of offeringUnits) {
      const replacement = draftByKey.get(offering.inventoryUnit.key)
      if (!replacement) {
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          `Configured unit ${offering.inventoryUnit.name} is still used by an Offering.`,
        )
      }
      const now = new Date()
      await tx.sellableOffering.update({
        data: { archivedAt: now, status: CatalogRecordStatus.ARCHIVED },
        where: { id: offering.offeringId },
      })
      // SKU and barcode route to the Current Offering. Historical Order snapshots
      // retain the identifiers used at confirmation time.
      await tx.productUnitOffering.update({
        data: { barcode: null, sku: null },
        where: { id: offering.id },
      })
      const replacementOffering = await tx.sellableOffering.create({
        data: {
          catalogItemId: offering.offering.catalogItemId,
          currencyCode: offering.offering.currencyCode,
          fixedPriceMinor: offering.offering.fixedPriceMinor,
          key: `${offering.offering.key}:unit-v${draft.version}`,
          kind: offering.offering.kind,
          name: offering.offering.name,
          pricingPolicy: offering.offering.pricingPolicy,
          sortOrder: offering.offering.sortOrder,
          status:
            offering.offering.status === CatalogRecordStatus.DRAFT
              ? CatalogRecordStatus.DRAFT
              : CatalogRecordStatus.ACTIVE,
          tenantId: offering.offering.tenantId,
          variantId: offering.offering.variantId,
        },
      })
      await tx.productUnitOffering.create({
        data: {
          barcode: offering.barcode,
          inventoryUnitId: replacement.id,
          offeringId: replacementOffering.id,
          sku: offering.sku,
          tenantId: offering.tenantId,
        },
      })
      if (offering.offering.storeAvailability.length > 0) {
        await tx.storeOfferingAvailability.createMany({
          data: offering.offering.storeAvailability.map((availability) => ({
            isAvailable: availability.isAvailable,
            offeringId: replacementOffering.id,
            storeId: availability.storeId,
          })),
        })
      }
      if (offering.offering.fixedPriceMinor !== null) {
        await tx.catalogPriceChange.create({
          data: {
            currencyCode: offering.offering.currencyCode,
            offeringId: replacementOffering.id,
            priceMinor: offering.offering.fixedPriceMinor,
            reason: `Carried forward from unit configuration v${current.version}`,
            tenantId: offering.tenantId,
          },
        })
      }
    }

    const now = new Date()
    await tx.unitConfigurationVersion.update({
      data: {
        status: UnitConfigurationStatus.SUPERSEDED,
        supersededAt: now,
      },
      where: { id: current.id },
    })
    await tx.unitConfigurationVersion.update({
      data: { publishedAt: now, status: UnitConfigurationStatus.CURRENT },
      where: { id: draft.id },
    })
    await tx.catalogProduct.update({
      data: { currentUnitConfigurationVersionId: draft.id },
      where: { id: draft.productId },
    })

    const published = await tx.unitConfigurationVersion.findUniqueOrThrow({
      include: { units: { orderBy: { sortOrder: "asc" } } },
      where: { id: draft.id },
    })
    return serializeConfiguration(published)
  })
}
