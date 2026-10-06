import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"

if (
  process.env.APP_ENV !== "local" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  !new URL(
    process.env.EWATRADE_DATABASE_URL ?? "https://invalid",
  ).hostname.startsWith("ep-tiny-pine-b8uhz5oi")
)
  throw new Error("Requires the owner-approved Development target.")

const { prisma } = await import("../packages/db/src/client")
const { fulfillCommercialOrderProducts } = await import(
  "../packages/db/src/queries/commercial-orders"
)
const { getOrderReceipts } = await import(
  "../packages/db/src/queries/order-receipts"
)
const { renderOrderReceipts } = await import(
  "../packages/order-receipts/src/pdf"
)
const tenantId = "cmuv4c0450001z49kd8k5o0s1"
const storeId = "cmuv4c0mm0005z49kdycddipr"
const itemId = "cmuwfndnd00006f9kv68s6xwq"
const folder = "artifacts/dashboard-quick-orders-20261006/pricing"
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)

async function state() {
  return {
    balances: await prisma.stockBalanceSource.findMany({
      where: { tenantId, storeId, product: { catalogItemId: itemId } },
      orderBy: { id: "asc" },
    }),
    movementCount: await prisma.stockMovement.count({
      where: { balanceSource: { product: { catalogItemId: itemId } } },
    }),
    journalCount: await prisma.financeJournalEntry.count({
      where: { book: { tenantId } },
    }),
    ledgerCount: await prisma.customerLedgerEntry.count({
      where: { tenantId },
    }),
    fulfillmentCount: await prisma.productFulfillment.count({
      where: {
        orderLine: {
          order: {
            tenantId,
            orderNumber: { in: ["ORD-009", "ORD-010", "ORD-011", "ORD-012"] },
          },
        },
      },
    }),
  }
}
try {
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
  const orders = await prisma.commercialOrder.findMany({
    where: {
      tenantId,
      storeId,
      orderNumber: { in: ["ORD-009", "ORD-010", "ORD-011", "ORD-012"] },
    },
    orderBy: { orderNumber: "asc" },
    include: {
      customer: true,
      lines: {
        include: {
          snapshot: true,
          productFulfillments: true,
          stockReservation: true,
        },
      },
      fulfillmentCommands: true,
      ledgerEntries: true,
    },
  })
  assert.equal(orders.length, 4)
  assert.equal(new Set(orders.map((o) => o.customerId)).size, 4)
  const totals = [500000, 750000, 3720000, 3000000]
  const quantities = ["2", "3", "3", "5"]
  for (const [i, order] of orders.entries()) {
    assert.equal(order.status, "COMPLETED")
    assert.equal(order.totalMinor, totals[i])
    assert.equal(order.amountPaidMinor, 0)
    assert(order.customerId)
    assert.equal(order.customer?.name, order.customerName)
    assert.equal(order.lines.length, 1)
    const line = order.lines[0]
    assert(line)
    assert.equal(line.quantity.toString(), quantities[i])
    assert.equal(line.totalMinor, totals[i])
    assert.equal(line.unitPriceMinor, i < 2 ? 250000 : null)
    assert.equal(line.snapshot?.unitPriceMinor, i < 2 ? 250000 : null)
    if (i >= 2)
      assert(
        line.snapshot?.note?.includes(
          i === 2 ? "12.4 kg live" : "10 kg after dressing",
        ),
      )
    assert.equal(line.productFulfillments.length, 1)
    assert.equal(line.stockReservation?.status, "COMMITTED")
    assert.equal(order.fulfillmentCommands.length, 1)
    assert(
      order.ledgerEntries.some(
        (e) =>
          e.kind === "ORDER_CHARGE" &&
          e.amountMinor === BigInt(order.totalMinor),
      ),
    )
  }
  const before = await state()
  assert.equal(
    before.balances
      .find((b) => b.variantId === "cmuwfnezw00076f9kgtwrb6cl")
      ?.onHandQuantity.toString(),
    "75",
  )
  assert.equal(
    before.balances
      .find((b) => b.variantId === "cmuwfng0m000d6f9k19xqw2nt")
      ?.onHandQuantity.toString(),
    "12",
  )
  assert(before.balances.every((b) => b.reservedQuantity.toString() === "0"))
  for (const order of orders) {
    const command = order.fulfillmentCommands[0]
    assert(command)
    for (let i = 0; i < 2; i++) {
      const result = await fulfillCommercialOrderProducts(prisma, {
        actorUserId: command.actorUserId,
        clientOperationId: command.clientOperationId,
        orderId: order.id,
        schemaVersion: 1,
        tenantId,
      })
      assert.equal(result.status, "COMPLETED")
      assert.equal(result.fulfilledLineCount, 1)
    }
  }
  assert.equal(
    json(await state()),
    json(before),
    "Replays must not change stock, journals, ledger or fulfillment counts",
  )
  const receipts = await getOrderReceipts(prisma, {
    tenantId,
    storeId,
    orderIds: orders.map((o) => o.id),
  })
  assert.deepEqual(
    receipts.map((r) => r.totalMinor),
    totals,
  )
  const bytes = await renderOrderReceipts(receipts)
  const { getDocument } = await import(
    "../packages/order-receipts/node_modules/pdfjs-dist/legacy/build/pdf.mjs"
  )
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise
  const texts = []
  for (let page = 1; page <= pdf.numPages; page++)
    texts.push(
      (await (await pdf.getPage(page)).getTextContent()).items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" "),
    )
  assert.equal(pdf.numPages, 4)
  assert(texts[2]?.includes("37,200.00"))
  assert(texts[2]?.includes("12.4 kg live"))
  assert(texts[3]?.includes("30,000.00"))
  assert(texts[3]?.includes("10 kg after dressing"))
  await pdf.destroy()
  mkdirSync(folder, { recursive: true })
  writeFileSync(`${folder}/four-approved-sales.pdf`, bytes)
  writeFileSync(
    `${folder}/four-sale-verification.json`,
    json({ orders, before, replayCount: 8, pdfPages: 4, texts }),
  )
  console.log(
    json({
      passed: true,
      orders: orders.map((o) => ({
        number: o.orderNumber,
        id: o.id,
        totalMinor: o.totalMinor,
        customerId: o.customerId,
      })),
      balances: before.balances.map((b) => ({
        variantId: b.variantId,
        onHand: b.onHandQuantity.toString(),
        reserved: b.reservedQuantity.toString(),
      })),
      replayCount: 8,
      pdfPages: 4,
    }),
  )
} finally {
  await prisma.$disconnect()
}
process.exit(0)
