import { type ProductUsage, productUsages } from "@ewatrade/utils/product-usage"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"

// Use in sale reads, never in purchasing or Inventory queries.
export const saleEligibleCatalogItem = {
  OR: [
    { kind: "SERVICE" },
    {
      kind: "PRODUCT",
      product: { is: { usage: { in: ["FOR_SALE", "BOTH"] } } },
    },
  ],
} satisfies Prisma.CatalogItemWhereInput

/** Order creation holds these shared locks until commit; usage edits take UPDATE. */
export async function assertSaleProductUsage(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; offeringIds: string[] },
) {
  const ids = [...new Set(input.offeringIds)].sort()
  if (!ids.length) return
  const { Prisma } = await import("../../generated/prisma/client")
  const products = await tx.$queryRaw<
    Array<{ usage: ProductUsage }>
  >(Prisma.sql`
    SELECT p."usage" FROM "CatalogProduct" p
    JOIN "CatalogItem" i ON i.id = p."catalogItemId"
    WHERE i."tenantId" = ${input.tenantId}
      AND EXISTS (SELECT 1 FROM "SellableOffering" o
        WHERE o."catalogItemId" = i.id AND o.id IN (${Prisma.join(ids)}))
    ORDER BY p.id FOR SHARE OF p
  `)
  if (products.some((product) => product.usage === "INTERNAL_USE")) {
    throw new CatalogError(
      "OFFERING_UNAVAILABLE",
      "Internal-use Products cannot be added to customer orders.",
    )
  }
}

export async function setCatalogProductUsage(
  db: PrismaClient,
  input: {
    tenantId: string
    actorUserId: string
    itemId: string
    usage: ProductUsage
    expectedUpdatedAt: Date
  },
) {
  if (
    !productUsages.includes(input.usage) ||
    !Number.isFinite(input.expectedUpdatedAt.getTime())
  ) {
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Choose a valid usage and refresh the Product.",
    )
  }
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.actorUserId} FOR SHARE`
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
      await tx.$queryRaw`SELECT p.id FROM "CatalogProduct" p JOIN "CatalogItem" i ON i.id = p."catalogItemId"
      WHERE i.id = ${input.itemId} AND i."tenantId" = ${input.tenantId} FOR UPDATE OF p`
      const product = await tx.catalogProduct.findFirst({
        where: {
          catalogItemId: input.itemId,
          catalogItem: { tenantId: input.tenantId, kind: "PRODUCT" },
        },
      })
      if (!product)
        throw new CatalogError(
          "CATALOG_ITEM_NOT_FOUND",
          "Product not found in this business.",
        )
      // Setting the same value is safe to retry even after a lost response.
      if (product.usage === input.usage)
        return {
          usage: product.usage,
          updatedAt: product.updatedAt.toISOString(),
        }
      if (product.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new CatalogError(
          "REVISION_CONFLICT",
          "This Product changed. Refresh before changing its usage.",
        )
      }
      const updated = await tx.catalogProduct.update({
        where: { id: product.id },
        data: { usage: input.usage },
      })
      await tx.catalogItem.update({
        where: { id: input.itemId },
        data: { updatedAt: new Date() },
      })
      return {
        usage: updated.usage,
        updatedAt: updated.updatedAt.toISOString(),
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
