import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
assert.equal(process.env.DATABASE_PROFILE_VERIFIED, "1")
assert.equal(process.env.DEV_PROFILE, "local")
assert.equal(process.env.APP_ENV, "local")
const target = new URL(process.env.EWATRADE_DATABASE_URL || "https://invalid")
assert(target.hostname.endsWith(".neon.tech"))
const productionEnv = await readFile(
  resolve(import.meta.dir, "../../../.env.production"),
  "utf8",
)
const productionUrl = productionEnv
  .match(/^EWATRADE_DATABASE_URL=(.+)$/m)?.[1]
  ?.replace(/^["']|["']$/g, "")
assert(productionUrl && new URL(productionUrl).hostname !== target.hostname)
const { prisma } = await import("../../../packages/db/src/index")
const manifest = JSON.parse(
  await readFile(resolve(import.meta.dir, "../output/fixtures.json"), "utf8"),
)
const businesses = JSON.parse(
  await readFile(
    resolve(import.meta.dir, "../fixtures/businesses.json"),
    "utf8",
  ),
)
const results = []
const onlyChapter = process.argv
  .find((arg) => arg.startsWith("--chapter="))
  ?.split("=")[1]
const onlyVariant = process.argv
  .find((arg) => arg.startsWith("--variant="))
  ?.split("=")[1]
try {
  for (const fixture of manifest.fixtures.filter(
    (f) =>
      (!onlyChapter || f.id === onlyChapter) &&
      (!onlyVariant || f.variant === onlyVariant),
  )) {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: fixture.tenantId },
      select: {
        dataClassification: true,
        qaSourceDomain: true,
        metadata: true,
      },
    })
    assert.equal(tenant.dataClassification, "QA")
    assert.equal(tenant.qaSourceDomain, "ishaq.qa.test")
    assert.equal(
      (tenant.metadata as { fixture: string }).fixture,
      "marketing-video",
    )
    const business = businesses.find((b) => b.id === fixture.id)
    const expected = business.input.split("\n").map((line) => {
      const [name, price, quantity] = line.split(",").map((x) => x.trim())
      return {
        name,
        price: Number(price) * 100,
        quantity: quantity ? Number(quantity.split(" ")[0]) : null,
      }
    })
    const items = await prisma.catalogItem.findMany({
      where: { tenantId: fixture.tenantId },
      select: {
        name: true,
        kind: true,
        status: true,
        product: {
          select: {
            stockBalanceSources: {
              where: { storeId: fixture.storeId },
              select: {
                onHandQuantity: true,
                inventoryUnit: { select: { name: true } },
              },
            },
          },
        },
        offerings: {
          select: { fixedPriceMinor: true, currencyCode: true, status: true },
        },
      },
    })
    assert.equal(
      items.length,
      2,
      `${fixture.variant}/${fixture.id}: exact item count`,
    )
    for (const row of expected) {
      const actual = items.find((i) => i.name === row.name)
      assert(actual, `Missing ${row.name}`)
      assert.equal(
        actual.kind,
        fixture.id === "laundry" ? "SERVICE" : "PRODUCT",
      )
      assert(
        actual.offerings.some(
          (o) => o.fixedPriceMinor === row.price && o.currencyCode === "NGN",
        ),
      )
      if (row.quantity !== null)
        assert.equal(
          actual.product?.stockBalanceSources.reduce(
            (n, s) => n + Number(s.onHandQuantity),
            0,
          ),
          row.quantity,
        )
    }
    results.push({
      id: fixture.id,
      variant: fixture.variant,
      items: JSON.parse(JSON.stringify(items)),
    })
  }
  await writeFile(
    resolve(
      import.meta.dir,
      onlyChapter || onlyVariant
        ? "../output/records-verification-partial.json"
        : "../output/records-verification.json",
    ),
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), readOnly: true, results },
      null,
      2,
    ),
  )
  console.log(
    `${results.length} QA tenants: exact Catalog item counts, kinds, NGN prices and opening stock verified; no extra duplicates.`,
  )
} finally {
  await prisma.$disconnect()
}
