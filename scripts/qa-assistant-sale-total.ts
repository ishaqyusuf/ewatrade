import assert from "node:assert/strict"
if (
  process.env.APP_ENV !== "local" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1"
)
  throw Error("Verified local Development profile required")
const { prisma } = await import("@ewatrade/db")
const { createCatalogItem } = await import("@ewatrade/db/queries")
try {
  const store = await prisma.store.findFirst({
    where: {
      id: "cmuzed6uu0003bw9k3002y5mh",
      status: "ACTIVE",
      tenant: { dataClassification: "QA", name: "Mama Bisi Farms (Demo QA)" },
    },
    select: { id: true, tenantId: true },
  })
  assert(store, "Exact QA Store required")
  const owner = await prisma.membership.findFirst({
    where: { tenantId: store.tenantId, role: "OWNER", status: "ACTIVE" },
    select: { userId: true },
  })
  assert(owner, "QA owner required")
  const item = await createCatalogItem(prisma, {
    tenantId: store.tenantId,
    storeId: store.id,
    actorUserId: owner.userId,
    clientOperationId: "assistant-sale-item-total-20261010-v1",
    kind: "product",
    name: "Assistant item total QA 1010",
    unitConfiguration: {
      canonicalBalanceScale: 0,
      units: [
        {
          key: "piece",
          name: "Piece",
          factor: "1",
          stockBehavior: "canonical_shared",
          transactionScale: 0,
        },
      ],
    },
    optionGroups: [],
    variants: [
      {
        key: "default",
        name: "Standard",
        isDefault: true,
        selections: [],
        openingStockQuantity: "10",
        offerings: [
          {
            key: "piece",
            name: "Piece",
            inventoryUnitKey: "piece",
            pricingPolicy: "order_total",
          },
        ],
      },
    ],
  })
  console.log(
    JSON.stringify({
      id: item.id,
      offerings: item.variants.flatMap((variant) =>
        variant.offerings.map((offering) => ({
          id: offering.id,
          policy: offering.pricingPolicy,
        })),
      ),
    }),
  )
} finally {
  await prisma.$disconnect()
}
