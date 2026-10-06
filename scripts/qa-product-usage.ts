import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"

const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "https://invalid")
assert(
  process.env.APP_ENV === "local" &&
    process.env.DEV_PROFILE === "local" &&
    process.env.DATABASE_PROFILE_VERIFIED === "1" &&
    target.hostname ===
      "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech" &&
    target.pathname === "/ewatrade_qa_v1",
  "Requires the approved isolated Development QA target",
)
const { prisma } = await import("../packages/db/src/client")
const { setCatalogProductUsage } = await import(
  "../packages/db/src/queries/product-usage"
)
const { createCommercialOrder } = await import(
  "../packages/db/src/queries/commercial-orders"
)
const { listCatalogItems } = await import("../packages/db/src/queries/catalog")
const tenantId = "cmuv4c0450001z49kd8k5o0s1"
const storeId = "cmuv4c0mm0005z49kdycddipr"
const ownerId = "f2rb8LHk5y2RlubYkx6YyiVo8lV0NcWs"
try {
  await prisma.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: ownerId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: { dataClassification: "QA" },
    },
  })
  const before = {
    orders: await prisma.commercialOrder.count({ where: { tenantId } }),
    movements: await prisma.stockMovement.count({
      where: { operation: { tenantId } },
    }),
  }
  const items = await prisma.catalogItem.findMany({
    where: {
      tenantId,
      name: { in: ["Grower feed QA 6 Oct", "Starter feed QA 6 Oct"] },
    },
    include: { product: true, offerings: { select: { id: true } } },
  })
  assert.equal(items.length, 2)
  const cashier = await prisma.membership.findFirstOrThrow({
    where: { tenantId, role: "CASHIER", status: "ACTIVE" },
  })
  const results = []
  for (const item of items) {
    assert(item.product)
    const input = {
      tenantId,
      actorUserId: ownerId,
      itemId: item.id,
      expectedUpdatedAt: item.product.updatedAt,
      usage: "INTERNAL_USE" as const,
    }
    await assert.rejects(
      () =>
        setCatalogProductUsage(prisma, {
          ...input,
          actorUserId: cashier.userId,
        }),
      { code: "FORBIDDEN" },
    )
    await assert.rejects(
      () =>
        setCatalogProductUsage(prisma, {
          ...input,
          itemId: "other-tenant-or-missing-product",
        }),
      { code: "CATALOG_ITEM_NOT_FOUND" },
    )
    const saved = await setCatalogProductUsage(prisma, input)
    assert.equal(saved.usage, "INTERNAL_USE")
    assert.deepEqual(await setCatalogProductUsage(prisma, input), saved)
    await assert.rejects(
      () =>
        setCatalogProductUsage(prisma, {
          ...input,
          usage: "BOTH",
          expectedUpdatedAt: new Date(0),
        }),
      { code: "REVISION_CONFLICT" },
    )
    const offering = item.offerings[0]
    assert(offering)
    await assert.rejects(
      () =>
        createCommercialOrder(prisma, {
          tenantId,
          storeId,
          actorUserId: ownerId,
          clientOrderId: `qa-internal-feed-sale-denied-${item.id}`,
          schemaVersion: 1,
          lines: [{ offeringId: offering.id, quantity: "1" }],
        }),
      (error: unknown) => {
        assert(error instanceof Error && "code" in error)
        assert.equal(error.code, "OFFERING_UNAVAILABLE")
        assert.match(error.message, /Internal-use/)
        return true
      },
    )
    results.push({
      id: item.id,
      name: item.name,
      usage: saved.usage,
      staffDenied: true,
      staleDenied: true,
      saleDenied: true,
      replayUnchanged: true,
    })
  }
  const catalog = await listCatalogItems(prisma, { tenantId })
  for (const item of results)
    assert.equal(
      catalog.find((row) => row.id === item.id)?.product?.usage,
      "INTERNAL_USE",
    )
  const balances = await prisma.stockBalanceSource.findMany({
    where: {
      tenantId,
      storeId,
      product: { catalogItemId: { in: results.map((item) => item.id) } },
    },
    select: { onHandQuantity: true, revision: true },
  })
  assert.equal(balances.length, 2)
  for (const balance of balances) {
    assert.equal(balance.onHandQuantity.toString(), "0")
    assert.equal(balance.revision, 0)
  }
  assert.deepEqual(
    {
      orders: await prisma.commercialOrder.count({ where: { tenantId } }),
      movements: await prisma.stockMovement.count({
        where: { operation: { tenantId } },
      }),
    },
    before,
  )
  const report = {
    results,
    balances: balances.map((balance) => ({
      ...balance,
      onHandQuantity: balance.onHandQuantity.toString(),
    })),
    noOrdersOrStockCreated: true,
  }
  mkdirSync("artifacts/product-usage-20261006", { recursive: true })
  writeFileSync(
    "artifacts/product-usage-20261006/verification.json",
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  await prisma.$disconnect()
}
