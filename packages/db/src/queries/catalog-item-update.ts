import { createHash } from "node:crypto"
import { type ProductUsage, productUsages } from "@ewatrade/utils/product-usage"
import type { Prisma } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  OfferingPricingPolicy,
  SellableOfferingKind,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
} from "../../generated/prisma/enums"
import {
  archiveCatalogVariantInTransaction,
  assertCatalogPublicationSafety,
  stableJson,
} from "./catalog"
import { resolveCatalogCategorySelection } from "./catalog-categories"
import { lockCatalogCommandInTransaction } from "./catalog-command-locks"
import { CatalogError } from "./catalog-errors"
import {
  type PlannedOptionGroup,
  type RequestedUnit,
  type StockBehaviorValue,
  matchOfferings,
  matchVariants,
  nextCatalogKey,
  planOptionGroups,
  planUnits,
} from "./catalog-item-update-plan"
import type { CatalogPhotoActorScope } from "./catalog-photos"
import { catalogItemGraph, serializeCatalogItem } from "./catalog-read"
import {
  createProductUnitConfigurationDraftInTransaction,
  publishProductUnitConfigurationInTransaction,
  updateProductUnitConfigurationDraftInTransaction,
} from "./catalog-unit-configurations"

export type UpdateCatalogOfferingInput = {
  /** Product only: index into `units`, where 0 is the main unit. */
  unitIndex?: number
  pricingPolicy: "fixed" | "order_total" | "quote_required"
  fixedPriceMinor?: number
  enabled?: boolean
  sku?: string
  barcode?: string
  storeAvailability?: Array<{ storeId: string; isAvailable: boolean }>
  authorizationPolicy?:
    | "after_required_payment"
    | "manual_release"
    | "on_order_confirmation"
  guidance?: string
  quantityScale?: number
  workPolicy?: "charge_only" | "tracked"
}

export type UpdateCatalogItemInput = CatalogPhotoActorScope & {
  clientOperationId: string
  itemId: string
  expectedUpdatedAt: Date
  kind: "product" | "service"
  name: string
  description?: string
  category?: string
  categoryId?: string
  subcategoryId?: string
  usage?: ProductUsage
  /** Recorded on every price change this edit makes. */
  priceChangeReason?: string
  optionGroups: PlannedOptionGroup[]
  /** Product only, main unit first. */
  units?: RequestedUnit[]
  variants: Array<{
    /** One value label per option group, in group order. */
    selections: string[]
    enabled: boolean
    isDefault: boolean
    offerings: UpdateCatalogOfferingInput[]
  }>
}

const DEFAULT_PRICE_REASON = "Edited in catalog"

function pricingPolicy(policy: UpdateCatalogOfferingInput["pricingPolicy"]) {
  if (policy === "order_total") return OfferingPricingPolicy.ORDER_TOTAL
  return policy === "fixed"
    ? OfferingPricingPolicy.FIXED
    : OfferingPricingPolicy.QUOTE_REQUIRED
}

function workPolicy(offering: UpdateCatalogOfferingInput) {
  return offering.workPolicy === "tracked"
    ? ServiceWorkPolicy.TRACKED
    : ServiceWorkPolicy.CHARGE_ONLY
}

function authorizationPolicy(offering: UpdateCatalogOfferingInput) {
  if (offering.authorizationPolicy === "after_required_payment")
    return WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT
  return offering.authorizationPolicy === "manual_release"
    ? WorkAuthorizationPolicy.MANUAL_RELEASE
    : WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION
}

function fixedPrice(offering: UpdateCatalogOfferingInput) {
  return offering.pricingPolicy === "fixed"
    ? (offering.fixedPriceMinor ?? null)
    : null
}

function assertRequest(input: UpdateCatalogItemInput) {
  if (!input.name.trim())
    throw new CatalogError("INVALID_CATALOG_ITEM", "Enter an item name.")
  if (input.usage !== undefined && !productUsages.includes(input.usage))
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Choose a valid Product usage.",
    )
  if (input.variants.length === 0 || input.variants.length > 96)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Keep the item within 96 option combinations. Remove a group or some values.",
    )
  if (input.variants.filter((variant) => variant.isDefault).length !== 1)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Every Catalog Item requires exactly one default Sellable Variant.",
    )
  if (!input.variants.some((variant) => variant.enabled))
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Keep at least one variant enabled.",
    )
  const unitCount = input.units?.length ?? 0
  if (input.kind === "product" && unitCount === 0)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Enter the Product's main unit.",
    )
  for (const variant of input.variants) {
    if (variant.selections.length !== input.optionGroups.length)
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        "Every customer choice must select one value from every option.",
      )
    if (input.kind === "service" && variant.offerings.length !== 1)
      throw new CatalogError(
        "INVALID_OFFERING",
        "Each Service choice has exactly one Offering.",
      )
    for (const offering of variant.offerings) {
      if (input.kind === "product") {
        if (
          offering.unitIndex === undefined ||
          offering.unitIndex < 0 ||
          offering.unitIndex >= unitCount
        )
          throw new CatalogError(
            "INVALID_OFFERING",
            "An Offering references an unknown selling unit.",
          )
        if (offering.pricingPolicy === "quote_required")
          throw new CatalogError(
            "INVALID_OFFERING",
            "Product Unit Offerings require fixed pricing.",
          )
      } else if (offering.pricingPolicy === "order_total")
        throw new CatalogError(
          "INVALID_OFFERING",
          "Order-time-total pricing requires a Product Offering.",
        )
      if (
        offering.pricingPolicy !== "fixed" &&
        offering.fixedPriceMinor !== undefined
      )
        throw new CatalogError(
          "INVALID_OFFERING",
          "Only fixed-price Offerings can carry a saved price.",
        )
      if (
        input.kind === "service" &&
        offering.pricingPolicy === "fixed" &&
        offering.fixedPriceMinor === undefined
      )
        throw new CatalogError(
          "INVALID_OFFERING",
          "Enter a price for every fixed-price Service.",
        )
    }
  }
}

async function readItem(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogItemInput,
) {
  const item = await tx.catalogItem.findFirst({
    include: catalogItemGraph,
    where: {
      id: input.itemId,
      tenantId: input.tenantId,
      systemRole: null,
      status: { not: CatalogRecordStatus.ARCHIVED },
    },
  })
  if (!item)
    throw new CatalogError("CATALOG_ITEM_NOT_FOUND", "Catalog Item not found.")
  return item
}

function hasStock(balance: {
  onHandQuantity: Prisma.Decimal | string | number
  reservedQuantity: Prisma.Decimal | string | number
}) {
  return (
    Number(balance.onHandQuantity) !== 0 ||
    Number(balance.reservedQuantity) !== 0
  )
}

/**
 * Applies a whole-form edit of a saved Catalog Item in the caller's
 * transaction. Rows with history are archived, never deleted; changes that
 * would strand stock are refused with a reason the owner can act on.
 */
export async function updateCatalogItemInTransaction(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogItemInput,
) {
  try {
    return await applyCatalogItemUpdate(tx, input)
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2002" &&
      /sku|barcode/i.test(
        JSON.stringify((error as { meta?: unknown }).meta ?? ""),
      )
    )
      throw new CatalogError(
        "DUPLICATE_CATALOG_KEY",
        "That SKU or barcode is already used by another item.",
      )
    throw error
  }
}

/** Archived offerings give up their codes so a live offering can reuse them. */
async function releaseOfferingCodes(
  tx: Prisma.TransactionClient,
  input: { variantId?: string; offeringIds?: string[] },
) {
  await tx.productUnitOffering.updateMany({
    where: input.variantId
      ? { offering: { variantId: input.variantId } }
      : { offeringId: { in: input.offeringIds ?? [] } },
    data: { barcode: null, sku: null },
  })
}

async function applyCatalogItemUpdate(
  tx: Prisma.TransactionClient,
  input: UpdateCatalogItemInput,
) {
  assertRequest(input)
  const { actorUserId: _actor, expectedUpdatedAt, ...hashed } = input
  const payloadHash = createHash("sha256")
    .update(
      stableJson({
        ...hashed,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
      }),
    )
    .digest("hex")

  await lockCatalogCommandInTransaction(tx, input)
  const previous = await tx.catalogCommandReceipt.findUnique({
    where: {
      tenantId_clientOperationId: {
        clientOperationId: input.clientOperationId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    if (
      previous.payloadHash !== payloadHash ||
      previous.commandType !== "UPDATE_CATALOG_ITEM" ||
      previous.catalogItemId !== input.itemId
    )
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This client operation identity was already used with different input.",
      )
    return serializeCatalogItem(await readItem(tx, input))
  }

  await tx.$queryRaw`SELECT id FROM "CatalogItem" WHERE id = ${input.itemId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  let item = await readItem(tx, input)
  if ((item.kind === "PRODUCT") !== (input.kind === "product"))
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "A saved item cannot change between Product and Service.",
    )
  if (item.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This item changed since you opened it. Reopen it to see the latest version.",
    )

  await assertCatalogPublicationSafety(tx, {
    actorUserId: input.actorUserId,
    mediaUrls: [],
    texts: [
      input.name,
      input.category,
      input.description,
      ...input.optionGroups.flatMap((group) => [group.name, ...group.values]),
      ...(input.units ?? []).map((unit) => unit.name),
      ...input.variants.flatMap((variant) =>
        variant.offerings.map((offering) => offering.guidance),
      ),
    ],
  })

  // Item details and Product usage.
  const category = await resolveCatalogCategorySelection(tx, input)
  await tx.catalogItem.update({
    where: { id: item.id },
    data: {
      ...category,
      description: input.description?.trim() || null,
      name: input.name.trim(),
    },
  })
  if (
    input.kind === "product" &&
    input.usage &&
    item.product?.usage !== input.usage
  ) {
    const manager = await tx.membership.findFirst({
      where: {
        tenantId: input.tenantId,
        userId: input.actorUserId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
        tenant: { isActive: true },
      },
      select: { id: true },
    })
    if (!manager)
      throw new CatalogError(
        "FORBIDDEN",
        "Only Owners and Admins can change Product usage.",
      )
    // Order creation holds FOR SHARE on the product; this waits for those orders.
    await tx.$queryRaw`SELECT id FROM "CatalogProduct" WHERE "catalogItemId" = ${item.id} FOR UPDATE`
    await tx.catalogProduct.update({
      where: { catalogItemId: item.id },
      data: { usage: input.usage },
    })
  }

  // Option groups and values: rename and add now, delete after archiving variants.
  const groupPlan = planOptionGroups(
    item.optionGroups.map((group) => ({
      id: group.id,
      key: group.key,
      name: group.name,
      values: group.values.map((value) => ({
        id: value.id,
        key: value.key,
        label: value.label,
      })),
    })),
    input.optionGroups,
  )
  const valueIdsByGroup: Array<Map<string, string>> = []
  const groupIdByValueId = new Map<string, string>()
  for (const [groupIndex, group] of groupPlan.groups.entries()) {
    const groupId = group.id
      ? (
          await tx.variantOptionGroup.update({
            where: { id: group.id },
            data: { name: group.name, sortOrder: groupIndex },
          })
        ).id
      : (
          await tx.variantOptionGroup.create({
            data: {
              catalogItemId: item.id,
              key: group.key,
              name: group.name,
              sortOrder: groupIndex,
            },
          })
        ).id
    const labels = new Map<string, string>()
    for (const [valueIndex, value] of group.values.entries()) {
      const valueId = value.id
        ? (
            await tx.variantOptionValue.update({
              where: { id: value.id },
              data: { label: value.label, sortOrder: valueIndex },
            })
          ).id
        : (
            await tx.variantOptionValue.create({
              data: {
                groupId,
                key: value.key,
                label: value.label,
                sortOrder: valueIndex,
              },
            })
          ).id
      labels.set(value.label.trim().toLowerCase(), valueId)
      groupIdByValueId.set(valueId, groupId)
    }
    valueIdsByGroup.push(labels)
  }
  const requestedValueIds = input.variants.map((variant) =>
    variant.selections.map((label, groupIndex) => {
      const valueId = valueIdsByGroup[groupIndex]?.get(
        label.trim().toLowerCase(),
      )
      if (!valueId)
        throw new CatalogError(
          "INVALID_CATALOG_ITEM",
          `${label} is not a value of ${input.optionGroups[groupIndex]?.name ?? "this option"}.`,
        )
      return valueId
    }),
  )

  // Variants: match by selected values; archive the rest when no stock is stranded.
  const liveVariants = item.variants.filter(
    (variant) => variant.status !== CatalogRecordStatus.ARCHIVED,
  )
  const variantMatch = matchVariants(
    liveVariants.map((variant) => ({
      id: variant.id,
      key: variant.key,
      valueIds: variant.selections.map((selection) => selection.valueId),
    })),
    requestedValueIds,
  )
  const balances = item.product?.stockBalanceSources ?? []
  for (const variantId of variantMatch.archiveIds) {
    if (
      balances.some(
        (balance) => balance.variantId === variantId && hasStock(balance),
      )
    ) {
      const name = liveVariants.find(
        (variant) => variant.id === variantId,
      )?.name
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        `${name ?? "A removed choice"} still has stock. Clear its stock in Inventory before removing it.`,
      )
    }
    await archiveCatalogVariantInTransaction(tx, {
      tenantId: input.tenantId,
      variantId,
    })
    await releaseOfferingCodes(tx, { variantId })
  }
  if (groupPlan.deleteValueIds.length)
    await tx.variantOptionValue.deleteMany({
      where: { id: { in: groupPlan.deleteValueIds } },
    })
  if (groupPlan.deleteGroupIds.length)
    await tx.variantOptionGroup.deleteMany({
      where: { id: { in: groupPlan.deleteGroupIds }, catalogItemId: item.id },
    })

  // Units: rename in place, or publish a new configuration when stock allows.
  let unitKeys: string[] = []
  if (input.kind === "product" && item.product) {
    const current = item.product.currentUnitConfiguration
    if (!current)
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "The Product has no current unit configuration.",
      )
    const unitPlan = planUnits(
      current.units.map((unit) => ({
        id: unit.id,
        key: unit.key,
        name: unit.name,
        factor: unit.factor.toString(),
        stockBehavior: unit.stockBehavior.toLowerCase() as StockBehaviorValue,
        transactionScale: unit.transactionScale,
        symbol: unit.symbol,
      })),
      input.units ?? [],
    )
    unitKeys = unitPlan.keys
    if (unitPlan.mode === "rename")
      for (const rename of unitPlan.renames)
        await tx.inventoryUnit.update({
          where: { id: rename.id },
          data: { name: rename.name },
        })
    if (unitPlan.mode === "republish") {
      if (balances.some(hasStock))
        throw new CatalogError(
          "INVALID_UNIT_CONFIGURATION",
          "Selling units can't be added, removed or resized while this Product has stock. Rename them, or clear its stock in Inventory first.",
        )
      const keptKeys = new Set(unitPlan.keys)
      const droppedUnitIds = current.units
        .filter((unit) => !keptKeys.has(unit.key))
        .map((unit) => unit.id)
      if (droppedUnitIds.length) {
        await tx.productUnitOffering.updateMany({
          where: {
            inventoryUnitId: { in: droppedUnitIds },
            offering: { status: { not: CatalogRecordStatus.ARCHIVED } },
          },
          data: { barcode: null, sku: null },
        })
        await tx.sellableOffering.updateMany({
          where: {
            catalogItemId: item.id,
            status: { not: CatalogRecordStatus.ARCHIVED },
            productUnitOffering: { inventoryUnitId: { in: droppedUnitIds } },
          },
          data: {
            status: CatalogRecordStatus.ARCHIVED,
            archivedAt: new Date(),
          },
        })
      }
      const draft = await createProductUnitConfigurationDraftInTransaction(tx, {
        productId: item.product.id,
        tenantId: input.tenantId,
      })
      await updateProductUnitConfigurationDraftInTransaction(tx, {
        canonicalBalanceScale: current.canonicalBalanceScale,
        configurationId: draft.id,
        tenantId: input.tenantId,
        units: unitPlan.units,
      })
      await publishProductUnitConfigurationInTransaction(tx, {
        actorUserId: input.actorUserId,
        configurationId: draft.id,
        tenantId: input.tenantId,
      })
    }
    item = await readItem(tx, input)
  }

  // Variants and their Offerings.
  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId },
    select: { currencyCode: true, id: true },
  })
  if (!store)
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  const currentUnits = item.product?.currentUnitConfiguration?.units ?? []
  const unitIdByKey = new Map(currentUnits.map((unit) => [unit.key, unit.id]))
  const unitNameByKey = new Map(
    currentUnits.map((unit) => [unit.key, unit.name]),
  )
  const usedVariantKeys = new Set(item.variants.map((variant) => variant.key))
  const usedOfferingKeys = new Set(
    item.variants.flatMap((variant) =>
      variant.offerings.map((offering) => offering.key),
    ),
  )
  const reason = input.priceChangeReason?.trim() || DEFAULT_PRICE_REASON
  const hasOptions = input.optionGroups.length > 0

  for (const [variantIndex, requested] of input.variants.entries()) {
    const variantName = hasOptions
      ? requested.selections.map((label) => label.trim()).join(" / ")
      : input.name.trim()
    const status = requested.enabled
      ? CatalogRecordStatus.ACTIVE
      : CatalogRecordStatus.DRAFT
    const savedId = variantMatch.matches[variantIndex]
    const variantId = savedId
      ? (
          await tx.sellableVariant.update({
            where: { id: savedId },
            data: {
              isDefault: requested.isDefault,
              name: variantName,
              sortOrder: variantIndex,
              status,
            },
          })
        ).id
      : (
          await tx.sellableVariant.create({
            data: {
              catalogItemId: item.id,
              isDefault: requested.isDefault,
              key: nextCatalogKey("variant", usedVariantKeys),
              name: variantName,
              sortOrder: variantIndex,
              status,
              selections: {
                create: (requestedValueIds[variantIndex] ?? []).map(
                  (valueId) => ({
                    valueId,
                    groupId: groupIdByValueId.get(valueId) ?? "",
                  }),
                ),
              },
            },
          })
        ).id

    const savedOfferings = (
      item.variants.find((variant) => variant.id === variantId)?.offerings ?? []
    ).filter((offering) => offering.status !== CatalogRecordStatus.ARCHIVED)
    const offeringMatch = matchOfferings(
      savedOfferings.map((offering) => ({
        id: offering.id,
        unitKey: offering.productUnitOffering?.inventoryUnit.key ?? null,
      })),
      requested.offerings.map((offering) => ({
        ...offering,
        unitKey:
          input.kind === "product"
            ? (unitKeys[offering.unitIndex ?? 0] ?? null)
            : null,
      })),
    )

    const offeringName = (unitKey: string | null) =>
      unitKey && unitKey !== unitKeys[0]
        ? `${variantName} · ${unitNameByKey.get(unitKey) ?? unitKey}`
        : variantName
    const offeringStatus = (offering: UpdateCatalogOfferingInput) =>
      requested.enabled && offering.enabled !== false
        ? CatalogRecordStatus.ACTIVE
        : CatalogRecordStatus.DRAFT
    const availability = (offering: UpdateCatalogOfferingInput) =>
      offering.storeAvailability?.length
        ? offering.storeAvailability
        : [{ isAvailable: true, storeId: store.id }]

    if (offeringMatch.archiveIds.length) {
      await tx.sellableOffering.updateMany({
        where: { id: { in: offeringMatch.archiveIds } },
        data: { status: CatalogRecordStatus.ARCHIVED, archivedAt: new Date() },
      })
      await releaseOfferingCodes(tx, { offeringIds: offeringMatch.archiveIds })
    }

    for (const { id, requested: offering } of offeringMatch.update) {
      const saved = savedOfferings.find((candidate) => candidate.id === id)
      if (!saved) continue
      const nextPrice = fixedPrice(offering)
      await tx.sellableOffering.update({
        where: { id },
        data: {
          fixedPriceMinor: nextPrice,
          name: offeringName(offering.unitKey),
          pricingPolicy: pricingPolicy(offering.pricingPolicy),
          revision: { increment: 1 },
          sortOrder: offering.unitIndex ?? 0,
          status: offeringStatus(offering),
        },
      })
      if (nextPrice !== null && nextPrice !== saved.fixedPriceMinor)
        await tx.catalogPriceChange.create({
          data: {
            changedByUserId: input.actorUserId,
            currencyCode: saved.currencyCode,
            offeringId: id,
            previousPriceMinor: saved.fixedPriceMinor,
            priceMinor: nextPrice,
            reason,
            tenantId: input.tenantId,
          },
        })
      if (saved.productUnitOffering)
        await tx.productUnitOffering.update({
          where: { offeringId: id },
          data: {
            barcode: offering.barcode?.trim() || null,
            sku: offering.sku?.trim() || null,
          },
        })
      if (saved.serviceOffering)
        await tx.serviceOffering.update({
          where: { offeringId: id },
          data: {
            authorizationPolicy: authorizationPolicy(offering),
            guidance: offering.guidance?.trim() || null,
            quantityScale:
              offering.quantityScale ?? saved.serviceOffering.quantityScale,
            workPolicy: workPolicy(offering),
          },
        })
      for (const entry of availability(offering))
        await tx.storeOfferingAvailability.upsert({
          where: {
            storeId_offeringId: { storeId: entry.storeId, offeringId: id },
          },
          create: { ...entry, offeringId: id },
          update: { isAvailable: entry.isAvailable },
        })
    }

    for (const { requested: offering } of offeringMatch.create) {
      const created = await tx.sellableOffering.create({
        data: {
          catalogItemId: item.id,
          currencyCode: store.currencyCode,
          fixedPriceMinor: fixedPrice(offering),
          key: nextCatalogKey("offering", usedOfferingKeys),
          kind:
            input.kind === "product"
              ? SellableOfferingKind.PRODUCT_UNIT
              : SellableOfferingKind.SERVICE,
          name: offeringName(offering.unitKey),
          pricingPolicy: pricingPolicy(offering.pricingPolicy),
          sortOrder: offering.unitIndex ?? 0,
          status: offeringStatus(offering),
          tenantId: input.tenantId,
          variantId,
        },
      })
      if (input.kind === "product") {
        const inventoryUnitId = offering.unitKey
          ? unitIdByKey.get(offering.unitKey)
          : undefined
        if (!inventoryUnitId)
          throw new CatalogError(
            "INVALID_OFFERING",
            "An Offering references an unknown selling unit.",
          )
        await tx.productUnitOffering.create({
          data: {
            barcode: offering.barcode?.trim() || null,
            inventoryUnitId,
            offeringId: created.id,
            sku: offering.sku?.trim() || null,
            tenantId: input.tenantId,
          },
        })
      } else
        await tx.serviceOffering.create({
          data: {
            authorizationPolicy: authorizationPolicy(offering),
            guidance: offering.guidance?.trim() || null,
            offeringId: created.id,
            quantityScale: offering.quantityScale ?? 0,
            workPolicy: workPolicy(offering),
          },
        })
      await tx.storeOfferingAvailability.createMany({
        data: availability(offering).map((entry) => ({
          ...entry,
          offeringId: created.id,
        })),
      })
      if (created.fixedPriceMinor !== null)
        await tx.catalogPriceChange.create({
          data: {
            changedByUserId: input.actorUserId,
            currencyCode: store.currencyCode,
            offeringId: created.id,
            priceMinor: created.fixedPriceMinor,
            reason: "Initial price",
            tenantId: input.tenantId,
          },
        })
    }
  }

  // Every edit moves the concurrency token forward, even within one millisecond.
  await tx.catalogItem.update({
    where: { id: item.id },
    data: {
      updatedAt: new Date(
        Math.max(Date.now(), expectedUpdatedAt.getTime() + 1),
      ),
    },
  })
  await tx.catalogCommandReceipt.create({
    data: {
      catalogItemId: item.id,
      clientOperationId: input.clientOperationId,
      commandType: "UPDATE_CATALOG_ITEM",
      payloadHash,
      storeId: store.id,
      tenantId: input.tenantId,
    },
  })
  return serializeCatalogItem(await readItem(tx, input))
}
