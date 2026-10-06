import assert from "node:assert/strict"

if (
  process.env.APP_ENV !== "local" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  !new URL(
    process.env.EWATRADE_DATABASE_URL ?? "https://invalid",
  ).hostname.startsWith("ep-tiny-pine-b8uhz5oi")
)
  throw new Error("Requires the exact approved Development target.")

const { prisma } = await import("../packages/db/src/client")
const { postCommerceFinanceJournalInTransaction } = await import(
  "../packages/db/src/queries/finance/posting"
)
const tenantId = "cmuv4c0450001z49kd8k5o0s1"
const storeId = "cmuv4c0mm0005z49kdycddipr"
const expected = [
  ["cmuwfsk0d00013n9kgsj5f5dd", "ORD-009", 500000, "QA Bird Day-old A 6 Oct"],
  ["cmuwfwltp000b3n9kogp902re", "ORD-010", 750000, "QA Bird Day-old B 6 Oct"],
  ["cmuwg12h6000n3n9k1k0z5txd", "ORD-011", 3720000, "QA Bird Live 6 Oct"],
  ["cmuwg8hnm0001ns9kgah34t09", "ORD-012", 3000000, "QA Bird Dressed 6 Oct"],
] as const
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
  assert(owner)
  const book = await prisma.financeBook.findUnique({
    where: { tenantId_currencyCode: { tenantId, currencyCode: "NGN" } },
    include: { accounts: true },
  })
  assert(book, "An existing NGN Finance book is required")
  for (const code of ["1200", "4000"])
    assert(
      book.accounts.some((a) => a.code === code && a.archivedAt === null),
      `Missing source account ${code}`,
    )
  const orders = []
  for (const [id, number, total, name] of expected) {
    const order = await prisma.commercialOrder.findFirst({
      where: { id, tenantId, storeId },
      include: {
        customer: true,
        lines: { include: { snapshot: true, productFulfillments: true } },
        payments: true,
      },
    })
    assert(order)
    assert.equal(order.orderNumber, number)
    assert.equal(order.status, "COMPLETED")
    assert.equal(order.totalMinor, total)
    assert.equal(order.customerName, name)
    assert.equal(order.customer?.name, name)
    assert(order.customerId)
    assert.equal(order.currencyCode, "NGN")
    assert.equal(order.amountPaidMinor, 0)
    assert.equal(order.payments.length, 0)
    assert(order.completedAt)
    assert(order.lines.every((l) => l.productFulfillments.length === 1))
    orders.push(order)
  }
  const plan = {
    target: "Development ep-tiny-pine-b8uhz5oi",
    bookId: book.id,
    orderNumbers: orders.map((o) => o.orderNumber),
    billedTotalMinor: orders.reduce((sum, o) => sum + o.totalMinor, 0),
    sources: orders.flatMap((o) =>
      ["BILLED", "EARNED"].map((event) => ({ orderId: o.id, event })),
    ),
    newCashOrPayments: false,
    automaticWriterActivation: false,
    historicalOrders: false,
  }
  console.log(JSON.stringify(plan, null, 2))
  if (process.argv.includes("--apply")) {
    for (const order of orders) {
      await prisma.$transaction(
        async (tx) => {
          await postCommerceFinanceJournalInTransaction(tx, {
            tenantId,
            orderId: order.id,
            event: "BILLED",
          })
          await postCommerceFinanceJournalInTransaction(tx, {
            tenantId,
            orderId: order.id,
            event: "EARNED",
          })
        },
        { maxWait: 10000, timeout: 30000 },
      )
    }
    console.log(
      "Applied only the eight immutable QA source postings through the existing internal adapter.",
    )
  } else console.log("READ-ONLY: no postings applied.")
} finally {
  await prisma.$disconnect()
}
process.exit(0)
