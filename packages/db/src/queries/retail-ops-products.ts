import { randomUUID } from "node:crypto"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind as DurableCatalogItemKind,
  InventoryMovementDirection as DurableInventoryMovementDirection,
  InventoryMovementSource as DurableInventoryMovementSource,
  InventoryMovementType as DurableInventoryMovementType,
  ProductStatus as DurableProductStatus,
  ProductUnitPriceChangeSource as DurableProductUnitPriceChangeSource,
  ServiceFulfillmentMode as DurableServiceFulfillmentMode,
} from "../../generated/prisma/enums"
import { assertRetailOpsEntitlementAvailable } from "./retail-ops-subscriptions"

export type CreateRetailOpsProductUnitInput = {
  conversionMultiplier?: number
  enabled?: boolean
  imageLinks?: string[]
  imageUrl?: string
  name: string
  openingStockQuantity: number
  priceMinor: number
  variantLabel?: string
}

export type CreateRetailOpsProductInput = {
  actorUserId: string
  description?: string
  externalId?: string
  imageLinks?: string[]
  imageUrl?: string
  name: string
  openingStockQuantity: number
  primaryUnitName: string
  priceMinor: number
  storeId: string
  tenantId: string
  unitTemplateKey?: string
  variants: CreateRetailOpsProductUnitInput[]
}

export type RetailOpsCatalogItemKind = "product" | "service"
export type RetailOpsCatalogItemStatus = "active" | "archived" | "draft"

export type CreateRetailOpsCatalogItemInput = {
  actorUserId: string
  category?: string
  description?: string
  externalId?: string
  imageLinks?: string[]
  imageUrl?: string
  kind: RetailOpsCatalogItemKind
  name: string
  openingStockQuantity?: number
  priceMinor: number
  primaryUnitName?: string
  service?: {
    estimatedTurnaroundHours?: number
    fulfillmentMode?: "immediate" | "tracked"
    instructions?: string
  }
  storeId: string
  tenantId: string
  unitTemplateKey?: string
  variants: Array<{
    conversionMultiplier?: number
    enabled?: boolean
    imageLinks?: string[]
    imageUrl?: string
    name: string
    openingStockQuantity?: number
    priceMinor: number
    variantLabel?: string
  }>
}

export type CreatedRetailOpsCatalogItem = {
  item: {
    category: string | null
    currencyCode: string
    description: string | null
    id: string
    kind: RetailOpsCatalogItemKind
    name: string
    slug: string
  }
  service: {
    estimatedTurnaroundHours: number | null
    fulfillmentMode: "immediate" | "tracked"
    instructions: string | null
  } | null
  variants: CreatedRetailOpsProduct["units"]
}

export type RetailOpsCatalogItem = {
  category: string | null
  currencyCode: string
  description: string | null
  id: string
  imageLinks: string[]
  imageUrl: string | null
  kind: RetailOpsCatalogItemKind
  name: string
  service: {
    estimatedTurnaroundHours: number | null
    fulfillmentMode: "immediate" | "tracked"
    instructions: string | null
  } | null
  slug: string
  status: RetailOpsCatalogItemStatus
  variants: Array<{
    availableQuantity: number | null
    id: string
    imageLinks: string[]
    imageUrl: string | null
    isDefault: boolean
    name: string
    priceMinor: number
    sku: string
  }>
}

export type ListRetailOpsCatalogItemsInput = {
  kind?: RetailOpsCatalogItemKind
  storeId: string
  tenantId: string
}

export type UpdateRetailOpsCatalogItemInput = {
  actorUserId: string
  category?: string | null
  description?: string | null
  imageLinks?: string[]
  imageUrl?: string | null
  itemId: string
  kind: RetailOpsCatalogItemKind
  name?: string
  priceMinor?: number
  service?: {
    estimatedTurnaroundHours?: number | null
    fulfillmentMode?: "immediate" | "tracked"
    instructions?: string | null
  }
  status?: Exclude<RetailOpsCatalogItemStatus, "draft">
  storeId: string
  tenantId: string
}

type NormalizedRetailOpsProductUnitInput = {
  conversionMultiplier: number | null
  enabled: boolean
  imageLinks: string[]
  imageUrl?: string
  name: string
  openingStockQuantity: number
  priceMinor: number
  variantLabel?: string
}

export type UpdateRetailOpsProductUnitPriceInput = {
  actorUserId: string
  effectiveAt?: Date
  priceMinor: number
  productVariantId: string
  reason?: string
  storeId: string
  tenantId: string
}

export type ListRetailOpsProductUnitPriceHistoryInput = {
  from?: Date
  limit?: number
  productVariantId?: string
  storeId: string
  tenantId: string
  to?: Date
}

export type GetRetailOpsProductUnitPriceAtInput = {
  effectiveAt?: Date
  productVariantId: string
  storeId: string
  tenantId: string
}

export type RetailOpsProductUnitPriceHistoryEntry = {
  actorUserId: string
  effectiveAt: string
  id: string
  previousPriceMinor: number | null
  priceMinor: number
  reason: string | null
  source: "retail_ops_product_setup" | "retail_ops_unit_price_update"
}

export type RetailOpsProductUnitPriceHistoryRow =
  RetailOpsProductUnitPriceHistoryEntry & {
    currentPriceMinor: number
    product: {
      currencyCode: string
      id: string
      name: string
      slug: string
    }
    unit: {
      id: string
      isDefault: boolean
      name: string
      sku: string
    }
  }

export type RetailOpsResolvedProductUnitPrice = {
  effectiveAt: string | null
  priceMinor: number
  productVariantId: string
  source: "current_variant" | "durable_price_history" | "metadata_price_history"
}

export type RetailOpsProductUnitEffectivePrice =
  RetailOpsResolvedProductUnitPrice & {
    currentPriceMinor: number
    product: {
      currencyCode: string
      id: string
      name: string
      slug: string
    }
    requestedAt: string
    unit: {
      id: string
      isDefault: boolean
      name: string
      sku: string
    }
  }

export type CreatedRetailOpsProduct = {
  product: {
    currencyCode: string
    id: string
    name: string
    slug: string
  }
  units: Array<{
    conversionMultiplier: number | null
    id: string
    isDefault: boolean
    name: string
    openingStockQuantity: number
    priceMinor: number
    sku: string
  }>
}

export type RetailOpsProductUnitTemplate = {
  baseUnitName: string
  description: string | null
  id: string
  isSystem: boolean
  key: string
  name: string
  sortOrder: number
  source: "durable" | "fallback"
  units: Array<{
    conversionMultiplier: number
    id: string
    isBase: boolean
    key: string
    name: string
    ratioDenominator: number
    ratioNumerator: number
    sortOrder: number
  }>
}

export type UpdatedRetailOpsProductUnitPrice = {
  product: {
    currencyCode: string
    id: string
    name: string
    slug: string
  }
  unit: {
    id: string
    isDefault: boolean
    name: string
    previousPriceMinor: number
    priceHistory: RetailOpsProductUnitPriceHistoryEntry[]
    priceMinor: number
    sku: string
  }
}

type RetailOpsProductErrorCode =
  | "DUPLICATE_UNIT"
  | "FUTURE_PRICE_NOT_SUPPORTED"
  | "ITEM_KIND_MISMATCH"
  | "ITEM_NOT_FOUND"
  | "ITEM_NOT_STOCKABLE"
  | "PRODUCT_UNIT_NOT_FOUND"
  | "STORE_NOT_FOUND"
type DurableProductUnitPriceHistory = {
  changedByUserId: string | null
  effectiveAt: Date
  id: string
  previousPriceMinor: number | null
  priceMinor: number
  product: {
    currencyCode: string
    id: string
    name: string
    slug: string
  }
  productVariant: {
    id: string
    isDefault: boolean
    name: string
    priceMinor: number
    sku: string
  }
  reason: string | null
  source: string
}

type RetailOpsConversionRatio = {
  denominator: number
  numerator: number
}

type DurableProductUnitTemplate = {
  baseUnitName: string
  description: string | null
  id: string
  isSystem: boolean
  key: string
  name: string
  sortOrder: number
  units: Array<{
    id: string
    isBase: boolean
    key: string
    name: string
    ratioDenominator: number
    ratioNumerator: number
    sortOrder: number
  }>
}

type DurableProductUnitTemplateUnit =
  DurableProductUnitTemplate["units"][number]
type RetailOpsFallbackProductUnitTemplateUnit =
  RetailOpsProductUnitTemplate["units"][number]
type RetailOpsProductSetupTemplateUnit =
  | DurableProductUnitTemplateUnit
  | RetailOpsFallbackProductUnitTemplateUnit

const FALLBACK_PRODUCT_UNIT_TEMPLATES: RetailOpsProductUnitTemplate[] = [
  {
    baseUnitName: "Bag",
    description: "Common bag, half-bag, and quarter-bag selling units.",
    id: "fallback:bag-fractions",
    isSystem: true,
    key: "bag_fractions",
    name: "Bag fractions",
    sortOrder: 10,
    source: "fallback",
    units: [
      {
        conversionMultiplier: 1,
        id: "fallback:bag-fractions:bag",
        isBase: true,
        key: "bag",
        name: "Bag",
        ratioDenominator: 1,
        ratioNumerator: 1,
        sortOrder: 10,
      },
      {
        conversionMultiplier: 0.5,
        id: "fallback:bag-fractions:half-bag",
        isBase: false,
        key: "half_bag",
        name: "Half bag",
        ratioDenominator: 2,
        ratioNumerator: 1,
        sortOrder: 20,
      },
      {
        conversionMultiplier: 0.25,
        id: "fallback:bag-fractions:quarter-bag",
        isBase: false,
        key: "quarter_bag",
        name: "Quarter bag",
        ratioDenominator: 4,
        ratioNumerator: 1,
        sortOrder: 30,
      },
    ],
  },
  {
    baseUnitName: "Bag",
    description:
      "A 25 kg feed bag with half-bag, quarter-bag, and loose kilogram units.",
    id: "fallback:feed-bag-25kg",
    isSystem: true,
    key: "feed_bag_25kg",
    name: "25 kg feed bag",
    sortOrder: 20,
    source: "fallback",
    units: [
      {
        conversionMultiplier: 1,
        id: "fallback:feed-bag-25kg:bag",
        isBase: true,
        key: "bag",
        name: "Bag",
        ratioDenominator: 1,
        ratioNumerator: 1,
        sortOrder: 10,
      },
      {
        conversionMultiplier: 0.5,
        id: "fallback:feed-bag-25kg:half-bag",
        isBase: false,
        key: "half_bag",
        name: "Half bag",
        ratioDenominator: 2,
        ratioNumerator: 1,
        sortOrder: 20,
      },
      {
        conversionMultiplier: 0.25,
        id: "fallback:feed-bag-25kg:quarter-bag",
        isBase: false,
        key: "quarter_bag",
        name: "Quarter bag",
        ratioDenominator: 4,
        ratioNumerator: 1,
        sortOrder: 30,
      },
      {
        conversionMultiplier: 0.04,
        id: "fallback:feed-bag-25kg:kilogram",
        isBase: false,
        key: "kilogram",
        name: "Kilogram",
        ratioDenominator: 25,
        ratioNumerator: 1,
        sortOrder: 40,
      },
    ],
  },
  {
    baseUnitName: "Bag",
    description:
      "A 50 kg feed bag with half-bag, quarter-bag, and loose kilogram units.",
    id: "fallback:feed-bag-50kg",
    isSystem: true,
    key: "feed_bag_50kg",
    name: "50 kg feed bag",
    sortOrder: 30,
    source: "fallback",
    units: [
      {
        conversionMultiplier: 1,
        id: "fallback:feed-bag-50kg:bag",
        isBase: true,
        key: "bag",
        name: "Bag",
        ratioDenominator: 1,
        ratioNumerator: 1,
        sortOrder: 10,
      },
      {
        conversionMultiplier: 0.5,
        id: "fallback:feed-bag-50kg:half-bag",
        isBase: false,
        key: "half_bag",
        name: "Half bag",
        ratioDenominator: 2,
        ratioNumerator: 1,
        sortOrder: 20,
      },
      {
        conversionMultiplier: 0.25,
        id: "fallback:feed-bag-50kg:quarter-bag",
        isBase: false,
        key: "quarter_bag",
        name: "Quarter bag",
        ratioDenominator: 4,
        ratioNumerator: 1,
        sortOrder: 30,
      },
      {
        conversionMultiplier: 0.02,
        id: "fallback:feed-bag-50kg:kilogram",
        isBase: false,
        key: "kilogram",
        name: "Kilogram",
        ratioDenominator: 50,
        ratioNumerator: 1,
        sortOrder: 40,
      },
    ],
  },
  {
    baseUnitName: "Kilogram",
    description: "Common kilogram, half-kilogram, and quarter-kilogram units.",
    id: "fallback:kilogram-fractions",
    isSystem: true,
    key: "kilogram_fractions",
    name: "Kilogram fractions",
    sortOrder: 40,
    source: "fallback",
    units: [
      {
        conversionMultiplier: 1,
        id: "fallback:kilogram-fractions:kilogram",
        isBase: true,
        key: "kilogram",
        name: "Kilogram",
        ratioDenominator: 1,
        ratioNumerator: 1,
        sortOrder: 10,
      },
      {
        conversionMultiplier: 0.5,
        id: "fallback:kilogram-fractions:half-kilogram",
        isBase: false,
        key: "half_kilogram",
        name: "Half kilogram",
        ratioDenominator: 2,
        ratioNumerator: 1,
        sortOrder: 20,
      },
      {
        conversionMultiplier: 0.25,
        id: "fallback:kilogram-fractions:quarter-kilogram",
        isBase: false,
        key: "quarter_kilogram",
        name: "Quarter kilogram",
        ratioDenominator: 4,
        ratioNumerator: 1,
        sortOrder: 30,
      },
    ],
  },
]

export class RetailOpsProductError extends Error {
  code: RetailOpsProductErrorCode

  constructor(code: RetailOpsProductErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsProductError"
    this.code = code
  }
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function normalizeUnitName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeTemplateKey(value: string | null | undefined) {
  const cleaned = value?.trim()

  return cleaned || null
}

function toDurableCatalogItemKind(kind: RetailOpsCatalogItemKind) {
  return kind === "service"
    ? DurableCatalogItemKind.SERVICE
    : DurableCatalogItemKind.PRODUCT
}

function fromDurableCatalogItemKind(kind: string): RetailOpsCatalogItemKind {
  return kind === DurableCatalogItemKind.SERVICE ? "service" : "product"
}

function toDurableServiceFulfillmentMode(
  mode: "immediate" | "tracked" | undefined,
) {
  return mode === "immediate"
    ? DurableServiceFulfillmentMode.IMMEDIATE
    : DurableServiceFulfillmentMode.TRACKED
}

function fromDurableServiceFulfillmentMode(
  mode: string,
): "immediate" | "tracked" {
  return mode === DurableServiceFulfillmentMode.IMMEDIATE
    ? "immediate"
    : "tracked"
}

function toTemplateUnitLookupKey(value: string) {
  return normalizeUnitName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function assertUniqueUnitNames(units: Array<{ name: string }>) {
  const seen = new Set<string>()

  for (const unit of units) {
    const key = normalizeUnitName(unit.name).toLowerCase()

    if (seen.has(key)) {
      throw new RetailOpsProductError(
        "DUPLICATE_UNIT",
        "Product units must have unique names.",
      )
    }

    seen.add(key)
  }
}

async function createUniqueProductSlug(
  tx: Prisma.TransactionClient,
  input: {
    name: string
    storeId: string
  },
) {
  const baseSlug = toSlug(input.name) || "product"

  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    const existing = await tx.product.findUnique({
      where: {
        storeId_slug: {
          slug,
          storeId: input.storeId,
        },
      },
      select: {
        id: true,
      },
    })

    if (!existing) return slug
  }

  return `${baseSlug}-${Date.now().toString(36)}`
}

function createVariantSku(input: {
  productSlug: string
  unitName: string
  unitNumber: number
}) {
  const unitSlug = toSlug(input.unitName) || "unit"

  return `${input.productSlug}-${input.unitNumber + 1}-${unitSlug}`.slice(0, 64)
}

function normalizeConversionMultiplier(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return value
}

function toConversionRatio(
  value: number | null | undefined,
): RetailOpsConversionRatio | null {
  const normalizedValue = normalizeConversionMultiplier(value)

  if (normalizedValue === null) return null

  const denominator = 1_000
  const numerator = Math.round(normalizedValue * denominator)

  if (numerator <= 0) return null

  const divisor = gcd(numerator, denominator)

  return {
    denominator: denominator / divisor,
    numerator: numerator / divisor,
  }
}

function gcd(left: number, right: number): number {
  let currentLeft = Math.abs(left)
  let currentRight = Math.abs(right)

  while (currentRight > 0) {
    const nextRight = currentLeft % currentRight

    currentLeft = currentRight
    currentRight = nextRight
  }

  return currentLeft || 1
}

function getTemplateUnitConversionMultiplier(unit: {
  ratioDenominator: number
  ratioNumerator: number
}) {
  const numerator = normalizeConversionMultiplier(unit.ratioNumerator)
  const denominator = normalizeConversionMultiplier(unit.ratioDenominator)

  if (numerator === null || denominator === null) return 1

  return numerator / denominator
}

function getTemplateUnitConversionRatio(unit: {
  ratioDenominator: number
  ratioNumerator: number
}): RetailOpsConversionRatio | null {
  const numerator = normalizeConversionMultiplier(unit.ratioNumerator)
  const denominator = normalizeConversionMultiplier(unit.ratioDenominator)

  if (numerator === null || denominator === null) return null

  return {
    denominator,
    numerator,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as Record<string, unknown>
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function isDurablePriceHistoryTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function isDurableUnitTemplateTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function isDurableStockLedgerTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function withRetailOpsMetadata(
  metadata: unknown,
  retailOps: Record<string, unknown>,
) {
  const current = asRecord(metadata)

  return {
    ...current,
    retailOps: {
      ...getRetailOpsMetadata(metadata),
      ...retailOps,
    },
  } as Prisma.InputJsonValue
}

function getStringField(value: unknown) {
  const cleaned = typeof value === "string" ? value.trim() : ""

  return cleaned || null
}

function getPriceHistoryEntry(
  value: unknown,
): RetailOpsProductUnitPriceHistoryEntry | null {
  const record = asRecord(value)
  const source = getStringField(record.source)

  if (
    source !== "retail_ops_product_setup" &&
    source !== "retail_ops_unit_price_update"
  ) {
    return null
  }

  const actorUserId = getStringField(record.actorUserId)
  const effectiveAt = getStringField(record.effectiveAt)
  const id = getStringField(record.id)
  const priceMinor = getNumberField(record.priceMinor)

  if (!actorUserId || !effectiveAt || !id || priceMinor === null) {
    return null
  }

  const previousPriceMinor = getNumberField(record.previousPriceMinor)

  return {
    actorUserId,
    effectiveAt,
    id,
    previousPriceMinor,
    priceMinor,
    reason: getStringField(record.reason),
    source,
  }
}

function getVariantPriceHistory(metadata: unknown) {
  const priceHistory = getRetailOpsMetadata(metadata).priceHistory

  if (!Array.isArray(priceHistory)) return []

  return priceHistory.flatMap((entry) => {
    const priceHistoryEntry = getPriceHistoryEntry(entry)

    return priceHistoryEntry ? [priceHistoryEntry] : []
  })
}

function createPriceHistoryEntry(input: {
  actorUserId: string
  effectiveAt: Date
  previousPriceMinor: number | null
  priceMinor: number
  reason?: string
  source: RetailOpsProductUnitPriceHistoryEntry["source"]
}): RetailOpsProductUnitPriceHistoryEntry {
  return {
    actorUserId: input.actorUserId,
    effectiveAt: input.effectiveAt.toISOString(),
    id: randomUUID(),
    previousPriceMinor: input.previousPriceMinor,
    priceMinor: input.priceMinor,
    reason: input.reason?.trim() || null,
    source: input.source,
  }
}

function toDurablePriceChangeSource(
  source: RetailOpsProductUnitPriceHistoryEntry["source"],
) {
  if (source === "retail_ops_product_setup") {
    return DurableProductUnitPriceChangeSource.PRODUCT_SETUP
  }

  return DurableProductUnitPriceChangeSource.MANUAL
}

function fromDurablePriceChangeSource(
  source: string,
): RetailOpsProductUnitPriceHistoryEntry["source"] {
  if (source === DurableProductUnitPriceChangeSource.PRODUCT_SETUP) {
    return "retail_ops_product_setup"
  }

  return "retail_ops_unit_price_update"
}

function mapDurablePriceHistoryRow(
  row: DurableProductUnitPriceHistory,
): RetailOpsProductUnitPriceHistoryRow {
  return {
    actorUserId: row.changedByUserId ?? "",
    currentPriceMinor: row.productVariant.priceMinor,
    effectiveAt: row.effectiveAt.toISOString(),
    id: row.id,
    previousPriceMinor: row.previousPriceMinor,
    priceMinor: row.priceMinor,
    product: row.product,
    reason: row.reason,
    source: fromDurablePriceChangeSource(row.source),
    unit: {
      id: row.productVariant.id,
      isDefault: row.productVariant.isDefault,
      name: row.productVariant.name,
      sku: row.productVariant.sku,
    },
  }
}

async function writeDurablePriceHistoryEntry(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    currencyCode: string
    entry: RetailOpsProductUnitPriceHistoryEntry
    productId: string
    productVariantId: string
    storeId: string
    tenantId: string
  },
) {
  try {
    await db.productUnitPriceHistory.upsert({
      where: {
        id: input.entry.id,
      },
      create: {
        changedByUserId: input.entry.actorUserId,
        currencyCode: input.currencyCode,
        effectiveAt: new Date(input.entry.effectiveAt),
        id: input.entry.id,
        metadata: {
          retailOps: {
            source: input.entry.source,
          },
        } as Prisma.InputJsonValue,
        previousPriceMinor: input.entry.previousPriceMinor,
        priceMinor: input.entry.priceMinor,
        productId: input.productId,
        productVariantId: input.productVariantId,
        reason: input.entry.reason,
        source: toDurablePriceChangeSource(input.entry.source),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {
        changedByUserId: input.entry.actorUserId,
        currencyCode: input.currencyCode,
        effectiveAt: new Date(input.entry.effectiveAt),
        metadata: {
          retailOps: {
            source: input.entry.source,
          },
        } as Prisma.InputJsonValue,
        previousPriceMinor: input.entry.previousPriceMinor,
        priceMinor: input.entry.priceMinor,
        reason: input.entry.reason,
        source: toDurablePriceChangeSource(input.entry.source),
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurablePriceHistoryTableUnavailable(error)) return

    throw error
  }
}

async function writeDurableOpeningStockMovement(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    externalId: string | null
    happenedAt: Date
    inventoryItemId: string
    productId: string
    productVariantId: string
    quantity: number
    storeId: string
    tenantId: string
  },
) {
  if (input.quantity <= 0) return

  const movementExternalId = `opening_stock:${input.productId}:${input.productVariantId}`
  const movementGroupId = `product_setup:${input.externalId ?? input.productId}`

  try {
    await db.inventoryMovement.upsert({
      where: {
        tenantId_storeId_type_externalId: {
          externalId: movementExternalId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: DurableInventoryMovementType.OPENING_STOCK,
        },
      },
      create: {
        actorUserId: input.actorUserId,
        direction: DurableInventoryMovementDirection.INBOUND,
        externalId: movementExternalId,
        happenedAt: input.happenedAt,
        inventoryItemId: input.inventoryItemId,
        metadata: {
          retailOps: {
            productSetupExternalId: input.externalId,
            source: "retail_ops_product_setup",
          },
        } as Prisma.InputJsonValue,
        movementGroupId,
        note: "Initial product setup",
        onHandQuantity: input.quantity,
        previousOnHandQuantity: 0,
        productId: input.productId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        source: DurableInventoryMovementSource.PRODUCT_SETUP,
        sourceReferenceId: input.externalId ?? input.productId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableInventoryMovementType.OPENING_STOCK,
      },
      update: {
        actorUserId: input.actorUserId,
        happenedAt: input.happenedAt,
        inventoryItemId: input.inventoryItemId,
        metadata: {
          retailOps: {
            productSetupExternalId: input.externalId,
            source: "retail_ops_product_setup",
          },
        } as Prisma.InputJsonValue,
        movementGroupId,
        onHandQuantity: input.quantity,
        previousOnHandQuantity: 0,
        quantity: input.quantity,
        sourceReferenceId: input.externalId ?? input.productId,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurableStockLedgerTableUnavailable(error)) return

    throw error
  }
}

function getVariantOpeningStock(variant: {
  inventoryItem: { onHandQuantity: number } | null
  metadata: unknown
}) {
  const openingStockQuantity = getNumberField(
    getRetailOpsMetadata(variant.metadata).openingStockQuantity,
  )

  return openingStockQuantity ?? variant.inventoryItem?.onHandQuantity ?? 0
}

function getVariantConversionMultiplier(variant: {
  conversionRatioDenominator?: number | null
  conversionRatioNumerator?: number | null
  metadata: unknown
}) {
  const conversionMultiplier = getNumberField(
    getRetailOpsMetadata(variant.metadata).conversionMultiplier,
  )

  if (conversionMultiplier !== null) return conversionMultiplier

  const ratioNumerator = normalizeConversionMultiplier(
    variant.conversionRatioNumerator,
  )
  const ratioDenominator = normalizeConversionMultiplier(
    variant.conversionRatioDenominator,
  )

  if (ratioNumerator !== null && ratioDenominator !== null) {
    return ratioNumerator / ratioDenominator
  }

  return null
}

function toCreatedRetailOpsProduct(product: {
  currencyCode: string
  id: string
  name: string
  slug: string
  variants: Array<{
    conversionRatioDenominator: number | null
    conversionRatioNumerator: number | null
    id: string
    inventoryItem: { onHandQuantity: number } | null
    isDefault: boolean
    metadata: unknown
    name: string
    priceMinor: number
    sku: string
  }>
}): CreatedRetailOpsProduct {
  return {
    product: {
      currencyCode: product.currencyCode,
      id: product.id,
      name: product.name,
      slug: product.slug,
    },
    units: product.variants.map((variant) => ({
      conversionMultiplier: getVariantConversionMultiplier(variant),
      id: variant.id,
      isDefault: variant.isDefault,
      name: variant.name,
      openingStockQuantity: getVariantOpeningStock(variant),
      priceMinor: variant.priceMinor,
      sku: variant.sku,
    })),
  }
}

async function writeDurableProductSetupPriceHistory(
  db: PrismaClient,
  input: {
    productId: string
    storeId: string
    tenantId: string
  },
) {
  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      status: { not: "ARCHIVED" },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      currencyCode: true,
      id: true,
      variants: {
        where: {
          isActive: true,
        },
        select: {
          id: true,
          metadata: true,
        },
      },
    },
  })

  if (!product) return

  await Promise.all(
    product.variants.flatMap((variant) =>
      getVariantPriceHistory(variant.metadata)
        .filter((entry) => entry.source === "retail_ops_product_setup")
        .map((entry) =>
          writeDurablePriceHistoryEntry(db, {
            currencyCode: product.currencyCode,
            entry,
            productId: product.id,
            productVariantId: variant.id,
            storeId: input.storeId,
            tenantId: input.tenantId,
          }),
        ),
    ),
  )
}

function mapDurableProductUnitTemplate(
  template: DurableProductUnitTemplate,
): RetailOpsProductUnitTemplate {
  return {
    baseUnitName: template.baseUnitName,
    description: template.description,
    id: template.id,
    isSystem: template.isSystem,
    key: template.key,
    name: template.name,
    sortOrder: template.sortOrder,
    source: "durable",
    units: template.units.map((unit) => ({
      conversionMultiplier: getTemplateUnitConversionMultiplier(unit),
      id: unit.id,
      isBase: unit.isBase,
      key: unit.key,
      name: unit.name,
      ratioDenominator: unit.ratioDenominator,
      ratioNumerator: unit.ratioNumerator,
      sortOrder: unit.sortOrder,
    })),
  }
}

function findFallbackProductUnitTemplate(key: string | null) {
  if (!key) return null

  return (
    FALLBACK_PRODUCT_UNIT_TEMPLATES.find((template) => template.key === key) ??
    null
  )
}

async function resolveDurableProductUnitTemplate(
  db: Prisma.TransactionClient,
  input: {
    key: string | null
    tenantId: string
  },
): Promise<DurableProductUnitTemplate | null> {
  if (!input.key) return null

  try {
    return await db.productUnitTemplate.findFirst({
      where: {
        isActive: true,
        key: input.key,
        OR: [
          {
            isSystem: true,
          },
          {
            tenantId: input.tenantId,
          },
        ],
      },
      select: {
        baseUnitName: true,
        description: true,
        id: true,
        isSystem: true,
        key: true,
        name: true,
        sortOrder: true,
        units: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            isBase: true,
            key: true,
            name: true,
            ratioDenominator: true,
            ratioNumerator: true,
            sortOrder: true,
          },
        },
      },
    })
  } catch (error) {
    if (isDurableUnitTemplateTableUnavailable(error)) return null

    throw error
  }
}

function findMatchingTemplateUnit(
  template: {
    units: RetailOpsProductSetupTemplateUnit[]
  } | null,
  input: {
    isDefault: boolean
    name: string
  },
): RetailOpsProductSetupTemplateUnit | null {
  if (!template) return null

  const lookupKey = toTemplateUnitLookupKey(input.name)
  const nameKey = normalizeUnitName(input.name).toLowerCase()
  const matchingUnit = template.units.find(
    (unit) =>
      unit.key === lookupKey ||
      normalizeUnitName(unit.name).toLowerCase() === nameKey,
  )

  if (matchingUnit) return matchingUnit
  if (input.isDefault) return template.units.find((unit) => unit.isBase) ?? null

  return null
}

function mergeProductUnitTemplates(
  durableTemplates: RetailOpsProductUnitTemplate[],
) {
  const templatesByKey = new Map<string, RetailOpsProductUnitTemplate>()

  for (const template of FALLBACK_PRODUCT_UNIT_TEMPLATES) {
    templatesByKey.set(template.key, template)
  }

  for (const template of durableTemplates) {
    templatesByKey.set(template.key, template)
  }

  return [...templatesByKey.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  )
}

export async function listRetailOpsProductUnitTemplates(
  db: PrismaClient,
  input: {
    tenantId: string
  },
): Promise<RetailOpsProductUnitTemplate[]> {
  try {
    const templates = await db.productUnitTemplate.findMany({
      where: {
        isActive: true,
        OR: [
          {
            isSystem: true,
          },
          {
            tenantId: input.tenantId,
          },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        baseUnitName: true,
        description: true,
        id: true,
        isSystem: true,
        key: true,
        name: true,
        sortOrder: true,
        units: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            isBase: true,
            key: true,
            name: true,
            ratioDenominator: true,
            ratioNumerator: true,
            sortOrder: true,
          },
        },
      },
    })

    return mergeProductUnitTemplates(
      templates.map(mapDurableProductUnitTemplate),
    )
  } catch (error) {
    if (isDurableUnitTemplateTableUnavailable(error)) {
      return FALLBACK_PRODUCT_UNIT_TEMPLATES
    }

    throw error
  }
}

async function createRetailOpsCatalogItemInternal(
  db: PrismaClient,
  input: CreateRetailOpsCatalogItemInput,
) {
  const externalId = input.externalId?.trim() || null
  const durableKind = toDurableCatalogItemKind(input.kind)
  const isService = input.kind === "service"
  const unitTemplateKey = isService
    ? null
    : normalizeTemplateKey(input.unitTemplateKey)
  const primaryUnit: NormalizedRetailOpsProductUnitInput = {
    conversionMultiplier: 1,
    enabled: true,
    imageLinks: [],
    name: input.primaryUnitName?.trim() || (isService ? "Standard" : "Unit"),
    openingStockQuantity: isService ? 0 : (input.openingStockQuantity ?? 0),
    priceMinor: input.priceMinor,
  }
  const units: NormalizedRetailOpsProductUnitInput[] = [
    primaryUnit,
    ...input.variants.map((variant) => ({
      conversionMultiplier: variant.conversionMultiplier ?? null,
      enabled: variant.enabled !== false,
      imageLinks: variant.imageLinks ?? [],
      imageUrl: variant.imageUrl,
      name: variant.name,
      openingStockQuantity: isService ? 0 : (variant.openingStockQuantity ?? 0),
      priceMinor: variant.priceMinor,
      variantLabel: variant.variantLabel,
    })),
  ]

  assertUniqueUnitNames(units)

  const result = await db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        currencyCode: true,
      },
    })

    if (!store) {
      throw new RetailOpsProductError(
        "STORE_NOT_FOUND",
        "Store not found for this tenant.",
      )
    }

    if (externalId) {
      const existingProduct = await tx.product.findFirst({
        where: {
          kind: durableKind,
          metadata: {
            path: ["retailOps", "externalId"],
            equals: externalId,
          },
          status: { not: "ARCHIVED" },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          currencyCode: true,
          category: true,
          description: true,
          id: true,
          kind: true,
          name: true,
          serviceProfile: {
            select: {
              estimatedTurnaroundHours: true,
              fulfillmentMode: true,
              instructions: true,
            },
          },
          slug: true,
          variants: {
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: {
              conversionRatioDenominator: true,
              conversionRatioNumerator: true,
              id: true,
              inventoryItem: {
                select: {
                  onHandQuantity: true,
                },
              },
              isDefault: true,
              metadata: true,
              name: true,
              priceMinor: true,
              sku: true,
            },
          },
        },
      })

      if (existingProduct) {
        return {
          created: false,
          item: {
            category: existingProduct.category,
            currencyCode: existingProduct.currencyCode,
            description: existingProduct.description,
            id: existingProduct.id,
            kind: fromDurableCatalogItemKind(existingProduct.kind),
            name: existingProduct.name,
            slug: existingProduct.slug,
          },
          openingStockMovements: [],
          product: toCreatedRetailOpsProduct(existingProduct),
          service: existingProduct.serviceProfile
            ? {
                estimatedTurnaroundHours:
                  existingProduct.serviceProfile.estimatedTurnaroundHours,
                fulfillmentMode: fromDurableServiceFulfillmentMode(
                  existingProduct.serviceProfile.fulfillmentMode,
                ),
                instructions: existingProduct.serviceProfile.instructions,
              }
            : null,
        }
      }
    }

    await assertRetailOpsEntitlementAvailable(tx, {
      key: "products",
      tenantId: input.tenantId,
    })

    const productSlug = await createUniqueProductSlug(tx, {
      name: input.name,
      storeId: input.storeId,
    })
    const unitTemplate = await resolveDurableProductUnitTemplate(tx, {
      key: unitTemplateKey,
      tenantId: input.tenantId,
    })
    const fallbackUnitTemplate = unitTemplate
      ? null
      : findFallbackProductUnitTemplate(unitTemplateKey)
    const setupUnitTemplate = unitTemplate ?? fallbackUnitTemplate
    const setupUnitTemplateSource = unitTemplate
      ? "durable"
      : fallbackUnitTemplate
        ? "fallback"
        : null
    const product = await tx.product.create({
      data: {
        category: input.category?.trim() || null,
        currencyCode: store.currencyCode,
        description: input.description,
        kind: durableKind,
        listPriceMinor: input.priceMinor,
        metadata: {
          retailOps: {
            actorUserId: input.actorUserId,
            externalId,
            imageLinks: input.imageLinks ?? [],
            imageUrl: input.imageUrl?.trim() || null,
            imagesUrl: input.imageLinks ?? [],
            itemKind: input.kind,
            primaryUnitName: normalizeUnitName(primaryUnit.name),
            source: isService
              ? "retail_ops_catalog_item_setup"
              : "retail_ops_product_setup",
            unitTemplateId: unitTemplate?.id ?? null,
            unitTemplateKey:
              unitTemplate?.key ?? fallbackUnitTemplate?.key ?? unitTemplateKey,
            unitTemplateSource: setupUnitTemplateSource,
          },
        },
        name: input.name,
        slug: productSlug,
        status: "ACTIVE",
        storeId: input.storeId,
        tenantId: input.tenantId,
        ...(unitTemplate ? { unitTemplateId: unitTemplate.id } : {}),
      },
      select: {
        currencyCode: true,
        id: true,
        name: true,
        slug: true,
      },
    })

    const service = isService
      ? await tx.serviceItemProfile.upsert({
          where: {
            productId: product.id,
          },
          create: {
            estimatedTurnaroundHours:
              input.service?.estimatedTurnaroundHours ?? null,
            fulfillmentMode: toDurableServiceFulfillmentMode(
              input.service?.fulfillmentMode,
            ),
            instructions: input.service?.instructions?.trim() || null,
            productId: product.id,
          },
          update: {
            estimatedTurnaroundHours:
              input.service?.estimatedTurnaroundHours ?? null,
            fulfillmentMode: toDurableServiceFulfillmentMode(
              input.service?.fulfillmentMode,
            ),
            instructions: input.service?.instructions?.trim() || null,
          },
          select: {
            estimatedTurnaroundHours: true,
            fulfillmentMode: true,
            instructions: true,
          },
        })
      : null

    const createdAt = new Date()
    const createdUnits: CreatedRetailOpsProduct["units"] = []
    const openingStockMovements: Array<
      Parameters<typeof writeDurableOpeningStockMovement>[1]
    > = []

    for (const [unitNumber, unit] of units.entries()) {
      const templateUnit = findMatchingTemplateUnit(setupUnitTemplate, {
        isDefault: unitNumber === 0,
        name: unit.name,
      })
      const durableTemplateUnit =
        unitTemplate && templateUnit
          ? (unitTemplate.units.find(
              (durableUnit) => durableUnit.id === templateUnit.id,
            ) ?? null)
          : null
      const conversionMultiplier = templateUnit
        ? getTemplateUnitConversionMultiplier(templateUnit)
        : unit.conversionMultiplier
      const conversionRatio =
        (templateUnit ? getTemplateUnitConversionRatio(templateUnit) : null) ??
        toConversionRatio(conversionMultiplier)
      const variant = await tx.productVariant.create({
        data: {
          conversionRatioDenominator: conversionRatio?.denominator ?? null,
          conversionRatioNumerator: conversionRatio?.numerator ?? null,
          isActive: unit.enabled !== false,
          isDefault: unitNumber === 0,
          metadata: {
            retailOps: {
              conversionMultiplier,
              enabled: unit.enabled !== false,
              imageLinks: unit.imageLinks ?? [],
              imageUrl: unit.imageUrl?.trim() || null,
              imagesUrl: unit.imageLinks ?? [],
              openingStockQuantity: unit.openingStockQuantity,
              priceHistory: [
                createPriceHistoryEntry({
                  actorUserId: input.actorUserId,
                  effectiveAt: createdAt,
                  previousPriceMinor: null,
                  priceMinor: unit.priceMinor,
                  reason: "Initial product setup",
                  source: "retail_ops_product_setup",
                }),
              ],
              source: "retail_ops_product_setup",
              unitTemplateId: unitTemplate?.id ?? null,
              unitTemplateKey:
                unitTemplate?.key ??
                fallbackUnitTemplate?.key ??
                unitTemplateKey,
              unitTemplateSource: setupUnitTemplateSource,
              unitTemplateUnitId: durableTemplateUnit?.id ?? null,
              unitTemplateUnitKey: templateUnit?.key ?? null,
              variantLabel: unit.variantLabel?.trim() || null,
            },
          },
          name: normalizeUnitName(unit.name),
          priceMinor: unit.priceMinor,
          productId: product.id,
          sku: createVariantSku({
            productSlug,
            unitName: unit.name,
            unitNumber,
          }),
          ...(unitTemplate ? { unitTemplateId: unitTemplate.id } : {}),
          ...(durableTemplateUnit
            ? { unitTemplateUnitId: durableTemplateUnit.id }
            : {}),
        },
        select: {
          id: true,
          isDefault: true,
          name: true,
          priceMinor: true,
          sku: true,
        },
      })

      if (!isService) {
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            onHandQuantity: unit.openingStockQuantity,
            productVariantId: variant.id,
            storeId: input.storeId,
            tenantId: input.tenantId,
            updatedByUserId: input.actorUserId,
          },
          select: {
            id: true,
          },
        })

        openingStockMovements.push({
          actorUserId: input.actorUserId,
          externalId,
          happenedAt: createdAt,
          inventoryItemId: inventoryItem.id,
          productId: product.id,
          productVariantId: variant.id,
          quantity: unit.openingStockQuantity,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      }

      createdUnits.push({
        conversionMultiplier,
        id: variant.id,
        isDefault: variant.isDefault,
        name: variant.name,
        openingStockQuantity: unit.openingStockQuantity,
        priceMinor: variant.priceMinor,
        sku: variant.sku,
      })
    }

    return {
      created: true,
      item: {
        category: input.category?.trim() || null,
        currencyCode: product.currencyCode,
        description: input.description?.trim() || null,
        id: product.id,
        kind: input.kind,
        name: product.name,
        slug: product.slug,
      },
      openingStockMovements,
      product: {
        product,
        units: createdUnits,
      },
      service: service
        ? {
            estimatedTurnaroundHours: service.estimatedTurnaroundHours,
            fulfillmentMode: fromDurableServiceFulfillmentMode(
              service.fulfillmentMode,
            ),
            instructions: service.instructions,
          }
        : null,
    }
  })

  if (result.created) {
    await Promise.all([
      ...result.openingStockMovements.map((movement) =>
        writeDurableOpeningStockMovement(db, movement),
      ),
      writeDurableProductSetupPriceHistory(db, {
        productId: result.product.product.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      }),
    ])
  }

  return result
}

export async function createRetailOpsCatalogItem(
  db: PrismaClient,
  input: CreateRetailOpsCatalogItemInput,
): Promise<CreatedRetailOpsCatalogItem> {
  const result = await createRetailOpsCatalogItemInternal(db, input)

  return {
    item: result.item,
    service: result.service,
    variants: result.product.units,
  }
}

function mapRetailOpsCatalogItem(input: {
  category: string | null
  currencyCode: string
  description: string | null
  id: string
  kind: string
  metadata: unknown
  name: string
  serviceProfile: {
    estimatedTurnaroundHours: number | null
    fulfillmentMode: string
    instructions: string | null
  } | null
  slug: string
  status: string
  variants: Array<{
    id: string
    inventoryItem: {
      onHandQuantity: number
      reservedQuantity: number
    } | null
    isDefault: boolean
    metadata: unknown
    name: string
    priceMinor: number
    sku: string
  }>
}): RetailOpsCatalogItem {
  const kind = fromDurableCatalogItemKind(input.kind)
  const retailOpsMetadata = getRetailOpsMetadata(input.metadata)
  const imageLinks = Array.isArray(retailOpsMetadata.imageLinks)
    ? retailOpsMetadata.imageLinks.filter(
        (value): value is string => typeof value === "string",
      )
    : []

  return {
    category: input.category,
    currencyCode: input.currencyCode,
    description: input.description,
    id: input.id,
    imageLinks,
    imageUrl: getStringField(retailOpsMetadata.imageUrl),
    kind,
    name: input.name,
    service: input.serviceProfile
      ? {
          estimatedTurnaroundHours:
            input.serviceProfile.estimatedTurnaroundHours,
          fulfillmentMode: fromDurableServiceFulfillmentMode(
            input.serviceProfile.fulfillmentMode,
          ),
          instructions: input.serviceProfile.instructions,
        }
      : null,
    slug: input.slug,
    status:
      input.status === DurableProductStatus.ARCHIVED
        ? "archived"
        : input.status === DurableProductStatus.DRAFT
          ? "draft"
          : "active",
    variants: input.variants.map((variant) => {
      const variantMetadata = getRetailOpsMetadata(variant.metadata)
      return {
        availableQuantity:
          kind === "product"
            ? Math.max(
                0,
                (variant.inventoryItem?.onHandQuantity ?? 0) -
                  (variant.inventoryItem?.reservedQuantity ?? 0),
              )
            : null,
        id: variant.id,
        imageLinks: Array.isArray(variantMetadata.imageLinks)
          ? variantMetadata.imageLinks.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        imageUrl: getStringField(variantMetadata.imageUrl),
        isDefault: variant.isDefault,
        name: variant.name,
        priceMinor: variant.priceMinor,
        sku: variant.sku,
      }
    }),
  }
}

const retailOpsCatalogItemSelect = {
  category: true,
  currencyCode: true,
  description: true,
  id: true,
  kind: true,
  metadata: true,
  name: true,
  serviceProfile: {
    select: {
      estimatedTurnaroundHours: true,
      fulfillmentMode: true,
      instructions: true,
    },
  },
  slug: true,
  status: true,
  variants: {
    where: {
      isActive: true,
    },
    orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }],
    select: {
      id: true,
      inventoryItem: {
        select: {
          onHandQuantity: true,
          reservedQuantity: true,
        },
      },
      isDefault: true,
      metadata: true,
      name: true,
      priceMinor: true,
      sku: true,
    },
  },
} satisfies Prisma.ProductSelect

export async function listRetailOpsCatalogItems(
  db: PrismaClient,
  input: ListRetailOpsCatalogItemsInput,
): Promise<RetailOpsCatalogItem[]> {
  const items = await db.product.findMany({
    where: {
      ...(input.kind
        ? {
            kind: toDurableCatalogItemKind(input.kind),
          }
        : {}),
      status: { not: "ARCHIVED" },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: retailOpsCatalogItemSelect,
  })

  return items.map(mapRetailOpsCatalogItem)
}

export async function updateRetailOpsCatalogItem(
  db: PrismaClient,
  input: UpdateRetailOpsCatalogItemInput,
): Promise<RetailOpsCatalogItem> {
  return db.$transaction(async (tx) => {
    const item = await tx.product.findFirst({
      where: {
        id: input.itemId,
        status: { not: "ARCHIVED" },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        kind: true,
        metadata: true,
        status: true,
        variants: {
          where: {
            isActive: true,
            isDefault: true,
          },
          take: 1,
          select: {
            id: true,
          },
        },
      },
    })

    if (!item) {
      throw new RetailOpsProductError(
        "ITEM_NOT_FOUND",
        "Catalog item not found for this store.",
      )
    }

    const durableKind = toDurableCatalogItemKind(input.kind)
    if (item.kind !== durableKind) {
      if (item.status !== DurableProductStatus.DRAFT) {
        throw new RetailOpsProductError(
          "ITEM_KIND_MISMATCH",
          "An item type can only be corrected while the item is an unused draft.",
        )
      }
      const operationalReferenceCounts = await Promise.all([
        tx.inventoryItem.count({
          where: { productVariant: { productId: item.id } },
        }),
        tx.inventoryMovement.count({ where: { productId: item.id } }),
        tx.orderItem.count({ where: { productId: item.id } }),
        tx.productShareLink.count({ where: { productId: item.id } }),
        tx.serviceJobLine.count({ where: { productId: item.id } }),
        tx.serviceRequestLine.count({ where: { productId: item.id } }),
        tx.staffStockWallet.count({ where: { productId: item.id } }),
      ])
      if (operationalReferenceCounts.some((count) => count > 0)) {
        throw new RetailOpsProductError(
          "ITEM_KIND_MISMATCH",
          "An item with operational history must be archived and recreated to change its type.",
        )
      }
    }

    const normalizedName = input.name?.trim()
    const nextMetadata =
      input.imageLinks !== undefined || input.imageUrl !== undefined
        ? withRetailOpsMetadata(item.metadata, {
            ...(input.imageLinks !== undefined
              ? { imageLinks: input.imageLinks, imagesUrl: input.imageLinks }
              : {}),
            ...(input.imageUrl !== undefined
              ? { imageUrl: input.imageUrl?.trim() || null }
              : {}),
          })
        : undefined
    const updated = await tx.product.update({
      where: {
        id: item.id,
      },
      data: {
        ...(input.category !== undefined
          ? { category: input.category?.trim() || null }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(normalizedName ? { name: normalizedName } : {}),
        ...(item.kind !== durableKind ? { kind: durableKind } : {}),
        ...(nextMetadata ? { metadata: nextMetadata } : {}),
        ...(input.priceMinor !== undefined
          ? { listPriceMinor: input.priceMinor }
          : {}),
        ...(input.status
          ? {
              status:
                input.status === "archived"
                  ? DurableProductStatus.ARCHIVED
                  : DurableProductStatus.ACTIVE,
            }
          : {}),
      },
      select: {
        id: true,
      },
    })

    if (input.priceMinor !== undefined && item.variants[0]) {
      await tx.productVariant.update({
        where: {
          id: item.variants[0].id,
        },
        data: {
          priceMinor: input.priceMinor,
        },
        select: {
          id: true,
        },
      })
    }

    if (
      durableKind === DurableCatalogItemKind.SERVICE &&
      (input.service || item.kind !== durableKind)
    ) {
      await tx.serviceItemProfile.upsert({
        where: {
          productId: updated.id,
        },
        create: {
          estimatedTurnaroundHours:
            input.service?.estimatedTurnaroundHours ?? null,
          fulfillmentMode: toDurableServiceFulfillmentMode(
            input.service?.fulfillmentMode,
          ),
          instructions: input.service?.instructions?.trim() || null,
          productId: updated.id,
        },
        update: {
          ...(input.service?.estimatedTurnaroundHours !== undefined
            ? {
                estimatedTurnaroundHours:
                  input.service.estimatedTurnaroundHours,
              }
            : {}),
          ...(input.service?.fulfillmentMode
            ? {
                fulfillmentMode: toDurableServiceFulfillmentMode(
                  input.service.fulfillmentMode,
                ),
              }
            : {}),
          ...(input.service?.instructions !== undefined
            ? {
                instructions: input.service.instructions?.trim() || null,
              }
            : {}),
        },
        select: {
          id: true,
        },
      })
    } else if (
      durableKind === DurableCatalogItemKind.PRODUCT &&
      item.kind !== durableKind
    ) {
      await tx.serviceItemProfile.deleteMany({
        where: {
          productId: updated.id,
        },
      })
    }

    const result = await tx.product.findUniqueOrThrow({
      where: {
        id: item.id,
      },
      select: retailOpsCatalogItemSelect,
    })

    return mapRetailOpsCatalogItem(result)
  })
}

export async function createRetailOpsProduct(
  db: PrismaClient,
  input: CreateRetailOpsProductInput,
): Promise<CreatedRetailOpsProduct> {
  const result = await createRetailOpsCatalogItemInternal(db, {
    ...input,
    kind: "product",
  })

  return result.product
}

export async function updateRetailOpsProductUnitPrice(
  db: PrismaClient,
  input: UpdateRetailOpsProductUnitPriceInput,
): Promise<UpdatedRetailOpsProductUnitPrice> {
  const effectiveAt = input.effectiveAt ?? new Date()

  if (effectiveAt.getTime() > Date.now()) {
    throw new RetailOpsProductError(
      "FUTURE_PRICE_NOT_SUPPORTED",
      "Future-dated price changes are not supported yet.",
    )
  }

  const result = await db.$transaction(async (tx) => {
    const unit = await tx.productVariant.findFirst({
      where: {
        id: input.productVariantId,
        isActive: true,
        product: {
          status: { not: "ARCHIVED" },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
      select: {
        id: true,
        isDefault: true,
        metadata: true,
        name: true,
        priceMinor: true,
        sku: true,
        product: {
          select: {
            currencyCode: true,
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    if (!unit) {
      throw new RetailOpsProductError(
        "PRODUCT_UNIT_NOT_FOUND",
        "Product unit not found for this store.",
      )
    }

    const nextEntry = createPriceHistoryEntry({
      actorUserId: input.actorUserId,
      effectiveAt,
      previousPriceMinor: unit.priceMinor,
      priceMinor: input.priceMinor,
      reason: input.reason,
      source: "retail_ops_unit_price_update",
    })
    const nextPriceHistory = [
      ...getVariantPriceHistory(unit.metadata),
      nextEntry,
    ]
    const updatedUnit = await tx.productVariant.update({
      where: {
        id: unit.id,
      },
      data: {
        metadata: withRetailOpsMetadata(unit.metadata, {
          priceHistory: nextPriceHistory,
        }),
        priceMinor: input.priceMinor,
      },
      select: {
        id: true,
        isDefault: true,
        name: true,
        priceMinor: true,
        sku: true,
      },
    })

    if (unit.isDefault) {
      await tx.product.update({
        where: {
          id: unit.product.id,
        },
        data: {
          listPriceMinor: input.priceMinor,
        },
        select: {
          id: true,
        },
      })
    }

    return {
      priceHistoryEntry: nextEntry,
      product: unit.product,
      unit: {
        id: updatedUnit.id,
        isDefault: updatedUnit.isDefault,
        name: updatedUnit.name,
        previousPriceMinor: unit.priceMinor,
        priceHistory: nextPriceHistory,
        priceMinor: updatedUnit.priceMinor,
        sku: updatedUnit.sku,
      },
    }
  })

  await writeDurablePriceHistoryEntry(db, {
    currencyCode: result.product.currencyCode,
    entry: result.priceHistoryEntry,
    productId: result.product.id,
    productVariantId: result.unit.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  return {
    product: result.product,
    unit: result.unit,
  }
}

async function listMetadataRetailOpsProductUnitPriceHistory(
  db: PrismaClient,
  input: ListRetailOpsProductUnitPriceHistoryInput,
): Promise<RetailOpsProductUnitPriceHistoryRow[]> {
  const units = await db.productVariant.findMany({
    where: {
      ...(input.productVariantId ? { id: input.productVariantId } : {}),
      isActive: true,
      product: {
        status: { not: "ARCHIVED" },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      isDefault: true,
      metadata: true,
      name: true,
      priceMinor: true,
      sku: true,
      product: {
        select: {
          currencyCode: true,
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  return units
    .flatMap((unit): RetailOpsProductUnitPriceHistoryRow[] =>
      getVariantPriceHistory(unit.metadata).map((entry) => ({
        ...entry,
        currentPriceMinor: unit.priceMinor,
        product: unit.product,
        unit: {
          id: unit.id,
          isDefault: unit.isDefault,
          name: unit.name,
          sku: unit.sku,
        },
      })),
    )
    .filter((entry) => {
      const effectiveAt = new Date(entry.effectiveAt)

      if (Number.isNaN(effectiveAt.getTime())) return false
      if (input.from && effectiveAt < input.from) return false
      if (input.to && effectiveAt > input.to) return false

      return true
    })
    .sort(
      (left, right) =>
        new Date(right.effectiveAt).getTime() -
        new Date(left.effectiveAt).getTime(),
    )
}

async function listDurableRetailOpsProductUnitPriceHistory(
  db: PrismaClient,
  input: ListRetailOpsProductUnitPriceHistoryInput & { limit: number },
): Promise<RetailOpsProductUnitPriceHistoryRow[]> {
  const rows = await db.productUnitPriceHistory.findMany({
    where: {
      ...(input.productVariantId
        ? { productVariantId: input.productVariantId }
        : {}),
      effectiveAt: {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {}),
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
      product: {
        status: { not: "ARCHIVED" },
      },
      productVariant: {
        isActive: true,
      },
    },
    orderBy: {
      effectiveAt: "desc",
    },
    take: input.limit,
    select: {
      changedByUserId: true,
      effectiveAt: true,
      id: true,
      previousPriceMinor: true,
      priceMinor: true,
      product: {
        select: {
          currencyCode: true,
          id: true,
          name: true,
          slug: true,
        },
      },
      productVariant: {
        select: {
          id: true,
          isDefault: true,
          name: true,
          priceMinor: true,
          sku: true,
        },
      },
      reason: true,
      source: true,
    },
  })

  return rows.map(mapDurablePriceHistoryRow)
}

function mergePriceHistoryRows(input: {
  durableRows: RetailOpsProductUnitPriceHistoryRow[]
  limit: number
  metadataRows: RetailOpsProductUnitPriceHistoryRow[]
}) {
  const rowsById = new Map<string, RetailOpsProductUnitPriceHistoryRow>()

  for (const row of input.metadataRows) {
    rowsById.set(row.id, row)
  }

  for (const row of input.durableRows) {
    rowsById.set(row.id, row)
  }

  return [...rowsById.values()]
    .sort(
      (left, right) =>
        new Date(right.effectiveAt).getTime() -
        new Date(left.effectiveAt).getTime(),
    )
    .slice(0, input.limit)
}

function resolveMetadataProductUnitPriceAt(input: {
  currentPriceMinor: number
  effectiveAt: Date
  metadata: unknown
  productVariantId: string
}): RetailOpsResolvedProductUnitPrice {
  const metadataPrice = getVariantPriceHistory(input.metadata)
    .flatMap((entry) => {
      const effectiveAt = new Date(entry.effectiveAt)

      if (Number.isNaN(effectiveAt.getTime())) return []
      if (effectiveAt > input.effectiveAt) return []

      return [{ effectiveAt, entry }]
    })
    .sort(
      (left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime(),
    )[0]

  if (metadataPrice) {
    return {
      effectiveAt: metadataPrice.effectiveAt.toISOString(),
      priceMinor: metadataPrice.entry.priceMinor,
      productVariantId: input.productVariantId,
      source: "metadata_price_history",
    }
  }

  return {
    effectiveAt: null,
    priceMinor: input.currentPriceMinor,
    productVariantId: input.productVariantId,
    source: "current_variant",
  }
}

export async function resolveRetailOpsProductUnitPriceAt(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    currentPriceMinor: number
    effectiveAt: Date
    metadata: unknown
    productVariantId: string
    storeId: string
    tenantId: string
  },
): Promise<RetailOpsResolvedProductUnitPrice> {
  try {
    const durablePrice = await db.productUnitPriceHistory.findFirst({
      where: {
        effectiveAt: {
          lte: input.effectiveAt,
        },
        productVariantId: input.productVariantId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        product: {
          status: { not: "ARCHIVED" },
        },
        productVariant: {
          isActive: true,
        },
      },
      orderBy: {
        effectiveAt: "desc",
      },
      select: {
        effectiveAt: true,
        priceMinor: true,
      },
    })

    if (durablePrice) {
      return {
        effectiveAt: durablePrice.effectiveAt.toISOString(),
        priceMinor: durablePrice.priceMinor,
        productVariantId: input.productVariantId,
        source: "durable_price_history",
      }
    }
  } catch (error) {
    if (!isDurablePriceHistoryTableUnavailable(error)) {
      throw error
    }
  }

  return resolveMetadataProductUnitPriceAt(input)
}

export async function getRetailOpsProductUnitPriceAt(
  db: PrismaClient,
  input: GetRetailOpsProductUnitPriceAtInput,
): Promise<RetailOpsProductUnitEffectivePrice> {
  const requestedAt = input.effectiveAt ?? new Date()
  const productVariant = await db.productVariant.findFirst({
    where: {
      id: input.productVariantId,
      isActive: true,
      product: {
        status: { not: "ARCHIVED" },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
    select: {
      id: true,
      isDefault: true,
      metadata: true,
      name: true,
      priceMinor: true,
      sku: true,
      product: {
        select: {
          currencyCode: true,
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  if (!productVariant) {
    throw new RetailOpsProductError(
      "PRODUCT_UNIT_NOT_FOUND",
      "Product unit not found for this store.",
    )
  }

  const resolvedPrice = await resolveRetailOpsProductUnitPriceAt(db, {
    currentPriceMinor: productVariant.priceMinor,
    effectiveAt: requestedAt,
    metadata: productVariant.metadata,
    productVariantId: productVariant.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  return {
    ...resolvedPrice,
    currentPriceMinor: productVariant.priceMinor,
    product: productVariant.product,
    requestedAt: requestedAt.toISOString(),
    unit: {
      id: productVariant.id,
      isDefault: productVariant.isDefault,
      name: productVariant.name,
      sku: productVariant.sku,
    },
  }
}

export async function listRetailOpsProductUnitPriceHistory(
  db: PrismaClient,
  input: ListRetailOpsProductUnitPriceHistoryInput,
): Promise<RetailOpsProductUnitPriceHistoryRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const metadataRows = await listMetadataRetailOpsProductUnitPriceHistory(
    db,
    input,
  )

  try {
    const durableRows = await listDurableRetailOpsProductUnitPriceHistory(db, {
      ...input,
      limit,
    })

    return mergePriceHistoryRows({
      durableRows,
      limit,
      metadataRows,
    })
  } catch (error) {
    if (isDurablePriceHistoryTableUnavailable(error)) {
      return metadataRows.slice(0, limit)
    }

    throw error
  }
}
