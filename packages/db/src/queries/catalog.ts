import { CatalogError } from "./catalog-errors"
export { CatalogError } from "./catalog-errors"
import {
  type CatalogItemGraph,
  type CatalogItemKindValue,
  type CatalogItemStatusValue,
  type InventoryUnitStockBehaviorValue,
  type OfferingPricingPolicyValue,
  catalogItemGraph,
  catalogItemGraphForStores,
  serializeCatalogItem,
} from "./catalog-read"
export { getCatalogItem } from "./catalog-read"
export type {
  CatalogItemKindValue,
  CatalogItemStatusValue,
  OfferingPricingPolicyValue,
  InventoryUnitStockBehaviorValue,
} from "./catalog-read"
import { createHash } from "node:crypto"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { type ProductUsage, productUsages } from "@ewatrade/utils/product-usage"

import {
  EXACT_CANONICAL_MAX_SCALE,
  EXACT_FACTOR_MAX_SCALE,
  EXACT_QUANTITY_MAX_SCALE,
  ExactDecimalError,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
  InventoryUnitStockBehavior,
  OfferingPricingPolicy,
  SellableOfferingKind,
  ServiceWorkPolicy,
  StockBalanceKind,
  StockOperationType,
  UnitConfigurationStatus,
  WorkAuthorizationPolicy,
} from "../../generated/prisma/enums"
import { resolveCatalogCategorySelection } from "./catalog-categories"
import { lockCatalogCommandInTransaction } from "./catalog-command-locks"
import {
  assertCatalogPhotoCreationReplay,
  attachCatalogPhotoAssets,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"
import { lockCommerceFinancialContext } from "./customer-ledger/commerce-locks"
import { FinanceError } from "./finance/rules"
import { recordInventoryOpeningValuationInTransaction } from "./finance/valuation-openings"
import {
  type ListSortKey,
  buildScopedListCursorWhere,
  buildScopedListPageWhere,
} from "./list-sort"
import { assertAccountStoreConversationTermsAccepted } from "./store-conversation-account-terms"
import { assertStoreConversationTextScreened } from "./store-conversation-text-safety"
import { StoreConversationError } from "./store-conversations-core"

const DEFAULT_CATALOG_TRANSACTION_SCALE = 2
const CATALOG_WRITE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const

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
  description?: string
  enabled?: boolean
  imageUrl?: string
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
  usage?: ProductUsage
  categoryId?: string
  subcategoryId?: string
  actorUserId: string
  category?: string
  clientOperationId: string
  description?: string
  imageLinks?: string[]
  imageUrl?: string
  illustrationId?: string
  photoAssetIds?: string[]
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
    > & {
      openingStockQuantity?: string
    }
  >
}

export type CreateCatalogServiceInput = {
  categoryId?: string
  subcategoryId?: string
  actorUserId: string
  category?: string
  clientOperationId: string
  description?: string
  imageLinks?: string[]
  imageUrl?: string
  illustrationId?: string
  photoAssetIds?: string[]
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
      usage?: ProductUsage
      clientOperationId: string
      description?: string
      kind: "product"
      name: string
      openingStockQuantity?: string
      priceMinor?: number
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
  storeIds?: string[]
  kind?: CatalogItemKindValue
  status?: CatalogItemStatusValue
  tenantId: string
}

export type ListCatalogItemsPageInput = ListCatalogItemsInput & {
  cursor?: string
  limit?: number
  query?: string
  sort?: {
    direction: "asc" | "desc"
    field: "name" | "kind" | "status" | "updatedAt"
  }
}

export type GetCatalogItemInput = {
  itemId: string
  tenantId: string
}

type CatalogTermsPublication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>

/** A write-time boundary for all customer-visible Catalog copy and media. */
export async function assertCatalogPublicationSafety(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    mediaUrls: readonly (string | null | undefined)[]
    publication?: CatalogTermsPublication | null
    texts: readonly (string | null | undefined)[]
  },
) {
  try {
    await assertAccountStoreConversationTermsAccepted(
      tx,
      input.actorUserId,
      input.publication === undefined
        ? currentEffectiveLegalPublication()
        : input.publication,
    )
  } catch (error) {
    if (error instanceof StoreConversationError) {
      throw new CatalogError(
        "CATALOG_TERMS_REQUIRED",
        "Review and accept the current EwaTrade Terms before publishing Catalog content.",
      )
    }
    throw error
  }

  // URL validation is not image inspection. Keep media closed until the
  // approved live media provider is wired into this same publication boundary.
  if (input.mediaUrls.some((url) => url?.trim())) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Catalog image publication is paused until live media screening is approved.",
    )
  }

  for (const value of new Set(
    input.texts
      .map((text) => text?.trim())
      .filter((text): text is string => Boolean(text)),
  )) {
    try {
      await assertStoreConversationTextScreened(value)
    } catch (error) {
      if (error instanceof StoreConversationError) {
        throw new CatalogError(
          "INVALID_CATALOG_ITEM",
          "Catalog text cannot be published until live safety screening is available and passes.",
        )
      }
      throw error
    }
  }
}

/** Recheck saved copy when a draft or unavailable Offering becomes visible. */
export async function assertExistingCatalogOfferingPublicationSafety(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    offeringId: string
    publication?: CatalogTermsPublication | null
    tenantId: string
  },
) {
  const offering = await tx.sellableOffering.findFirst({
    where: { id: input.offeringId, tenantId: input.tenantId },
    select: { catalogItemId: true, variantId: true },
  })
  if (!offering) {
    throw new CatalogError(
      "CATALOG_OFFERING_NOT_FOUND",
      "Catalog Offering not found.",
    )
  }
  const item = await tx.catalogItem.findFirst({
    include: catalogItemGraph,
    where: { id: offering.catalogItemId, tenantId: input.tenantId },
  })
  const variant = item?.variants.find(
    (entry) => entry.id === offering.variantId,
  )
  const selectedOffering = variant?.offerings.find(
    (entry) => entry.id === input.offeringId,
  )
  if (!item || !variant || !selectedOffering) {
    throw new CatalogError(
      "CATALOG_OFFERING_NOT_FOUND",
      "Catalog Offering not found.",
    )
  }
  await assertCatalogPublicationSafety(tx, {
    actorUserId: input.actorUserId,
    publication: input.publication,
    mediaUrls: [item.imageUrl, ...item.imageLinks, variant.imageUrl],
    texts: [
      item.name,
      item.category,
      item.description,
      ...item.optionGroups.flatMap((group) => [
        group.name,
        ...group.values.map((value) => value.label),
      ]),
      ...(item.product?.currentUnitConfiguration?.units ?? []).flatMap(
        (unit) => [unit.name, unit.symbol],
      ),
      variant.name,
      variant.description,
      selectedOffering.name,
      selectedOffering.serviceOffering?.guidance,
    ],
  })
}

function catalogKind(kind: CatalogItemKindValue) {
  return kind === "product" ? CatalogItemKind.PRODUCT : CatalogItemKind.SERVICE
}

function catalogStatus(status: CatalogItemStatusValue) {
  if (status === "active") return CatalogRecordStatus.ACTIVE
  if (status === "archived") return CatalogRecordStatus.ARCHIVED
  return CatalogRecordStatus.DRAFT
}

function pricingPolicy(policy: OfferingPricingPolicyValue) {
  if (policy === "order_total") return OfferingPricingPolicy.ORDER_TOTAL
  return policy === "fixed"
    ? OfferingPricingPolicy.FIXED
    : OfferingPricingPolicy.QUOTE_REQUIRED
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
  if (offering.pricingPolicy === "order_total") {
    if (kind !== "product" || offering.fixedPriceMinor !== undefined)
      throw new CatalogError(
        "INVALID_OFFERING",
        "Order-time-total pricing requires a Product Offering without a fixed price.",
      )
    return
  }
  if (kind === "product" && offering.pricingPolicy !== "fixed") {
    throw new CatalogError(
      "INVALID_OFFERING",
      "Product Unit Offerings require fixed pricing.",
    )
  }

  if (offering.pricingPolicy === "fixed") {
    if (kind === "product" && offering.fixedPriceMinor === undefined) return
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
  if (
    input.kind === "product" &&
    input.usage !== undefined &&
    !productUsages.includes(input.usage)
  ) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Choose a valid Product usage.",
    )
  }
  if (
    input.illustrationId !== undefined &&
    (!findCatalogIllustration(input.illustrationId) ||
      input.photoAssetIds?.length)
  ) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Choose a known illustration or photos, exclusively.",
    )
  }
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
    if (input.openingStockQuantity !== undefined)
      parseExactDecimal(input.openingStockQuantity, {
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      })
  }
}

function assertFreshOpeningStockPrecision(input: CreateCatalogItemInput) {
  if (input.kind === "product") {
    const canonical = input.unitConfiguration.units.find(
      (unit) => unit.stockBehavior === "canonical_shared",
    )
    if (!canonical)
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "A Canonical Inventory Unit is required for opening stock.",
      )
    for (const quantity of [
      input.openingStockQuantity,
      ...input.variants.map((variant) => variant.openingStockQuantity),
    ])
      if (quantity !== undefined) {
        try {
          parseExactDecimal(quantity, { maxScale: canonical.transactionScale })
        } catch (error) {
          if (error instanceof ExactDecimalError)
            throw new CatalogError("INVALID_STOCK_OPERATION", error.message)
          throw error
        }
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

export async function createCatalogItem(
  db: PrismaClient,
  input: CreateCatalogItemInput,
) {
  return db.$transaction((tx) => createCatalogItemInTransaction(tx, input), {
    ...CATALOG_WRITE_TRANSACTION_OPTIONS,
  })
}

export async function createCatalogItemInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateCatalogItemInput,
) {
  assertCreateCatalogItem(input)
  const payloadHash = catalogPayloadHash(input)
  if (input.illustrationId !== undefined)
    await authorizeCatalogPhotoScope(tx, input)
  const readPrevious = () =>
    tx.catalogCommandReceipt.findUnique({
      where: {
        tenantId_clientOperationId: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      },
    })

  const replay = async (
    previousCommand: NonNullable<Awaited<ReturnType<typeof readPrevious>>>,
  ) => {
    if (
      previousCommand.payloadHash !== payloadHash ||
      previousCommand.commandType !== "CREATE_CATALOG_ITEM" ||
      previousCommand.storeId !== input.storeId
    ) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This client operation identity was already used with different input.",
      )
    }

    if (input.illustrationId !== undefined) {
      await tx.$queryRaw`SELECT "id" FROM "CatalogItem"
        WHERE "id" = ${previousCommand.catalogItemId} AND "tenantId" = ${input.tenantId}
        FOR SHARE`
    }
    const previousItem = await tx.catalogItem.findUnique({
      include: catalogItemGraph,
      where: { id: previousCommand.catalogItemId, tenantId: input.tenantId },
    })

    if (!previousItem) {
      throw new CatalogError(
        "CATALOG_ITEM_NOT_FOUND",
        "The prior Catalog command result is unavailable.",
      )
    }

    if (input.illustrationId !== undefined) {
      await authorizeCatalogPhotoScope(tx, input)
      if (
        !previousItem.illustrations.some(
          (entry) =>
            entry.storeId === input.storeId &&
            entry.illustrationId === input.illustrationId,
        )
      ) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "The previous item no longer owns this Store illustration.",
        )
      }
    }
    if (input.photoAssetIds?.length) {
      await assertCatalogPhotoCreationReplay(tx, {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        assetIds: input.photoAssetIds,
        catalogItemId: previousItem.id,
      })
    }

    return serializeCatalogItem(previousItem)
  }

  const previousCommand = await readPrevious()
  if (previousCommand) return replay(previousCommand)

  await assertCatalogPublicationSafety(tx, {
    actorUserId: input.actorUserId,
    mediaUrls: [
      input.imageUrl,
      ...(input.imageLinks ?? []),
      ...input.variants.map((variant) => variant.imageUrl),
    ],
    texts: [
      input.name,
      input.category,
      input.description,
      ...(input.optionGroups ?? []).flatMap((group) => [
        group.name,
        ...group.values.map((value) => value.label),
      ]),
      ...(input.kind === "product"
        ? input.unitConfiguration.units.flatMap((unit) => [
            unit.name,
            unit.symbol,
          ])
        : []),
      ...input.variants.flatMap((variant) => [
        variant.name,
        variant.description,
        ...variant.offerings.flatMap((offering) => [
          offering.name,
          ...(input.kind === "service"
            ? ["guidance" in offering ? offering.guidance : undefined]
            : []),
        ]),
      ]),
    ],
  })

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

  const financialContext = await lockCommerceFinancialContext(tx, {
    tenantId: input.tenantId,
    currencyCode: store.currencyCode,
  })
  await lockCatalogCommandInTransaction(tx, input)
  const concurrentPrevious = await readPrevious()
  if (concurrentPrevious) return replay(concurrentPrevious)
  assertFreshOpeningStockPrecision(input)
  const openingEffectiveAt = new Date()
  let hasOpeningStock = false

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
  const selectedCategory = await resolveCatalogCategorySelection(tx, input)
  if (
    selectedCategory.category &&
    selectedCategory.category !== input.category?.trim()
  )
    await assertCatalogPublicationSafety(tx, {
      actorUserId: input.actorUserId,
      mediaUrls: [],
      texts: [selectedCategory.category],
    })
  const item = await tx.catalogItem.create({
    data: {
      ...selectedCategory,
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
  let hasVariantOpeningStockInput = false
  const variantOpeningStocks: Array<{
    quantity: string
    variantId: string
    variantKey: string
  }> = []

  if (input.kind === "product") {
    const product = await tx.catalogProduct.create({
      data: { catalogItemId: item.id, usage: input.usage ?? "FOR_SALE" },
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

  for (const [groupIndex, groupInput] of (input.optionGroups ?? []).entries()) {
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
        description: variantInput.description?.trim() || null,
        imageUrl: variantInput.imageUrl?.trim() || null,
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
    if (
      input.kind === "product" &&
      "openingStockQuantity" in variantInput &&
      variantInput.openingStockQuantity !== undefined
    ) {
      hasVariantOpeningStockInput = true
      variantOpeningStocks.push({
        quantity: parseExactDecimal(variantInput.openingStockQuantity, {
          maxScale: EXACT_QUANTITY_MAX_SCALE,
        }),
        variantId: variant.id,
        variantKey: variantInput.key.trim().toLowerCase(),
      })
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

  if (
    input.kind === "product" &&
    productId &&
    configurationVersionId &&
    canonicalInventoryUnitId &&
    canonicalTransactionScale !== null
  ) {
    const openingStocks = hasVariantOpeningStockInput
      ? variantOpeningStocks
      : input.openingStockQuantity !== undefined && defaultVariantId
        ? [
            {
              quantity: parseExactDecimal(input.openingStockQuantity, {
                maxScale: EXACT_QUANTITY_MAX_SCALE,
              }),
              variantId: defaultVariantId,
              variantKey: "default",
            },
          ]
        : []

    for (const openingStock of openingStocks) {
      if (openingStock.quantity === "0") continue

      const balanceSource = await tx.stockBalanceSource.create({
        data: {
          inventoryUnitId: canonicalInventoryUnitId,
          kind: StockBalanceKind.SHARED_POOL,
          onHandQuantity: openingStock.quantity,
          productId,
          storeId: store.id,
          tenantId: input.tenantId,
          variantId: openingStock.variantId,
        },
      })
      hasOpeningStock = true
      const operation = await tx.stockOperation.create({
        data: {
          actorUserId: input.actorUserId,
          clientOperationId: `${input.clientOperationId}:opening-stock:${openingStock.variantKey}`,
          payloadHash,
          reason: `Initial stock for ${openingStock.variantKey}`,
          source: "catalog_setup",
          storeId: store.id,
          tenantId: input.tenantId,
          type: StockOperationType.OPENING_STOCK,
          effectiveAt: openingEffectiveAt,
        },
      })

      await tx.stockMovement.create({
        data: {
          balanceSourceId: balanceSource.id,
          configurationVersionId,
          enteredInventoryUnitId: canonicalInventoryUnitId,
          enteredQuantity: openingStock.quantity,
          operationId: operation.id,
          previousOnHandQuantity: "0",
          resultingOnHandQuantity: openingStock.quantity,
          signedCanonicalEffect: openingStock.quantity,
          transactionScaleSnapshot: canonicalTransactionScale,
          unitFactorSnapshot: "1",
        },
      })
    }
  }

  if (input.photoAssetIds?.length) {
    await attachCatalogPhotoAssets(tx, {
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      assetIds: input.photoAssetIds,
      catalogItemId: item.id,
    })
  }

  if (input.illustrationId !== undefined) {
    await tx.catalogItemIllustration.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        catalogItemId: item.id,
        illustrationId: input.illustrationId,
      },
    })
  }
  const receipt = await tx.catalogCommandReceipt.create({
    data: {
      catalogItemId: item.id,
      clientOperationId: input.clientOperationId,
      commandType: "CREATE_CATALOG_ITEM",
      payloadHash,
      storeId: store.id,
      tenantId: input.tenantId,
    },
  })

  if (hasOpeningStock && financialContext) {
    try {
      await recordInventoryOpeningValuationInTransaction(tx, {
        tenantId: input.tenantId,
        receiptId: receipt.id,
        expectedBookId: financialContext.bookId,
      })
    } catch (error) {
      if (error instanceof FinanceError)
        throw new CatalogError("INVALID_STOCK_OPERATION", error.message)
      throw error
    }
  }

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
}

export async function createSimpleCatalogItem(
  db: PrismaClient,
  input: CreateSimpleCatalogItemInput,
) {
  return createCatalogItem(db, simpleCatalogItemInput(input))
}

export async function createSimpleCatalogItemInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateSimpleCatalogItemInput,
) {
  return createCatalogItemInTransaction(tx, simpleCatalogItemInput(input))
}

function simpleCatalogItemInput(
  input: CreateSimpleCatalogItemInput,
): CreateCatalogItemInput {
  if (input.kind === "service") {
    return {
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
    }
  }

  const unitName = input.canonicalUnitName.trim()
  const unitKey = slugifyCatalogItem(unitName)

  return {
    actorUserId: input.actorUserId,
    clientOperationId: input.clientOperationId,
    description: input.description,
    kind: "product",
    name: input.name,
    usage: input.usage,
    openingStockQuantity: input.openingStockQuantity,
    storeId: input.storeId,
    tenantId: input.tenantId,
    unitConfiguration: {
      canonicalBalanceScale: EXACT_CANONICAL_MAX_SCALE,
      units: [
        {
          factor: "1",
          key: unitKey,
          name: unitName,
          stockBehavior: "canonical_shared",
          transactionScale: DEFAULT_CATALOG_TRANSACTION_SCALE,
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
  }
}

export async function listCatalogItems(
  db: PrismaClient,
  input: ListCatalogItemsInput,
) {
  const items = await db.catalogItem.findMany({
    include: catalogItemGraphForStores(input.storeIds),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    where: {
      kind: input.kind ? catalogKind(input.kind) : undefined,
      status: input.status ? catalogStatus(input.status) : undefined,
      tenantId: input.tenantId,
    },
  })

  return items.map(serializeCatalogItem)
}

export async function listCatalogItemsPage(
  db: PrismaClient,
  input: ListCatalogItemsPageInput,
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const normalizedQuery = input.query?.trim()
  const normalizedKind = normalizedQuery?.toLowerCase().replace(/s$/, "")
  const baseWhere: Prisma.CatalogItemWhereInput = {
    kind: input.kind ? catalogKind(input.kind) : undefined,
    status: input.status ? catalogStatus(input.status) : undefined,
    tenantId: input.tenantId,
  }
  const where: Prisma.CatalogItemWhereInput = normalizedQuery
    ? {
        ...baseWhere,
        OR: [
          { name: { contains: normalizedQuery, mode: "insensitive" } },
          { slug: { contains: normalizedQuery, mode: "insensitive" } },
          { description: { contains: normalizedQuery, mode: "insensitive" } },
          { category: { contains: normalizedQuery, mode: "insensitive" } },
          ...(normalizedKind === "product"
            ? [{ kind: CatalogItemKind.PRODUCT }]
            : normalizedKind === "service"
              ? [{ kind: CatalogItemKind.SERVICE }]
              : []),
          {
            product: {
              is: {
                currentUnitConfiguration: {
                  is: {
                    units: {
                      some: {
                        OR: [
                          {
                            name: {
                              contains: normalizedQuery,
                              mode: "insensitive",
                            },
                          },
                          {
                            symbol: {
                              contains: normalizedQuery,
                              mode: "insensitive",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          {
            variants: {
              some: {
                OR: [
                  { name: { contains: normalizedQuery, mode: "insensitive" } },
                  {
                    description: {
                      contains: normalizedQuery,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          },
          {
            offerings: {
              some: {
                name: { contains: normalizedQuery, mode: "insensitive" },
              },
            },
          },
        ],
      }
    : baseWhere
  const sortFields: Array<{
    direction: "asc" | "desc"
    field: "name" | "kind" | "status" | "updatedAt"
    queryField: "name" | "kind" | "status" | "updatedAt"
  }> = input.sort
    ? [
        {
          field: input.sort.field,
          direction: input.sort.direction,
          queryField: input.sort.field,
        },
      ]
    : [{ field: "updatedAt", direction: "desc", queryField: "updatedAt" }]
  const cursor = input.cursor
    ? await db.catalogItem.findFirst({
        where: buildScopedListCursorWhere(
          where,
          input.cursor,
        ) as Prisma.CatalogItemWhereInput,
      })
    : null
  if (input.cursor && !cursor) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "The catalog list changed. Refresh to continue.",
    )
  }
  const orderBy = [
    ...sortFields.map(({ queryField, direction }) => ({
      [queryField]: direction,
    })),
    { id: input.sort ? "asc" : "desc" },
  ] as Prisma.CatalogItemOrderByWithRelationInput[]
  const continuationKeys: ListSortKey[] = cursor
    ? [
        ...sortFields.map(({ field, direction }) => ({
          field,
          direction,
          value: cursor[field],
          enumValues:
            field === "kind"
              ? Object.values(CatalogItemKind)
              : field === "status"
                ? Object.values(CatalogRecordStatus)
                : undefined,
        })),
        {
          field: "id",
          direction: input.sort ? "asc" : "desc",
          value: cursor.id,
        },
      ]
    : []
  const [records, totalCount] = await Promise.all([
    db.catalogItem.findMany({
      include: catalogItemGraphForStores(input.storeIds),
      orderBy,
      take: limit + 1,
      where: cursor
        ? (buildScopedListPageWhere(
            where,
            continuationKeys,
          ) as Prisma.CatalogItemWhereInput)
        : where,
    }),
    db.catalogItem.count({ where: baseWhere }),
  ])
  const hasNextPage = records.length > limit
  const pageRecords = hasNextPage ? records.slice(0, limit) : records

  return {
    items: pageRecords.map(serializeCatalogItem),
    nextCursor: hasNextPage ? pageRecords.at(-1)?.id : undefined,
    totalCount,
  }
}

export async function setCatalogOfferingStoreAvailability(
  db: PrismaClient,
  input: {
    actorUserId: string
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

    if (input.isAvailable) {
      await assertExistingCatalogOfferingPublicationSafety(tx, input)
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
