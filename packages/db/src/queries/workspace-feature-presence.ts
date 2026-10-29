import { Prisma } from "../../generated/prisma/client"

export type WorkspaceFeaturePresenceFacts = {
  hasProductItems: boolean
  hasServiceItems: boolean
  hasActiveSellableItems: boolean
  hasOrders: boolean
  hasServiceJobs: boolean
  hasCustomers: boolean
  hasStaff: boolean
  hasInventoryActivity: boolean
  hasPrescriptionCommerce: boolean
}

/** One current snapshot of presence only; existing admission owns the scope. */
export function workspaceFeaturePresenceQuery(input: {
  storeId: string
  tenantId: string
}) {
  const catalogKind = (kind: "PRODUCT" | "SERVICE") => Prisma.sql`
    EXISTS (
      SELECT 1 FROM "CatalogItem" c
      WHERE c."tenantId" = ${input.tenantId} AND c."systemRole" IS NULL
        AND c."kind" = ${kind}::"CatalogItemKind"
        AND EXISTS (
          SELECT 1 FROM "SellableOffering" o
          JOIN "StoreOfferingAvailability" a ON a."offeringId" = o."id"
          WHERE o."catalogItemId" = c."id" AND a."storeId" = ${input.storeId}
        )
    )`
  return Prisma.sql`
    SELECT
      ${catalogKind("PRODUCT")} AS "hasProductItems",
      ${catalogKind("SERVICE")} AS "hasServiceItems",
      EXISTS (
        SELECT 1 FROM "CatalogItem" c
        WHERE c."tenantId" = ${input.tenantId} AND c."systemRole" IS NULL
          AND c."status" = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM "SellableOffering" o
            JOIN "SellableVariant" v ON v."id" = o."variantId"
            JOIN "StoreOfferingAvailability" a ON a."offeringId" = o."id"
            WHERE o."catalogItemId" = c."id" AND o."status" = 'ACTIVE'
              AND o."pricingPolicy" = 'FIXED' AND o."fixedPriceMinor" IS NOT NULL
              AND v."status" = 'ACTIVE' AND a."isAvailable" = true
              AND a."storeId" = ${input.storeId}
          )
      ) AS "hasActiveSellableItems",
      EXISTS (
        SELECT 1 FROM "CommercialOrder" o
        WHERE o."tenantId" = ${input.tenantId} AND o."storeId" = ${input.storeId}
      ) AS "hasOrders",
      EXISTS (
        SELECT 1 FROM "ServiceJob" j
        WHERE j."tenantId" = ${input.tenantId} AND j."storeId" = ${input.storeId}
      ) AS "hasServiceJobs",
      (EXISTS (
        SELECT 1 FROM "Customer" c WHERE c."tenantId" = ${input.tenantId}
      ) OR EXISTS (
        SELECT 1 FROM "CommercialOrder" o
        WHERE o."tenantId" = ${input.tenantId} AND o."storeId" = ${input.storeId}
          AND (o."customerEmail" IS NOT NULL OR o."customerName" IS NOT NULL
            OR o."customerPhone" IS NOT NULL)
      )) AS "hasCustomers",
      EXISTS (
        SELECT 1 FROM "Membership" m WHERE m."tenantId" = ${input.tenantId}
          AND m."role" IN ('ADMIN', 'MANAGER', 'CASHIER', 'OPERATOR')
      ) AS "hasStaff",
      EXISTS (
        SELECT 1 FROM "StockOperation" s
        WHERE s."tenantId" = ${input.tenantId} AND s."storeId" = ${input.storeId}
      ) AS "hasInventoryActivity",
      EXISTS (
        SELECT 1 FROM "PrescriptionStoreSettings" p
        WHERE p."tenantId" = ${input.tenantId} AND p."storeId" = ${input.storeId}
          AND p."status" = 'ACTIVE'
      ) AS "hasPrescriptionCommerce"
  `
}
