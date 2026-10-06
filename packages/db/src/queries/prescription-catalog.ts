import type { PrismaClient } from "../../generated/prisma/client"
import { saleEligibleCatalogItem } from "./product-usage"

export async function listPrescriptionSelectableOfferings(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  const offerings = await db.sellableOffering.findMany({
    orderBy: [
      { catalogItem: { name: "asc" } },
      { variant: { sortOrder: "asc" } },
      { sortOrder: "asc" },
    ],
    select: {
      catalogItem: { select: { name: true } },
      id: true,
      name: true,
      variant: { select: { name: true } },
    },
    where: {
      kind: "PRODUCT_UNIT",
      catalogItem: saleEligibleCatalogItem,
      status: "ACTIVE",
      storeAvailability: {
        some: { isAvailable: true, storeId: input.storeId },
      },
      tenantId: input.tenantId,
    },
  })
  return offerings.map((offering) => ({
    id: offering.id,
    label: [
      offering.catalogItem.name,
      offering.variant.name,
      offering.name,
    ].join(" · "),
  }))
}
