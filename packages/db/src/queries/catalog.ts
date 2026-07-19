import { createHash } from "node:crypto"

import {
  EXACT_FACTOR_MAX_SCALE,
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  OfferingPricingPolicy,
  SellableOfferingKind,
  StockBalanceKind,
  StockOperationType,
  UnitConfigurationStatus,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
} from "../../generated/prisma/enums"

export type CatalogItemKindValue = "product" | "service"
export type CatalogItemStatusValue = "active" | "archived" | "draft"
export type OfferingPricingPolicyValue = "fixed" | "quote_required"
export type InventoryUnitStockBehaviorValue =
  | "alternate_transaction"
  | "canonical_shared"
  | "packaged_stock"

type CatalogOfferingInput = {
  enabled?: boolean
  fixedPriceMinor?: number
  key: string
  name: string
  pricingPolicy: OfferingPricingPolicyValue
  storeAvailability?: Array<{
    isAvailable: boolean
    storeId: string
  }>
}

type CatalogVariantInput<TOffering> = {
  enabled?: boolean
  isDefault: boolean
  key: string
  name: string
  offerings: TOffering[]
  selections?: Array<{
    groupKey: string
    valueKey: string
  }>
}

type CatalogOptionGroupInput = {
  key: string
  name: string
  values: Array<{
    key: string
    label: string
  }>
}

export type CreateCatalogProductInput = {
  actorUserId: string
  category?: string
  clientOperationId: string
  description?: string
  imageLinks?: string[]
  imageUrl?: string
  kind: "product"
  name: string
  optionGroups?: CatalogOptionGroupInput[]
  openingStockQuantity?: string
  storeId: string
  tenantId: string
  unitConfiguration: {
    canonicalBalanceScale: number
    units: Array<{
      factor: string
      key: string
      name: string
      stockBehavior: InventoryUnitStockBehaviorValue
      symbol?: string
      transactionScale: number
    }>
  }
  variants: Array<
    CatalogVariantInput<
      CatalogOfferingInput & {
        barcode?: string
        inventoryUnitKey: string
        sku?: string
      }
    >
  >
}

export type CreateCatalogServiceInput = {
  actorUserId: string
  category?: string
  clientOperationId: string
  description?: string
  imageLinks?: string[]
  imageUrl?: string
  kind: "service"
  name: string
  optionGroups?: CatalogOptionGroupInput[]
  storeId: string
  tenantId: string
  variants: Array<
    CatalogVariantInput<
      CatalogOfferingInput & {
        authorizationPolicy?:
          | "after_required_payment"
          | "manual_release"
          | "on_order_confirmation"
        guidance?: string
        quantityScale?: number
        workPolicy?: "charge_only" | "tracked"
      }
    >
  >
}

export type CreateCatalogItemInput =
  | CreateCatalogProductInput
  | CreateCatalogServiceInput

export type CreateSimpleCatalogItemInput =
  | {
      actorUserId: string
      canonicalUnitName: string
      clientOperationId: string
      description?: string
      kind: "product"
      name: string
      openingStockQuantity?: string
      priceMinor: number
      storeId: string
      tenantId: string
    }
  | {
      actorUserId: string
      authorizationPolicy?:
        | "after_required_payment"
        | "manual_release"
        | "on_order_confirmation"
      clientOperationId: string
      description?: string
      guidance?: string
      kind: "service"
      name: string
      priceMinor: number
      quantityScale?: number
      storeId: string
      tenantId: string
      workPolicy?: "charge_only" | "tracked"
    }

export type ListCatalogItemsInput = {
  kind?: CatalogItemKindValue
  status?: CatalogItemStatusValue
  tenantId: string
}

export type GetCatalogItemInput = {
  itemId: string
  tenantId: string
}

type CatalogErrorCode =
  | "CATALOG_ITEM_NOT_FOUND"
  | "CATALOG_OFFERING_NOT_FOUND"
  | "CATALOG_VARIANT_NOT_FOUND"
  | "DUPLICATE_CATALOG_KEY"
  | "IDEMPOTENCY_MISMATCH"
  | "INSUFFICIENT_STOCK"
  | "INVALID_CATALOG_ITEM"
  | "INVALID_OFFERING"
  | "INVALID_ORDER"
  | "INVALID_STOCK_OPERATION"
  | "INVALID_UNIT_CONFIGURATION"
  | "OFFERING_UNAVAILABLE"
  | "ORDER_NOT_FOUND"
  | "RESERVATION_NOT_FOUND"
  | "REVISION_CONFLICT"
  | "STALE_CONFIGURATION"
  | "STOCK_COUNT_NOT_FOUND"
  | "STORE_NOT_FOUND"
  | "SERVICE_INTAKE_NOT_FOUND"
  | "SERVICE_JOB_NOT_FOUND"
  | "SERVICE_WORK_NOT_AUTHORIZED"
  | "INVALID_SERVICE_TRANSITION"
  | "SERVICE_ALLOCATION_CONFLICT"
  | "SERVICE_EVIDENCE_UNAVAILABLE"
  | "INVALID_ASSIGNEE"
  | "QUOTE_CONFLICT"
  | "PUBLIC_TOKEN_INVALID"

export class CatalogError extends Error {
  readonly code: CatalogErrorCode

  constructor(code: CatalogErrorCode, message: string) {
    super(message)
    this.name = "CatalogError"
    this.code = code
  }
}

const catalogItemGraph = {
  optionGroups: {
    include: {
      values: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  },
  product: {
    include: {
      currentUnitConfiguration: {
        include: {
          units: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      stockBalanceSources: {
        include: {
          inventoryUnit: true,
          variant: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  },
  service: true,
  variants: {
    include: {
      offerings: {
        include: {
          productUnitOffering: {
            include: {
              inventoryUnit: true,
            },
          },
          serviceOffering: true,
          storeAvailability: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      selections: {
        include: {
          group: true,
          value: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.CatalogItemInclude

type CatalogItemGraph = Prisma.CatalogItemGetPayload<{
  include: typeof catalogItemGraph
}>

function catalogKind(kind: CatalogItemKindValue) {
  return kind === "product" ? CatalogItemKind.PRODUCT : CatalogItemKind.SERVICE
}

function catalogKindValue(kind: CatalogItemKind): CatalogItemKindValue {
  return kind === CatalogItemKind.PRODUCT ? "product" : "service"
}

function catalogStatus(status: CatalogItemStatusValue) {
  if (status === "active") return CatalogRecordStatus.ACTIVE
  if (status === "archived") return CatalogRecordStatus.ARCHIVED
  return CatalogRecordStatus.DRAFT
}

function catalogStatusValue(
  status: CatalogRecordStatus,
): CatalogItemStatusValue {
  if (status === CatalogRecordStatus.ACTIVE) return "active"
  if (status === CatalogRecordStatus.ARCHIVED) return "archived"
  return "draft"
}

function pricingPolicy(policy: OfferingPricingPolicyValue) {
  return policy === "fixed"
    ? OfferingPricingPolicy.FIXED
    : OfferingPricingPolicy.QUOTE_REQUIRED
}

function pricingPolicyValue(
  policy: OfferingPricingPolicy,
): OfferingPricingPolicyValue {
  return policy === OfferingPricingPolicy.FIXED ? "fixed" : "quote_required"
}

function stockBehavior(behavior: InventoryUnitStockBehaviorValue) {
  if (behavior === "canonical_shared") {
    return InventoryUnitStockBehavior.CANONICAL_SHARED
  }
  if (behavior === "alternate_transaction") {
    return InventoryUnitStockBehavior.ALTERNATE_TRANSACTION
  }
  return InventoryUnitStockBehavior.PACKAGED_STOCK
}

function stockBehaviorValue(
  behavior: InventoryUnitStockBehavior,
): InventoryUnitStockBehaviorValue {
  if (behavior === InventoryUnitStockBehavior.CANONICAL_SHARED) {
    return "canonical_shared"
  }
  if (behavior === InventoryUnitStockBehavior.ALTERNATE_TRANSACTION) {
    return "alternate_transaction"
  }
  return "packaged_stock"
}

function slugifyCatalogItem(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  )
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return "null"
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function catalogPayloadHash(input: CreateCatalogItemInput) {
  return createHash("sha256").update(stableJson(input)).digest("hex")
}

function assertUniqueKeys(keys: string[], label: string) {
  const normalized = keys.map((key) => key.trim().toLowerCase())

  if (new Set(normalized).size !== normalized.length) {
    throw new CatalogError(
      "DUPLICATE_CATALOG_KEY",
      `${label} keys must be unique within the Catalog Item.`,
    )
  }
}

function assertMoney(value: number | undefined, label: string) {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 100_000_000
  ) {
    throw new CatalogError(
      "INVALID_OFFERING",
      `${label} must be a non-negative minor-unit amount.`,
    )
  }
}

function assertOfferingPricing(
  offering: CatalogOfferingInput,
  kind: CatalogItemKindValue,
) {
  if (kind === "product" && offering.pricingPolicy !== "fixed") {
    throw new CatalogError(
      "INVALID_OFFERING",
      "Product Unit Offerings require fixed pricing.",
    )
  }

  if (offering.pricingPolicy === "fixed") {
    assertMoney(offering.fixedPriceMinor, offering.name)
    return
  }

  if (offering.fixedPriceMinor !== undefined) {
    throw new CatalogError(
      "INVALID_OFFERING",
      "Quote-required Service Offerings cannot carry a fixed price.",
    )
  }
}

function assertVariants(input: CreateCatalogItemInput) {
  if (input.variants.length === 0) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Every Catalog Item requires an explicit Sellable Variant.",
    )
  }

  if (input.variants.filter((variant) => variant.isDefault).length !== 1) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Every Catalog Item requires exactly one default Sellable Variant.",
    )
  }

  assertUniqueKeys(
    input.variants.map((variant) => variant.key),
    "Variant",
  )

  const optionGroups = input.optionGroups ?? []
  assertUniqueKeys(
    optionGroups.map((group) => group.key),
    "Option group",
  )

  const optionValues = new Map<string, Set<string>>()
  for (const group of optionGroups) {
    if (!group.name.trim() || group.values.length === 0) {
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        "Every Option Group requires a name and at least one value.",
      )
    }
    assertUniqueKeys(
      group.values.map((value) => value.key),
      `${group.name} option value`,
    )
    if (group.values.some((value) => !value.label.trim())) {
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        `Every ${group.name} option value requires a label.`,
      )
    }
    optionValues.set(
      group.key.trim().toLowerCase(),
      new Set(group.values.map((value) => value.key.trim().toLowerCase())),
    )
  }

  const offeringKeys: string[] = []
  const selectionCombinations = new Set<string>()
  for (const variant of input.variants) {
    if (variant.offerings.length === 0) {
      throw new CatalogError(
        "INVALID_OFFERING",
        `Sellable Variant ${variant.name} requires at least one Offering.`,
      )
    }

    const selections = variant.selections ?? []
    if (selections.length !== optionGroups.length) {
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        optionGroups.length === 0
          ? "Variants without Option Groups cannot carry option selections."
          : `Variant ${variant.name} must select one value from every Option Group.`,
      )
    }

    const selectedGroups = new Set<string>()
    const combination: string[] = []
    for (const selection of selections) {
      const groupKey = selection.groupKey.trim().toLowerCase()
      const valueKey = selection.valueKey.trim().toLowerCase()
      if (
        selectedGroups.has(groupKey) ||
        !optionValues.get(groupKey)?.has(valueKey)
      ) {
        throw new CatalogError(
          "INVALID_CATALOG_ITEM",
          `Variant ${variant.name} contains an invalid or repeated option selection.`,
        )
      }
      selectedGroups.add(groupKey)
      combination.push(`${groupKey}:${valueKey}`)
    }
    const combinationKey = combination.sort().join("|")
    if (selectionCombinations.has(combinationKey)) {
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        `Variant ${variant.name} repeats an existing option combination.`,
      )
    }
    selectionCombinations.add(combinationKey)

    for (const offering of variant.offerings) {
      offeringKeys.push(offering.key)
      assertOfferingPricing(offering, input.kind)
      const storeIds =
        offering.storeAvailability?.map((availability) =>
          availability.storeId.trim(),
        ) ?? []
      if (new Set(storeIds).size !== storeIds.length) {
        throw new CatalogError(
          "INVALID_OFFERING",
          `Offering ${offering.name} repeats a Store availability entry.`,
        )
      }
    }
  }

  assertUniqueKeys(offeringKeys, "Offering")
}

function assertProductUnitConfiguration(input: CreateCatalogProductInput) {
  const { canonicalBalanceScale, units } = input.unitConfiguration

  if (
    !Number.isInteger(canonicalBalanceScale) ||
    canonicalBalanceScale < 0 ||
    canonicalBalanceScale > 18
  ) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "Canonical balance scale must be an integer from 0 to 18.",
    )
  }

  if (units.length === 0) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "A Product requires at least one Inventory Unit.",
    )
  }

  assertUniqueKeys(
    units.map((unit) => unit.key),
    "Inventory Unit",
  )

  let canonicalCount = 0
  const unitKeys = new Set<string>()

  for (const unit of units) {
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
        `Transaction scale for ${unit.name} must be an integer from 0 to 6.`,
      )
    }

    if (unit.stockBehavior === "canonical_shared") {
      canonicalCount += 1
      if (factor !== "1") {
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          "The Canonical Inventory Unit must have factor 1.",
        )
      }
    }

    unitKeys.add(unit.key.trim().toLowerCase())
  }

  if (canonicalCount !== 1) {
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "A Product requires exactly one Canonical Inventory Unit.",
    )
  }

  for (const variant of input.variants) {
    for (const offering of variant.offerings) {
      if (!unitKeys.has(offering.inventoryUnitKey.trim().toLowerCase())) {
        throw new CatalogError(
          "INVALID_OFFERING",
          `Offering ${offering.name} references an unknown Inventory Unit.`,
        )
      }
    }
  }
}

function assertCreateCatalogItem(input: CreateCatalogItemInput) {
  if (!input.name.trim()) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Catalog Item name is required.",
    )
  }

  if (!input.clientOperationId.trim()) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Client operation identity is required.",
    )
  }

  assertVariants(input)

  if (input.kind === "product") {
    assertProductUnitConfiguration(input)
    if (input.openingStockQuantity !== undefined) {
      parseExactDecimal(input.openingStockQuantity, {
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      })
    }
  }
}

async function createUniqueCatalogSlug(
  db: Prisma.TransactionClient,
  tenantId: string,
  name: string,
) {
  const base = slugifyCatalogItem(name)

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`
    const existing = await db.catalogItem.findUnique({
      where: { tenantId_slug: { slug, tenantId } },
      select: { id: true },
    })

    if (!existing) return slug
  }

  throw new CatalogError(
    "DUPLICATE_CATALOG_KEY",
    "Could not create a unique Catalog Item slug.",
  )
}

function serializeCatalogItem(item: CatalogItemGraph) {
  return {
    category: item.category,
    description: item.description,
    id: item.id,
    imageLinks: item.imageLinks,
    imageUrl: item.imageUrl,
    kind: catalogKindValue(item.kind),
    name: item.name,
    optionGroups: item.optionGroups.map((group) => ({
      id: group.id,
      key: group.key,
      name: group.name,
      values: group.values.map((value) => ({
        id: value.id,
        key: value.key,
        label: value.label,
      })),
    })),
    product: item.product
      ? {
          id: item.product.id,
          currentUnitConfiguration: item.product.currentUnitConfiguration
            ? {
                canonicalBalanceScale:
                  item.product.currentUnitConfiguration.canonicalBalanceScale,
                id: item.product.currentUnitConfiguration.id,
                units: item.product.currentUnitConfiguration.units.map(
                  (unit) => ({
                    factor: unit.factor.toString(),
                    id: unit.id,
                    key: unit.key,
                    name: unit.name,
                    stockBehavior: stockBehaviorValue(unit.stockBehavior),
                    symbol: unit.symbol,
                    transactionScale: unit.transactionScale,
                  }),
                ),
                version: item.product.currentUnitConfiguration.version,
              }
            : null,
          stockBalances: item.product.stockBalanceSources.map((balance) => ({
            id: balance.id,
            inventoryUnitId: balance.inventoryUnitId,
            inventoryUnitName: balance.inventoryUnit.name,
            kind:
              balance.kind === StockBalanceKind.SHARED_POOL
                ? "shared_pool"
                : "packaged_stock",
            onHandQuantity: balance.onHandQuantity.toString(),
            reservedQuantity: balance.reservedQuantity.toString(),
            revision: balance.revision,
            storeId: balance.storeId,
            variantId: balance.variantId,
            variantName: balance.variant.name,
          })),
        }
      : null,
    service: item.service ? { id: item.service.id } : null,
    slug: item.slug,
    status: catalogStatusValue(item.status),
    variants: item.variants.map((variant) => ({
      id: variant.id,
      isDefault: variant.isDefault,
      key: variant.key,
      name: variant.name,
      offerings: variant.offerings.map((offering) => ({
        currencyCode: offering.currencyCode,
        fixedPriceMinor: offering.fixedPriceMinor,
        id: offering.id,
        key: offering.key,
        kind:
          offering.kind === SellableOfferingKind.PRODUCT_UNIT
            ? "product_unit"
            : "service",
        name: offering.name,
        pricingPolicy: pricingPolicyValue(offering.pricingPolicy),
        productUnit: offering.productUnitOffering
          ? {
              barcode: offering.productUnitOffering.barcode,
              inventoryUnitId: offering.productUnitOffering.inventoryUnit.id,
              sku: offering.productUnitOffering.sku,
            }
          : null,
        service: offering.serviceOffering
          ? { id: offering.serviceOffering.id }
          : null,
        serviceWorkPolicy: offering.serviceOffering
          ? {
              authorizationPolicy:
                offering.serviceOffering.authorizationPolicy,
              guidance: offering.serviceOffering.guidance,
              quantityScale: offering.serviceOffering.quantityScale,
              workPolicy: offering.serviceOffering.workPolicy,
            }
          : null,
        status: catalogStatusValue(offering.status),
        stores: offering.storeAvailability.map((availability) => ({
          isAvailable: availability.isAvailable,
          storeId: availability.storeId,
        })),
      })),
      selections: variant.selections.map((selection) => ({
        groupId: selection.groupId,
        groupKey: selection.group.key,
        valueId: selection.valueId,
        valueKey: selection.value.key,
      })),
      status: catalogStatusValue(variant.status),
    })),
  }
}

export async function createCatalogItem(
  db: PrismaClient,
  input: CreateCatalogItemInput,
) {
  assertCreateCatalogItem(input)
  const payloadHash = catalogPayloadHash(input)

  return db.$transaction(async (tx) => {
    const previousCommand = await tx.catalogCommandReceipt.findUnique({
      where: {
        tenantId_clientOperationId: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      },
    })

    if (previousCommand) {
      if (previousCommand.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This client operation identity was already used with different input.",
        )
      }

      const previousItem = await tx.catalogItem.findUnique({
        include: catalogItemGraph,
        where: { id: previousCommand.catalogItemId },
      })

      if (!previousItem) {
        throw new CatalogError(
          "CATALOG_ITEM_NOT_FOUND",
          "The prior Catalog command result is unavailable.",
        )
      }

      return serializeCatalogItem(previousItem)
    }

    const store = await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
      select: {
        currencyCode: true,
        id: true,
      },
    })

    if (!store) {
      throw new CatalogError(
        "STORE_NOT_FOUND",
        "Store not found for this business.",
      )
    }

    const requestedAvailabilityStoreIds = Array.from(
      new Set(
        input.variants.flatMap((variant) =>
          variant.offerings.flatMap((offering) =>
            (offering.storeAvailability ?? []).map(
              (availability) => availability.storeId,
            ),
          ),
        ),
      ),
    )
    if (requestedAvailabilityStoreIds.length > 0) {
      const availableStores = await tx.store.count({
        where: {
          id: { in: requestedAvailabilityStoreIds },
          tenantId: input.tenantId,
        },
      })
      if (availableStores !== requestedAvailabilityStoreIds.length) {
        throw new CatalogError(
          "STORE_NOT_FOUND",
          "One or more Offering availability Stores do not belong to this business.",
        )
      }
    }

    const slug = await createUniqueCatalogSlug(tx, input.tenantId, input.name)
    const item = await tx.catalogItem.create({
      data: {
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        imageLinks: input.imageLinks ?? [],
        imageUrl: input.imageUrl?.trim() || null,
        kind: catalogKind(input.kind),
        name: input.name.trim(),
        slug,
        status: CatalogRecordStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })

    const unitIdsByKey = new Map<string, string>()
    const optionGroupIdsByKey = new Map<string, string>()
    const optionValueIdsByKey = new Map<string, string>()
    let productId: string | null = null
    let configurationVersionId: string | null = null
    let canonicalInventoryUnitId: string | null = null
    let canonicalTransactionScale: number | null = null
    let defaultVariantId: string | null = null

    if (input.kind === "product") {
      const product = await tx.catalogProduct.create({
        data: { catalogItemId: item.id },
      })
      productId = product.id
      const configuration = await tx.unitConfigurationVersion.create({
        data: {
          canonicalBalanceScale: input.unitConfiguration.canonicalBalanceScale,
          productId: product.id,
          status: UnitConfigurationStatus.CURRENT,
          version: 1,
        },
      })
      configurationVersionId = configuration.id

      for (const [index, unit] of input.unitConfiguration.units.entries()) {
        const createdUnit = await tx.inventoryUnit.create({
          data: {
            configurationVersionId: configuration.id,
            factor: parseExactDecimal(unit.factor, {
              allowZero: false,
              maxScale: EXACT_FACTOR_MAX_SCALE,
            }),
            key: unit.key.trim().toLowerCase(),
            name: unit.name.trim(),
            sortOrder: index,
            stockBehavior: stockBehavior(unit.stockBehavior),
            symbol: unit.symbol?.trim() || null,
            transactionScale: unit.transactionScale,
          },
        })

        unitIdsByKey.set(createdUnit.key, createdUnit.id)
        if (unit.stockBehavior === "canonical_shared") {
          canonicalInventoryUnitId = createdUnit.id
          canonicalTransactionScale = createdUnit.transactionScale
        }
      }

      await tx.catalogProduct.update({
        data: {
          currentUnitConfigurationVersionId: configuration.id,
        },
        where: { id: product.id },
      })
    } else {
      await tx.catalogService.create({
        data: { catalogItemId: item.id },
      })
    }

    for (const [groupIndex, groupInput] of (
      input.optionGroups ?? []
    ).entries()) {
      const groupKey = groupInput.key.trim().toLowerCase()
      const group = await tx.variantOptionGroup.create({
        data: {
          catalogItemId: item.id,
          key: groupKey,
          name: groupInput.name.trim(),
          sortOrder: groupIndex,
        },
      })
      optionGroupIdsByKey.set(groupKey, group.id)

      for (const [valueIndex, valueInput] of groupInput.values.entries()) {
        const valueKey = valueInput.key.trim().toLowerCase()
        const value = await tx.variantOptionValue.create({
          data: {
            groupId: group.id,
            key: valueKey,
            label: valueInput.label.trim(),
            sortOrder: valueIndex,
          },
        })
        optionValueIdsByKey.set(`${groupKey}:${valueKey}`, value.id)
      }
    }

    for (const [variantIndex, variantInput] of input.variants.entries()) {
      const variant = await tx.sellableVariant.create({
        data: {
          catalogItemId: item.id,
          isDefault: variantInput.isDefault,
          key: variantInput.key.trim().toLowerCase(),
          name: variantInput.name.trim(),
          sortOrder: variantIndex,
          status:
            variantInput.enabled === false
              ? CatalogRecordStatus.DRAFT
              : CatalogRecordStatus.ACTIVE,
        },
      })
      if (variant.isDefault) {
        defaultVariantId = variant.id
      }

      for (const selectionInput of variantInput.selections ?? []) {
        const groupKey = selectionInput.groupKey.trim().toLowerCase()
        const valueKey = selectionInput.valueKey.trim().toLowerCase()
        const groupId = optionGroupIdsByKey.get(groupKey)
        const valueId = optionValueIdsByKey.get(`${groupKey}:${valueKey}`)

        if (!groupId || !valueId) {
          throw new CatalogError(
            "INVALID_CATALOG_ITEM",
            `Variant ${variantInput.name} references an unknown option value.`,
          )
        }

        await tx.sellableVariantSelection.create({
          data: { groupId, valueId, variantId: variant.id },
        })
      }

      for (const [
        offeringIndex,
        offeringInput,
      ] of variantInput.offerings.entries()) {
        const offering = await tx.sellableOffering.create({
          data: {
            catalogItemId: item.id,
            currencyCode: store.currencyCode,
            fixedPriceMinor: offeringInput.fixedPriceMinor ?? null,
            key: offeringInput.key.trim().toLowerCase(),
            kind:
              input.kind === "product"
                ? SellableOfferingKind.PRODUCT_UNIT
                : SellableOfferingKind.SERVICE,
            name: offeringInput.name.trim(),
            pricingPolicy: pricingPolicy(offeringInput.pricingPolicy),
            sortOrder: offeringIndex,
            status:
              variantInput.enabled === false || offeringInput.enabled === false
                ? CatalogRecordStatus.DRAFT
                : CatalogRecordStatus.ACTIVE,
            tenantId: input.tenantId,
            variantId: variant.id,
          },
        })

        if (input.kind === "product") {
          const productOffering =
            offeringInput as CreateCatalogProductInput["variants"][number]["offerings"][number]
          const inventoryUnitId = unitIdsByKey.get(
            productOffering.inventoryUnitKey.trim().toLowerCase(),
          )

          if (!inventoryUnitId) {
            throw new CatalogError(
              "INVALID_OFFERING",
              `Offering ${offeringInput.name} references an unknown Inventory Unit.`,
            )
          }

          await tx.productUnitOffering.create({
            data: {
              barcode: productOffering.barcode?.trim() || null,
              inventoryUnitId,
              offeringId: offering.id,
              sku: productOffering.sku?.trim() || null,
              tenantId: input.tenantId,
            },
          })
        } else {
          const serviceOffering =
            offeringInput as CreateCatalogServiceInput["variants"][number]["offerings"][number]
          await tx.serviceOffering.create({
            data: {
              authorizationPolicy:
                serviceOffering.authorizationPolicy === "after_required_payment"
                  ? WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT
                  : serviceOffering.authorizationPolicy === "manual_release"
                    ? WorkAuthorizationPolicy.MANUAL_RELEASE
                    : WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION,
              guidance: serviceOffering.guidance?.trim() || null,
              offeringId: offering.id,
              quantityScale: serviceOffering.quantityScale ?? 0,
              workPolicy:
                serviceOffering.workPolicy === "tracked"
                  ? ServiceWorkPolicy.TRACKED
                  : ServiceWorkPolicy.CHARGE_ONLY,
            },
          })
        }

        const storeAvailability = offeringInput.storeAvailability ?? [
          { isAvailable: true, storeId: store.id },
        ]
        await tx.storeOfferingAvailability.createMany({
          data: storeAvailability.map((availability) => ({
            isAvailable: availability.isAvailable,
            offeringId: offering.id,
            storeId: availability.storeId,
          })),
        })

        if (offering.fixedPriceMinor !== null) {
          await tx.catalogPriceChange.create({
            data: {
              changedByUserId: input.actorUserId,
              currencyCode: store.currencyCode,
              offeringId: offering.id,
              priceMinor: offering.fixedPriceMinor,
              reason: "Initial price",
              tenantId: input.tenantId,
            },
          })
        }
      }
    }

    if (input.kind === "product" && input.openingStockQuantity !== undefined) {
      const openingStockQuantity = parseExactDecimal(
        input.openingStockQuantity,
        { maxScale: EXACT_QUANTITY_MAX_SCALE },
      )

      if (
        openingStockQuantity !== "0" &&
        productId &&
        configurationVersionId &&
        canonicalInventoryUnitId &&
        canonicalTransactionScale !== null &&
        defaultVariantId
      ) {
        const balanceSource = await tx.stockBalanceSource.create({
          data: {
            inventoryUnitId: canonicalInventoryUnitId,
            kind: StockBalanceKind.SHARED_POOL,
            onHandQuantity: openingStockQuantity,
            productId,
            storeId: store.id,
            tenantId: input.tenantId,
            variantId: defaultVariantId,
          },
        })
        const operation = await tx.stockOperation.create({
          data: {
            actorUserId: input.actorUserId,
            clientOperationId: `${input.clientOperationId}:opening-stock`,
            payloadHash,
            reason: "Initial stock",
            source: "catalog_setup",
            storeId: store.id,
            tenantId: input.tenantId,
            type: StockOperationType.OPENING_STOCK,
          },
        })

        await tx.stockMovement.create({
          data: {
            balanceSourceId: balanceSource.id,
            configurationVersionId,
            enteredInventoryUnitId: canonicalInventoryUnitId,
            enteredQuantity: openingStockQuantity,
            operationId: operation.id,
            previousOnHandQuantity: "0",
            resultingOnHandQuantity: openingStockQuantity,
            signedCanonicalEffect: openingStockQuantity,
            transactionScaleSnapshot: canonicalTransactionScale,
            unitFactorSnapshot: "1",
          },
        })
      }
    }

    await tx.catalogCommandReceipt.create({
      data: {
        catalogItemId: item.id,
        clientOperationId: input.clientOperationId,
        commandType: "CREATE_CATALOG_ITEM",
        payloadHash,
        storeId: store.id,
        tenantId: input.tenantId,
      },
    })

    const created = await tx.catalogItem.findUnique({
      include: catalogItemGraph,
      where: { id: item.id },
    })

    if (!created) {
      throw new CatalogError(
        "CATALOG_ITEM_NOT_FOUND",
        "Catalog Item could not be reloaded after creation.",
      )
    }

    return serializeCatalogItem(created)
  })
}

export async function createSimpleCatalogItem(
  db: PrismaClient,
  input: CreateSimpleCatalogItemInput,
) {
  if (input.kind === "service") {
    return createCatalogItem(db, {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      description: input.description,
      kind: "service",
      name: input.name,
      storeId: input.storeId,
      tenantId: input.tenantId,
      variants: [
        {
          isDefault: true,
          key: "default",
          name: input.name,
          offerings: [
            {
            fixedPriceMinor: input.priceMinor,
            authorizationPolicy: input.authorizationPolicy,
            guidance: input.guidance,
            key: "default",
            name: input.name,
            pricingPolicy: "fixed",
            quantityScale: input.quantityScale,
            workPolicy: input.workPolicy,
            },
          ],
        },
      ],
    })
  }

  const unitName = input.canonicalUnitName.trim()
  const unitKey = slugifyCatalogItem(unitName)

  return createCatalogItem(db, {
    actorUserId: input.actorUserId,
    clientOperationId: input.clientOperationId,
    description: input.description,
    kind: "product",
    name: input.name,
    openingStockQuantity: input.openingStockQuantity,
    storeId: input.storeId,
    tenantId: input.tenantId,
    unitConfiguration: {
      canonicalBalanceScale: 0,
      units: [
        {
          factor: "1",
          key: unitKey,
          name: unitName,
          stockBehavior: "canonical_shared",
          transactionScale: 0,
        },
      ],
    },
    variants: [
      {
        isDefault: true,
        key: "default",
        name: input.name,
        offerings: [
          {
            fixedPriceMinor: input.priceMinor,
            inventoryUnitKey: unitKey,
            key: "default",
            name: unitName,
            pricingPolicy: "fixed",
          },
        ],
      },
    ],
  })
}

export async function getCatalogItem(
  db: PrismaClient,
  input: GetCatalogItemInput,
) {
  const item = await db.catalogItem.findFirst({
    include: catalogItemGraph,
    where: { id: input.itemId, tenantId: input.tenantId },
  })

  return item ? serializeCatalogItem(item) : null
}

export async function listCatalogItems(
  db: PrismaClient,
  input: ListCatalogItemsInput,
) {
  const items = await db.catalogItem.findMany({
    include: catalogItemGraph,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    where: {
      kind: input.kind ? catalogKind(input.kind) : undefined,
      status: input.status ? catalogStatus(input.status) : undefined,
      tenantId: input.tenantId,
    },
  })

  return items.map(serializeCatalogItem)
}

export async function setCatalogOfferingStoreAvailability(
  db: PrismaClient,
  input: {
    isAvailable: boolean
    offeringId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const offering = await tx.sellableOffering.findFirst({
      where: { id: input.offeringId, tenantId: input.tenantId },
      select: { id: true },
    })
    if (!offering) {
      throw new CatalogError(
        "CATALOG_OFFERING_NOT_FOUND",
        "Catalog Offering not found.",
      )
    }

    const store = await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
      select: { id: true },
    })
    if (!store) {
      throw new CatalogError(
        "STORE_NOT_FOUND",
        "Store not found for this business.",
      )
    }

    return tx.storeOfferingAvailability.upsert({
      create: {
        isAvailable: input.isAvailable,
        offeringId: offering.id,
        storeId: store.id,
      },
      update: { isAvailable: input.isAvailable },
      where: {
        storeId_offeringId: {
          offeringId: offering.id,
          storeId: store.id,
        },
      },
    })
  })
}

export async function archiveCatalogOffering(
  db: PrismaClient,
  input: { offeringId: string; tenantId: string },
) {
  const offering = await db.sellableOffering.findFirst({
    where: { id: input.offeringId, tenantId: input.tenantId },
    select: { id: true },
  })
  if (!offering) {
    throw new CatalogError(
      "CATALOG_OFFERING_NOT_FOUND",
      "Catalog Offering not found.",
    )
  }

  return db.sellableOffering.update({
    data: { archivedAt: new Date(), status: CatalogRecordStatus.ARCHIVED },
    where: { id: offering.id },
  })
}

export async function archiveCatalogVariant(
  db: PrismaClient,
  input: { tenantId: string; variantId: string },
) {
  return db.$transaction(async (tx) => {
    const variant = await tx.sellableVariant.findFirst({
      where: {
        catalogItem: { tenantId: input.tenantId },
        id: input.variantId,
      },
      select: { id: true },
    })
    if (!variant) {
      throw new CatalogError(
        "CATALOG_VARIANT_NOT_FOUND",
        "Sellable Variant not found.",
      )
    }

    const archivedAt = new Date()
    await tx.sellableOffering.updateMany({
      data: { archivedAt, status: CatalogRecordStatus.ARCHIVED },
      where: { variantId: variant.id },
    })
    return tx.sellableVariant.update({
      data: {
        archivedAt,
        isDefault: false,
        status: CatalogRecordStatus.ARCHIVED,
      },
      where: { id: variant.id },
    })
  })
}
