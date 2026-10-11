import type { Prisma } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
  CatalogSystemRole,
  OfferingPricingPolicy,
  SellableOfferingKind,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog-errors"

import {
  CATALOG_FREE_DESCRIPTION_MAX_LENGTH,
  CATALOG_FREE_LINE_LABELS,
  CATALOG_FREE_NO_DESCRIPTION,
  type CatalogFreeLineKind,
  catalogFreeLineKinds,
} from "@ewatrade/utils/catalog-free-lines"

/**
 * Catalog-free Order lines let a business record sales before it has a
 * Catalog. Each kind is backed by one hidden, built-in charge-only Service
 * item per Tenant so stock, finance and reporting keep their Offering joins.
 */
export {
  CATALOG_FREE_DESCRIPTION_MAX_LENGTH,
  CATALOG_FREE_LINE_LABELS,
  CATALOG_FREE_NO_DESCRIPTION,
  type CatalogFreeLineKind,
  catalogFreeLineKinds,
}

export type CommercialOrderCustomLineInput = {
  custom: CatalogFreeLineKind
  description?: string
  amountMinor: number
}

const roleByKind: Record<CatalogFreeLineKind, CatalogSystemRole> = {
  additional_cost: CatalogSystemRole.ADDITIONAL_COST,
  quick_sale: CatalogSystemRole.QUICK_SALE,
}

export function catalogFreeLineKindForRole(
  role: CatalogSystemRole | string | null | undefined,
): CatalogFreeLineKind | null {
  if (role === CatalogSystemRole.QUICK_SALE) return "quick_sale"
  if (role === CatalogSystemRole.ADDITIONAL_COST) return "additional_cost"
  return null
}

export function catalogFreeSystemRole(kind: CatalogFreeLineKind) {
  return roleByKind[kind]
}

export function isCustomOrderLineInput(
  line: object,
): line is CommercialOrderCustomLineInput {
  return "custom" in line
}

export function normalizeCatalogFreeLine(line: CommercialOrderCustomLineInput) {
  if (!catalogFreeLineKinds.includes(line.custom)) {
    throw new CatalogError("INVALID_ORDER", "Choose a valid custom line.")
  }
  if (
    !Number.isSafeInteger(line.amountMinor) ||
    line.amountMinor <= 0 ||
    line.amountMinor > 100_000_000
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      `${CATALOG_FREE_LINE_LABELS[line.custom]} needs an amount above zero.`,
    )
  }
  const description = line.description?.trim() || null
  if (description && description.length > CATALOG_FREE_DESCRIPTION_MAX_LENGTH) {
    throw new CatalogError(
      "INVALID_ORDER",
      `Descriptions must be at most ${CATALOG_FREE_DESCRIPTION_MAX_LENGTH} characters.`,
    )
  }
  return { amountMinor: line.amountMinor, description, kind: line.custom }
}

/** Snapshot names stay readable on receipts, reports and older clients. */
export function catalogFreeSnapshotNames(
  kind: CatalogFreeLineKind,
  description: string | null,
) {
  const label = CATALOG_FREE_LINE_LABELS[kind]
  if (kind === "quick_sale") {
    return {
      catalogItemName: description ?? label,
      offeringName: label,
      variantName: "Default",
    }
  }
  return {
    catalogItemName: label,
    offeringName: description ?? CATALOG_FREE_NO_DESCRIPTION,
    variantName: description ?? CATALOG_FREE_NO_DESCRIPTION,
  }
}

/** Idempotently provisions the hidden item, its currency Offering and Store availability. */
export async function ensureCatalogFreeOfferingInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    currencyCode: string
    kind: CatalogFreeLineKind
    storeId: string
    tenantId: string
  },
) {
  const role = roleByKind[input.kind]
  const label = CATALOG_FREE_LINE_LABELS[input.kind]
  const key = `default-${input.currencyCode.toLowerCase()}`
  const existing = await tx.sellableOffering.findFirst({
    select: { id: true },
    where: {
      catalogItem: { systemRole: role },
      key,
      serviceOffering: { isNot: null },
      storeAvailability: { some: { storeId: input.storeId } },
      tenantId: input.tenantId,
    },
  })
  if (existing) return existing.id

  const item = await tx.catalogItem.upsert({
    create: {
      kind: CatalogItemKind.SERVICE,
      name: label,
      slug: `system-${input.kind.replace("_", "-")}`,
      status: CatalogRecordStatus.ACTIVE,
      systemRole: role,
      tenantId: input.tenantId,
    },
    select: { id: true },
    update: {},
    where: {
      tenantId_systemRole: { systemRole: role, tenantId: input.tenantId },
    },
  })
  await tx.catalogService.upsert({
    create: { catalogItemId: item.id },
    update: {},
    where: { catalogItemId: item.id },
  })
  const variant = await tx.sellableVariant.upsert({
    create: {
      catalogItemId: item.id,
      isDefault: true,
      key: "default",
      name: "Default",
      status: CatalogRecordStatus.ACTIVE,
    },
    select: { id: true },
    update: {},
    where: { catalogItemId_key: { catalogItemId: item.id, key: "default" } },
  })
  const offering = await tx.sellableOffering.upsert({
    create: {
      catalogItemId: item.id,
      currencyCode: input.currencyCode,
      key,
      kind: SellableOfferingKind.SERVICE,
      name: label,
      pricingPolicy: OfferingPricingPolicy.ORDER_TOTAL,
      status: CatalogRecordStatus.ACTIVE,
      tenantId: input.tenantId,
      variantId: variant.id,
    },
    select: { id: true },
    update: {},
    where: { catalogItemId_key: { catalogItemId: item.id, key } },
  })
  await tx.serviceOffering.upsert({
    create: {
      authorizationPolicy: WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION,
      offeringId: offering.id,
      workPolicy: ServiceWorkPolicy.CHARGE_ONLY,
    },
    update: {},
    where: { offeringId: offering.id },
  })
  await tx.storeOfferingAvailability.upsert({
    create: {
      isAvailable: true,
      offeringId: offering.id,
      storeId: input.storeId,
    },
    update: {},
    where: {
      storeId_offeringId: { offeringId: offering.id, storeId: input.storeId },
    },
  })
  return offering.id
}
