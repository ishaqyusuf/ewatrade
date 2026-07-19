import { prisma } from "@ewatrade/db"

export type CatalogFeatureAvailability = {
  hasProductItems: boolean
  hasServiceItems: boolean
}

export function deriveCatalogFeatureAvailability(
  kinds: Array<"PRODUCT" | "SERVICE">,
): CatalogFeatureAvailability {
  return {
    hasProductItems: kinds.includes("PRODUCT"),
    hasServiceItems: kinds.includes("SERVICE"),
  }
}

export async function getCatalogFeatureAvailability(input: {
  storeId: string
  tenantId: string
}): Promise<CatalogFeatureAvailability> {
  const items = await prisma.catalogItem.findMany({
    distinct: ["kind"],
    select: {
      kind: true,
    },
    where: {
      status: "ACTIVE",
      tenantId: input.tenantId,
      offerings: {
        some: {
          status: "ACTIVE",
          storeAvailability: {
            some: {
              isAvailable: true,
              storeId: input.storeId,
            },
          },
        },
      },
    },
  })

  return deriveCatalogFeatureAvailability(items.map((item) => item.kind))
}
