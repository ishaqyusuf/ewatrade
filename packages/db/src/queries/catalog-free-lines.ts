import { randomUUID } from "node:crypto"
import { Prisma } from "../../generated/prisma/client"
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
  catalogFreeLineDescriptionError,
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
  const descriptionError = catalogFreeLineDescriptionError({
    kind: line.custom,
    description,
  })
  if (descriptionError)
    throw new CatalogError("INVALID_ORDER", descriptionError)
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

type CatalogFreeOfferingScope = {
  currencyCode: string
  kind: CatalogFreeLineKind
  storeId: string
  tenantId: string
}

/** The provisioned Offering for one kind, currency and Store, if complete. */
export function catalogFreeOfferingWhere(input: CatalogFreeOfferingScope) {
  return {
    catalogItem: { systemRole: roleByKind[input.kind] },
    key: `default-${input.currencyCode.toLowerCase()}`,
    serviceOffering: { isNot: null },
    storeAvailability: { some: { storeId: input.storeId } },
    tenantId: input.tenantId,
  } satisfies Prisma.SellableOfferingWhereInput
}

/** Idempotently provisions the hidden item, its currency Offering and Store availability. */
export async function ensureCatalogFreeOfferingInTransaction(
  tx: Prisma.TransactionClient,
  input: CatalogFreeOfferingScope,
) {
  const existing = await tx.sellableOffering.findFirst({
    select: { id: true },
    where: catalogFreeOfferingWhere(input),
  })
  if (existing) return existing.id
  return provisionCatalogFreeOfferingInTransaction(tx, input)
}

/**
 * Creates whatever is missing of the hidden item graph in one statement.
 * First use used to cost six sequential upserts inside the Order transaction,
 * which over a remote database alone took seconds of its 30s budget. Each
 * insert is a native upsert on its unique key, so this stays idempotent and
 * concurrent first uses wait on the same keys instead of duplicating rows.
 * DO UPDATE (not DO NOTHING) returns rows another transaction committed.
 */
export async function provisionCatalogFreeOfferingInTransaction(
  tx: Prisma.TransactionClient,
  input: CatalogFreeOfferingScope,
) {
  const role = roleByKind[input.kind]
  const label = CATALOG_FREE_LINE_LABELS[input.kind]
  const key = `default-${input.currencyCode.toLowerCase()}`
  const slug = `system-${input.kind.replace("_", "-")}`
  const [offering] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH item AS (
      INSERT INTO "CatalogItem" ("id", "tenantId", "slug", "kind", "status", "name", "systemRole", "updatedAt")
      VALUES (${randomUUID()}, ${input.tenantId}, ${slug}, ${CatalogItemKind.SERVICE}::"CatalogItemKind",
        ${CatalogRecordStatus.ACTIVE}::"CatalogRecordStatus", ${label}, ${role}::"CatalogSystemRole", NOW())
      ON CONFLICT ("tenantId", "systemRole") DO UPDATE SET "systemRole" = EXCLUDED."systemRole"
      RETURNING "id"
    ), service AS (
      INSERT INTO "CatalogService" ("id", "catalogItemId", "updatedAt")
      SELECT ${randomUUID()}, item."id", NOW() FROM item
      ON CONFLICT ("catalogItemId") DO NOTHING
    ), variant AS (
      INSERT INTO "SellableVariant" ("id", "catalogItemId", "key", "name", "status", "isDefault", "updatedAt")
      SELECT ${randomUUID()}, item."id", 'default', 'Default',
        ${CatalogRecordStatus.ACTIVE}::"CatalogRecordStatus", true, NOW() FROM item
      ON CONFLICT ("catalogItemId", "key") DO UPDATE SET "key" = EXCLUDED."key"
      RETURNING "id", "catalogItemId"
    ), offering AS (
      INSERT INTO "SellableOffering" ("id", "tenantId", "catalogItemId", "variantId", "key", "kind", "status",
        "name", "pricingPolicy", "currencyCode", "updatedAt")
      SELECT ${randomUUID()}, ${input.tenantId}, variant."catalogItemId", variant."id", ${key},
        ${SellableOfferingKind.SERVICE}::"SellableOfferingKind",
        ${CatalogRecordStatus.ACTIVE}::"CatalogRecordStatus", ${label},
        ${OfferingPricingPolicy.ORDER_TOTAL}::"OfferingPricingPolicy", ${input.currencyCode}, NOW()
      FROM variant
      ON CONFLICT ("catalogItemId", "key") DO UPDATE SET "key" = EXCLUDED."key"
      RETURNING "id"
    ), service_offering AS (
      INSERT INTO "ServiceOffering" ("id", "offeringId", "workPolicy", "authorizationPolicy", "updatedAt")
      SELECT ${randomUUID()}, offering."id", ${ServiceWorkPolicy.CHARGE_ONLY}::"ServiceWorkPolicy",
        ${WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION}::"WorkAuthorizationPolicy", NOW()
      FROM offering
      ON CONFLICT ("offeringId") DO NOTHING
    ), availability AS (
      INSERT INTO "StoreOfferingAvailability" ("id", "storeId", "offeringId", "isAvailable", "updatedAt")
      SELECT ${randomUUID()}, ${input.storeId}, offering."id", true, NOW() FROM offering
      ON CONFLICT ("storeId", "offeringId") DO NOTHING
    )
    SELECT "id" FROM offering
  `)
  if (!offering)
    throw new CatalogError(
      "INVALID_ORDER",
      `${label} could not be prepared for this Store.`,
    )
  return offering.id
}
