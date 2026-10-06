import assert from "node:assert/strict"

if (
  process.env.APP_ENV !== "local" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  !new URL(
    process.env.EWATRADE_DATABASE_URL ?? "https://invalid",
  ).hostname.startsWith("ep-tiny-pine-b8uhz5oi")
)
  throw new Error("Requires the owner-approved verified Development target.")

const { prisma } = await import("../packages/db/src/client")
const { createCatalogItem } = await import("../packages/db/src/queries/catalog")
const tenantId = "cmuv4c0450001z49kd8k5o0s1"
const storeId = "cmuv4c0mm0005z49kdycddipr"
try {
  const owner = await prisma.membership.findFirst({
    where: {
      tenantId,
      role: "OWNER",
      status: "ACTIVE",
      user: { email: "jawdah.preview.20261005@ishaq.qa.test" },
      tenant: { dataClassification: "QA", isActive: true },
    },
    select: { userId: true },
  })
  assert(owner, "Exact QA Owner unavailable")
  assert(
    await prisma.store.findFirst({
      where: { id: storeId, tenantId, status: "ACTIVE" },
      select: { id: true },
    }),
    "Exact QA Store unavailable",
  )
  const item = await createCatalogItem(prisma, {
    actorUserId: owner.userId,
    tenantId,
    storeId,
    clientOperationId: "broiler-order-total-qa-20261006-fixture-v1",
    kind: "product",
    name: "Broiler pricing QA 6 Oct",
    description:
      "Isolated approved QA: 100 Birds, 80 Day-old and 20 Fully grown. Grown sales share Bird stock; weight calculations remain item notes.",
    unitConfiguration: {
      canonicalBalanceScale: 0,
      units: [
        {
          key: "bird",
          name: "Bird",
          factor: "1",
          stockBehavior: "canonical_shared",
          transactionScale: 0,
        },
      ],
    },
    optionGroups: [
      {
        key: "age",
        name: "Age",
        values: [
          { key: "day-old", label: "Day-old" },
          { key: "fully-grown", label: "Fully grown" },
        ],
      },
    ],
    variants: [
      {
        key: "day-old",
        name: "Day-old",
        isDefault: true,
        selections: [{ groupKey: "age", valueKey: "day-old" }],
        openingStockQuantity: "80",
        offerings: [
          {
            key: "day-old-bird",
            name: "Bird",
            inventoryUnitKey: "bird",
            pricingPolicy: "fixed",
            fixedPriceMinor: 250000,
          },
        ],
      },
      {
        key: "fully-grown",
        name: "Fully grown",
        isDefault: false,
        selections: [{ groupKey: "age", valueKey: "fully-grown" }],
        openingStockQuantity: "20",
        offerings: [
          {
            key: "grown-bird",
            name: "Bird",
            inventoryUnitKey: "bird",
            pricingPolicy: "order_total",
          },
        ],
      },
    ],
  })
  console.log(
    JSON.stringify(
      {
        id: item.id,
        name: item.name,
        variants: item.variants.map((v) => ({
          id: v.id,
          name: v.name,
          offerings: v.offerings.map((o) => ({
            id: o.id,
            policy: o.pricingPolicy,
            price: o.fixedPriceMinor,
          })),
        })),
        stock: item.product?.stockBalances,
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
process.exit(0)
