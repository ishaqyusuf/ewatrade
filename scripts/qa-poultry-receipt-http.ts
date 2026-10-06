import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"

// Read-only regression: a cold PDF render after real database I/O in Bun HTTP.
// Run with the root environment wrapper and the repository-pinned Bun 1.3.9.
const url = new URL(process.env.EWATRADE_DATABASE_URL ?? "https://invalid")
if (
  process.env.APP_ENV !== "local" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  url.hostname !==
    "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech" ||
  url.pathname !== "/ewatrade_qa_v1"
)
  throw new Error("Requires the isolated Development QA target.")

const { app } = await import("../apps/api/src/index")
const { prisma } = await import("../packages/db/src/client")
const { getOrderReceipts } = await import(
  "../packages/db/src/queries/order-receipts"
)
const { renderOrderReceipts } = await import(
  "../packages/order-receipts/src/pdf"
)
const tenantId = "cmuv4c0450001z49kd8k5o0s1"
const storeId = "cmuv4c0mm0005z49kdycddipr"
const ids = [
  "cmuwfsk0d00013n9kgsj5f5dd",
  "cmuwfwltp000b3n9kogp902re",
  "cmuwg12h6000n3n9k1k0z5txd",
  "cmuwg8hnm0001ns9kgah34t09",
]
assert(
  await prisma.membership.findFirst({
    where: {
      tenantId,
      role: "OWNER",
      status: "ACTIVE",
      user: { email: "jawdah.preview.20261005@ishaq.qa.test" },
      tenant: { dataClassification: "QA" },
    },
    select: { userId: true },
  }),
)

async function state() {
  return {
    orders: await prisma.commercialOrder.count({ where: { tenantId } }),
    journals: await prisma.financeJournalEntry.count({
      where: { book: { tenantId } },
    }),
    ledger: await prisma.customerLedgerEntry.count({ where: { tenantId } }),
    fulfillments: await prisma.productFulfillment.count({
      where: { orderLine: { order: { tenantId } } },
    }),
    balances: await prisma.stockBalanceSource.findMany({
      where: { tenantId, storeId },
      orderBy: { id: "asc" },
    }),
  }
}
const before = await state()
let requestedIds = ids
const route = `/qa-receipt-${crypto.randomUUID()}`
app.get(route, async (c) => {
  const receipts = await getOrderReceipts(prisma, {
    tenantId,
    storeId,
    orderIds: requestedIds,
  })
  const bytes = await renderOrderReceipts(receipts)
  return c.body(bytes, 200, { "Content-Type": "application/pdf" })
})
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 30,
  fetch: app.fetch,
})
const folder = "artifacts/dashboard-quick-orders-20261006/pricing"
const results: Array<{ name: string; bytes: number; milliseconds: number }> = []
try {
  mkdirSync(folder, { recursive: true })
  // Start with the exact formerly stalling single receipt; exercise it twice.
  const cases = [
    { name: "ORD-012-cold", ids: ["cmuwg8hnm0001ns9kgah34t09"] },
    { name: "ORD-012-repeat", ids: ["cmuwg8hnm0001ns9kgah34t09"] },
    ...ids.slice(0, 3).map((id, i) => ({
      name: `ORD-${String(i + 9).padStart(3, "0")}`,
      ids: [id],
    })),
    { name: "four-orders", ids },
  ]
  for (const entry of cases) {
    requestedIds = entry.ids
    const started = performance.now()
    const response = await fetch(new URL(route, server.url), {
      signal: AbortSignal.timeout(25_000),
    })
    assert.equal(response.status, 200)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-")
    assert(bytes.length > 1000 && bytes.length <= 10_000_000)
    writeFileSync(`${folder}/http-receipt-${entry.name}.pdf`, bytes)
    results.push({
      name: entry.name,
      bytes: bytes.length,
      milliseconds: Math.round(performance.now() - started),
    })
  }
  assert.deepEqual(await state(), before)
  const evidence = {
    runtime: Bun.version,
    database: url.pathname.slice(1),
    results,
    recordsUnchanged: true,
  }
  writeFileSync(
    `${folder}/receipt-http-verification.json`,
    JSON.stringify(evidence, null, 2),
  )
  console.log(JSON.stringify(evidence))
} finally {
  server.stop(true)
  await prisma.$disconnect()
}
