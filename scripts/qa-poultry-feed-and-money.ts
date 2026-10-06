import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"

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
if (process.argv.includes("--receipt-probe"))
  process.env.PERFORMANCE_TRACE = "true"
const { prisma } = await import("../packages/db/src/client")
const tenantId = "cmuv4c0450001z49kd8k5o0s1"
const storeId = "cmuv4c0mm0005z49kdycddipr"
const folder = "artifacts/dashboard-quick-orders-20261006/feed"
const stringify = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)
function evidence(name: string, value: unknown) {
  mkdirSync(folder, { recursive: true })
  writeFileSync(`${folder}/${name}.json`, stringify(value))
}

try {
  const owner = await prisma.membership.findFirstOrThrow({
    where: {
      tenantId,
      role: "OWNER",
      status: "ACTIVE",
      user: { email: "jawdah.preview.20261005@ishaq.qa.test" },
      tenant: { dataClassification: "QA", isActive: true },
    },
    select: { userId: true },
  })
  await prisma.store.findFirstOrThrow({
    where: { id: storeId, tenantId, status: "ACTIVE" },
  })
  const book = await prisma.financeBook.findUniqueOrThrow({
    where: { tenantId_currencyCode: { tenantId, currencyCode: "NGN" } },
    include: { accounts: true },
  })
  const inspection = {
    tenantId,
    storeId,
    ownerId: owner.userId,
    book: {
      id: book.id,
      startsAt: book.startsAt,
      closedThrough: book.closedThrough,
    },
    accounts: book.accounts
      .filter((a) => ["CASH", "BANK", "CLEARING"].includes(a.purpose))
      .map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        purpose: a.purpose,
        archivedAt: a.archivedAt,
      })),
    suppliers: await prisma.financeSupplierAccount.findMany({
      where: { bookId: book.id },
      select: { id: true, name: true, code: true },
    }),
    feedRecognitions: await prisma.financePurchaseRecognition.findMany({
      where: {
        tenantId,
        bookId: book.id,
        supplier: { code: "QA-FEED-20261006" },
      },
      select: {
        id: true,
        events: {
          select: { stage: true, journalEntryId: true, invoiceBillId: true },
        },
        lines: { select: { id: true, balanceSourceId: true } },
      },
    }),
    balances: await prisma.stockBalanceSource.findMany({
      where: { tenantId, storeId },
      select: {
        id: true,
        productId: true,
        onHandQuantity: true,
        reservedQuantity: true,
        revision: true,
        inventoryUnitId: true,
        inventoryUnit: { select: { name: true } },
      },
    }),
    staff: await prisma.membership.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { userId: true, role: true },
    }),
  }
  evidence("inspection", inspection)
  if (
    !process.argv.some((arg) =>
      [
        "--purchase",
        "--feed",
        "--money",
        "--receipt-probe",
        "--readback",
      ].includes(arg),
    )
  )
    console.log(stringify(inspection))
  if (process.argv.includes("--readback")) {
    const document = inspection.feedRecognitions[0]
    assert(document && inspection.feedRecognitions.length === 1)
    assert.deepEqual(
      document.events.map((event) => event.stage),
      ["INVOICE"],
    )
    const invoiceBillId = document.events[0]?.invoiceBillId
    assert(invoiceBillId)
    const { getFinancePurchaseBill } = await import(
      "../packages/db/src/queries/finance/purchase-reads"
    )
    const bill = await getFinancePurchaseBill(prisma, {
      tenantId,
      actorUserId: owner.userId,
      bookId: book.id,
      billId: invoiceBillId,
    })
    assert.equal(bill.outstandingMinor, "124500000")
    const feedBalances = inspection.balances.filter((balance) =>
      document.lines.some((line) => line.balanceSourceId === balance.id),
    )
    assert.equal(feedBalances.length, 2)
    for (const balance of feedBalances) {
      assert.equal(balance.onHandQuantity.toString(), "0")
      assert.equal(balance.revision, 0)
    }
    assert.equal(
      inspection.balances
        .find((b) => b.id === "cmuwhn9i600005n9kpcnan81h")
        ?.onHandQuantity.toString(),
      "195",
    )
    const movements = await prisma.stockMovement.count({
      where: { balanceSourceId: { in: feedBalances.map((b) => b.id) } },
    })
    const valuations = await prisma.financeInventoryValuationEvent.count({
      where: {
        tenantId,
        balanceSourceId: { in: feedBalances.map((b) => b.id) },
      },
    })
    assert.equal(movements, 0)
    assert.equal(valuations, 0)
    evidence("purchase-blocked-readback", {
      document,
      bill,
      feedBalances,
      movements,
      valuations,
      birds: 195,
      receiptRolledBack: true,
      feedingExecuted: false,
    })
    console.log(
      stringify({
        payableMinor: bill.outstandingMinor,
        feedBags: feedBalances.map((b) => b.onHandQuantity.toString()),
        movements,
        valuations,
        birds: 195,
        receiptRolledBack: true,
      }),
    )
  }
  if (process.argv.includes("--receipt-probe")) {
    const { recognizeFinancePurchase } = await import(
      "../packages/db/src/queries/finance/purchase-recognition"
    )
    const { withPerformanceTrace } = await import(
      "../packages/db/src/performance-tracing"
    )
    const document = inspection.feedRecognitions[0]
    assert(document && inspection.feedRecognitions.length === 1)
    const manifest = JSON.parse(
      readFileSync(`${folder}/purchase-manifest.json`, "utf8"),
    )
    await withPerformanceTrace(
      "job",
      () =>
        recognizeFinancePurchase(prisma, {
          tenantId,
          actorUserId: owner.userId,
          bookId: book.id,
          recognitionId: document.id,
          clientCommandId: "poultry-feed-20261006-v1-receipt",
          stage: "RECEIPT",
          effectiveAt: new Date(manifest.effectiveAt),
          reference: "QA-FEED-20261006-RECEIVED",
          receipts: document.lines.map((line) => ({
            lineId: line.id,
            expectedBalanceRevision: 0,
          })),
        }),
      (trace) => {
        evidence("receipt-performance", trace)
        console.log(stringify(trace))
      },
    )
  }
  if (process.argv.includes("--purchase")) {
    const { createCatalogItem } = await import(
      "../packages/db/src/queries/catalog"
    )
    const { getCatalogOfferingAvailability } = await import(
      "../packages/db/src/queries/catalog-inventory"
    )
    const { createFinanceSupplier } = await import(
      "../packages/db/src/queries/finance/supplier-writes"
    )
    const { registerFinancePurchase, recognizeFinancePurchase } = await import(
      "../packages/db/src/queries/finance/purchase-recognition"
    )
    const { getFinancePurchaseRecognition } = await import(
      "../packages/db/src/queries/finance/purchase-recognition-reads"
    )
    const { getFinancePurchaseBill } = await import(
      "../packages/db/src/queries/finance/purchase-reads"
    )
    const actor = { tenantId, actorUserId: owner.userId }
    const context = { ...actor, bookId: book.id }
    const run = "poultry-feed-20261006-v1"
    const manifestPath = `${folder}/purchase-manifest.json`
    if (!existsSync(manifestPath))
      evidence("purchase-manifest", {
        effectiveAt: new Date().toISOString(),
        originalBalances: inspection.balances,
      })
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    const effectiveAt = new Date(manifest.effectiveAt)
    const supplier = await createFinanceSupplier(prisma, {
      ...context,
      clientCommandId: `${run}-supplier`,
      code: "QA-FEED-20261006",
      name: "Poultry Feed QA Supplier 6 Oct",
    })
    const lines = []
    for (const spec of [
      {
        key: "grower",
        name: "Grower feed QA 6 Oct",
        quantity: "200",
        amountMinor: "101600000",
      },
      {
        key: "starter",
        name: "Starter feed QA 6 Oct",
        quantity: "50",
        amountMinor: "22900000",
      },
    ]) {
      const item = await createCatalogItem(prisma, {
        ...actor,
        storeId,
        clientOperationId: `${run}-${spec.key}`,
        kind: "product",
        name: spec.name,
        description:
          "Approved feeding QA. Purchase costs include NGN80 delivery per Bag. No kilogram conversion or fixed selling price.",
        unitConfiguration: {
          canonicalBalanceScale: 0,
          units: [
            {
              key: "bag",
              name: "Bag",
              factor: "1",
              stockBehavior: "canonical_shared",
              transactionScale: 0,
            },
          ],
        },
        variants: [
          {
            key: "default",
            name: spec.name,
            isDefault: true,
            offerings: [
              {
                key: "bag",
                name: "Bag",
                inventoryUnitKey: "bag",
                pricingPolicy: "fixed",
              },
            ],
          },
        ],
      })
      const offering = item.variants[0]?.offerings[0]
      assert(offering)
      const availability = await getCatalogOfferingAvailability(prisma, {
        tenantId,
        storeId,
        offeringId: offering.id,
      })
      lines.push({
        balanceSourceId: availability.balanceSourceId,
        enteredInventoryUnitId: availability.enteredInventoryUnitId,
        expectedConfigurationVersionId: availability.configurationVersionId,
        enteredQuantity: spec.quantity,
        amountMinor: spec.amountMinor,
        description: spec.name,
        categories: [{ name: "Feed purchase QA" }],
      })
    }
    const registration = {
      ...context,
      storeId,
      supplierId: supplier.id,
      clientCommandId: `${run}-register`,
      description:
        "Grower200 x NGN5000, Starter50 x NGN4500; NGN20000 delivery allocated NGN80 per bag",
      agreedAt: effectiveAt,
      lines,
    }
    const purchase = await registerFinancePurchase(prisma, registration)
    let detail = await getFinancePurchaseRecognition(prisma, {
      ...context,
      recognitionId: purchase.id,
    })
    assert.equal(detail.amountMinor, "124500000")
    const invoice = {
      ...context,
      recognitionId: purchase.id,
      clientCommandId: `${run}-invoice`,
      stage: "INVOICE" as const,
      effectiveAt,
      reference: "QA-FEED-20261006-INVOICE",
      invoiceAmountMinor: "124500000",
    }
    await recognizeFinancePurchase(prisma, invoice)
    const receipt = {
      ...context,
      recognitionId: purchase.id,
      clientCommandId: `${run}-receipt`,
      stage: "RECEIPT" as const,
      effectiveAt,
      reference: "QA-FEED-20261006-RECEIVED",
      receipts: detail.lines.map((l) => ({
        lineId: l.id,
        expectedBalanceRevision: 0,
      })),
    }
    await recognizeFinancePurchase(prisma, receipt)
    detail = await getFinancePurchaseRecognition(prisma, {
      ...context,
      recognitionId: purchase.id,
    })
    assert(detail.invoiceBillId)
    const bill = await getFinancePurchaseBill(prisma, {
      ...context,
      billId: detail.invoiceBillId,
    })
    assert.equal(bill.outstandingMinor, "124500000")
    for (const line of detail.lines) {
      const balance = await prisma.stockBalanceSource.findUniqueOrThrow({
        where: { id: line.balanceSourceId },
      })
      assert.equal(balance.onHandQuantity.toString(), line.enteredQuantity)
      assert.equal(balance.reservedQuantity.toString(), "0")
      assert.equal(line.receipt?.valuation?.status, "KNOWN")
      assert.equal(line.receipt?.valuation?.sourceCostMinor, line.amountMinor)
    }
    const counts = async () => ({
      movements: await prisma.stockMovement.count({
        where: { operation: { tenantId } },
      }),
      journals: await prisma.financeJournalEntry.count({
        where: { bookId: book.id },
      }),
      valuations: await prisma.financeInventoryValuationEvent.count({
        where: { tenantId, bookId: book.id },
      }),
    })
    const beforeReplay = await counts()
    assert.deepEqual(
      await registerFinancePurchase(prisma, registration),
      purchase,
    )
    await recognizeFinancePurchase(prisma, invoice)
    await recognizeFinancePurchase(prisma, receipt)
    assert.deepEqual(await counts(), beforeReplay)
    for (const balance of manifest.originalBalances) {
      const current = await prisma.stockBalanceSource.findUniqueOrThrow({
        where: { id: balance.id },
      })
      assert.equal(current.onHandQuantity.toString(), balance.onHandQuantity)
      assert.equal(
        current.reservedQuantity.toString(),
        balance.reservedQuantity,
      )
      assert.equal(current.revision, balance.revision)
    }
    evidence("purchase-verification", {
      supplier,
      purchase: detail,
      bill,
      counts: beforeReplay,
      replayUnchanged: true,
      originalBalancesUnchanged: true,
      paymentCreated: false,
    })
    console.log(
      stringify({
        purchaseId: purchase.id,
        bags: 250,
        goodsAndDeliveryMinor: detail.amountMinor,
        payableMinor: bill.outstandingMinor,
        knownValuation: true,
        replayUnchanged: true,
      }),
    )
  }
  if (process.argv.includes("--feed")) {
    const { postSingleBalanceStockOperation } = await import(
      "../packages/db/src/queries/inventory-operations"
    )
    const purchase = JSON.parse(
      readFileSync(`${folder}/purchase-verification.json`, "utf8"),
    ).purchase
    const manifestPath = `${folder}/feed-manifest.json`
    if (!existsSync(manifestPath))
      evidence("feed-manifest", { effectiveAt: new Date().toISOString() })
    const effectiveAt = new Date(
      JSON.parse(readFileSync(manifestPath, "utf8")).effectiveAt,
    )
    const journalsBefore = await prisma.financeJournalEntry.count({
      where: { bookId: book.id },
    })
    const results = []
    for (const line of purchase.lines) {
      const input = {
        tenantId,
        storeId,
        actorUserId: owner.userId,
        schemaVersion: 1,
        source: "dashboard",
        type: "adjustment" as const,
        direction: "decrease" as const,
        balanceSourceId: line.balanceSourceId,
        enteredInventoryUnitId: line.enteredInventoryUnitId,
        expectedConfigurationVersionId: line.configurationVersionId,
        expectedBalanceRevision: 1,
        clientOperationId: `poultry-feed-20261006-consume-${line.position}`,
        enteredQuantity: "1",
        effectiveAt,
        categories: [{ name: "Feeding QA" }, { name: "Broilers" }],
      }
      const result = await postSingleBalanceStockOperation(prisma, input)
      const balance = await prisma.stockBalanceSource.findUniqueOrThrow({
        where: { id: line.balanceSourceId },
      })
      const pool = await prisma.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId: book.id,
            balanceSourceId: line.balanceSourceId,
          },
        },
        include: { events: { orderBy: { sequence: "asc" } } },
      })
      const expectedQuantity = BigInt(line.enteredQuantity) - 1n
      const expectedCost =
        BigInt(line.amountMinor) / BigInt(line.enteredQuantity)
      assert.equal(
        balance.onHandQuantity.toString(),
        expectedQuantity.toString(),
      )
      assert.equal(pool.quantity.toString(), expectedQuantity.toString())
      assert.equal(pool.valueMinor, BigInt(line.amountMinor) - expectedCost)
      assert.equal(pool.events.at(-1)?.sourceCostMinor, expectedCost)
      assert.deepEqual(
        await postSingleBalanceStockOperation(prisma, input),
        result,
      )
      const rejections = []
      for (const [label, changes] of [
        ["overdraw", { enteredQuantity: (expectedQuantity + 1n).toString() }],
        [
          "wrong-unit",
          { enteredInventoryUnitId: inspection.balances[0]?.inventoryUnitId },
        ],
        ["wrong-store", { storeId: "qa-nonexistent-store-20261006" }],
      ] as const) {
        await assert.rejects(
          () =>
            postSingleBalanceStockOperation(prisma, {
              ...input,
              ...changes,
              expectedBalanceRevision: balance.revision,
              clientOperationId: `${input.clientOperationId}-${label}`,
            }),
          (error: unknown) => {
            assert(error instanceof Error)
            assert("code" in error)
            assert.equal(
              error.code,
              label === "overdraw"
                ? "INSUFFICIENT_STOCK"
                : label === "wrong-store"
                  ? "STORE_NOT_FOUND"
                  : "INVALID_STOCK_OPERATION",
            )
            rejections.push({ label, code: error.code, message: error.message })
            return true
          },
        )
      }
      const finalBalance = await prisma.stockBalanceSource.findUniqueOrThrow({
        where: { id: balance.id },
      })
      assert.equal(finalBalance.revision, balance.revision)
      const eventsAfter = await prisma.financeInventoryValuationEvent.count({
        where: { poolId: pool.id },
      })
      assert.equal(eventsAfter, pool.events.length)
      results.push({
        name: line.description,
        stock: finalBalance.onHandQuantity.toString(),
        valueMinor: pool.valueMinor?.toString(),
        consumedCostMinor: expectedCost.toString(),
        operation: result,
        valuation: pool.events.at(-1),
        rejections,
        replayUnchanged: true,
      })
    }
    const broilers = await prisma.stockBalanceSource.findUniqueOrThrow({
      where: { id: "cmuwhn9i600005n9kpcnan81h" },
    })
    assert.equal(broilers.onHandQuantity.toString(), "195")
    const journalsAfter = await prisma.financeJournalEntry.count({
      where: { bookId: book.id },
    })
    assert.equal(journalsAfter, journalsBefore)
    evidence("feeding-verification", {
      results,
      birds: "195",
      consumedCostMinor: "966000",
      journalsBefore,
      journalsAfter,
      flockLink: "Category label only; no structured feeding/flock source",
      missing: "No feeding expense journal or flock cost allocation",
    })
    console.log(
      stringify({
        feed: results.map((r) => ({
          name: r.name,
          bags: r.stock,
          valueMinor: r.valueMinor,
        })),
        birds: 195,
        consumedCostMinor: "966000",
        expenseJournalCreated: false,
      }),
    )
  }
  if (process.argv.includes("--money")) {
    const { recordCustomerLedgerReceipt } = await import(
      "../packages/db/src/queries/customer-ledger/receipts"
    )
    const { applyCustomerLedgerCredit } = await import(
      "../packages/db/src/queries/customer-ledger/allocations"
    )
    const { recordFinanceMoneyMovement } = await import(
      "../packages/db/src/queries/finance/money"
    )
    const context = { tenantId, bookId: book.id, actorUserId: owner.userId }
    const cash = book.accounts.find(
      (a) =>
        a.id === "cmuvpjtpa001lz19k697qy2al" &&
        a.name === "Shop cash" &&
        a.purpose === "CASH" &&
        !a.archivedAt,
    )
    const bank = book.accounts.find(
      (a) =>
        a.id === "cmuvpkc0j0020z19kzbkxg3pn" &&
        a.name === "OP" &&
        a.purpose === "BANK" &&
        !a.archivedAt,
    )
    assert(cash && bank)
    const orderId = "cmuwfsk0d00013n9kgsj5f5dd"
    const charge = await prisma.customerLedgerEntry.findFirstOrThrow({
      where: { tenantId, orderId, kind: "ORDER_CHARGE", side: "DEBIT" },
    })
    const totals = async () => {
      const lines = await prisma.financeJournalLine.findMany({
        where: { bookId: book.id, accountId: { in: [cash.id, bank.id] } },
      })
      return Object.fromEntries(
        [cash.id, bank.id].map((id) => [
          id,
          lines
            .filter((l) => l.accountId === id)
            .reduce((sum, l) => sum + l.debitMinor - l.creditMinor, 0n)
            .toString(),
        ]),
      )
    }
    const manifestPath = `${folder}/money-manifest.json`
    if (!existsSync(manifestPath))
      evidence("money-manifest", {
        effectiveAt: new Date().toISOString(),
        before: await totals(),
        journalsBefore: await prisma.financeJournalEntry.count({
          where: { bookId: book.id },
        }),
      })
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    const receiptInput = {
      ...context,
      storeId,
      accountId: charge.accountId,
      moneyAccountId: cash.id,
      clientCommandId: "poultry-money-20261006-receipt",
      amountMinor: "100000",
      method: "CASH" as const,
      reference: "QA-ORD-009-1000",
      description: "Approved QA: NGN1000 into Shop cash for ORD-009",
    }
    await assert.rejects(
      () =>
        recordCustomerLedgerReceipt(prisma, {
          ...receiptInput,
          moneyAccountId: bank.id,
          clientCommandId: "poultry-money-20261006-wrong-method",
        }),
      { code: "INVALID_JOURNAL" },
    )
    const receipt = await recordCustomerLedgerReceipt(prisma, receiptInput)
    assert.deepEqual(
      await recordCustomerLedgerReceipt(prisma, receiptInput),
      receipt,
    )
    const applyPath = `${folder}/money-allocation-input.json`
    const savedReceipt = await prisma.customerLedgerReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    })
    if (!existsSync(applyPath)) {
      const account = await prisma.customerLedgerAccount.findUniqueOrThrow({
        where: { id: charge.accountId },
      })
      evidence("money-allocation-input", {
        ...context,
        accountId: charge.accountId,
        clientCommandId: "poultry-money-20261006-apply",
        expectedRevision: account.revision.toString(),
        creditEntryId: savedReceipt.entryId,
        chargeEntryId: charge.id,
        amountMinor: "100000",
      })
    }
    const applyInput = JSON.parse(readFileSync(applyPath, "utf8"))
    const allocation = await applyCustomerLedgerCredit(prisma, applyInput)
    assert.deepEqual(
      await applyCustomerLedgerCredit(prisma, applyInput),
      allocation,
    )
    const orderBeforeTransfer = await prisma.commercialOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { amountPaidMinor: true, totalMinor: true },
    })
    assert.equal(orderBeforeTransfer.amountPaidMinor, 100000)
    const transferInput = {
      ...context,
      storeId,
      clientCommandId: "poultry-money-20261006-transfer",
      kind: "TRANSFER" as const,
      accountId: cash.id,
      destinationAccountId: bank.id,
      amountMinor: "50000",
      description: "Approved QA accounting transfer: Shop cash to OP",
      effectiveAt: new Date(manifest.effectiveAt),
    }
    const staff = inspection.staff.find((m) => m.role === "CASHIER")
    assert(staff)
    await assert.rejects(
      () =>
        recordFinanceMoneyMovement(prisma, {
          ...transferInput,
          actorUserId: staff.userId,
          clientCommandId: "poultry-money-20261006-staff-denied",
        }),
      { code: "FORBIDDEN" },
    )
    await assert.rejects(
      () =>
        recordFinanceMoneyMovement(prisma, {
          ...transferInput,
          destinationAccountId: cash.id,
          clientCommandId: "poultry-money-20261006-same-account",
        }),
      { code: "INVALID_JOURNAL" },
    )
    const transfer = await recordFinanceMoneyMovement(prisma, transferInput)
    assert.deepEqual(
      await recordFinanceMoneyMovement(prisma, transferInput),
      transfer,
    )
    const after = await totals()
    assert.equal(
      BigInt(after[cash.id] ?? "0") - BigInt(manifest.before[cash.id]),
      50000n,
    )
    assert.equal(
      BigInt(after[bank.id] ?? "0") - BigInt(manifest.before[bank.id]),
      50000n,
    )
    assert.deepEqual(
      await prisma.commercialOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: { amountPaidMinor: true, totalMinor: true },
      }),
      orderBeforeTransfer,
    )
    const journalsAfter = await prisma.financeJournalEntry.count({
      where: { bookId: book.id },
    })
    assert.equal(journalsAfter, manifest.journalsBefore + 3)
    evidence("money-verification", {
      receipt,
      allocation,
      transfer,
      order: { number: "ORD-009", ...orderBeforeTransfer },
      before: manifest.before,
      after,
      cashAccount: cash.name,
      bankAccount: bank.name,
      receiptAmountMinor: "100000",
      transferAmountMinor: "50000",
      journalsAdded: 3,
      replaysUnchanged: true,
      staffDenied: true,
      sameAccountDenied: true,
      methodMismatchDenied: true,
      actorRole: "OWNER",
      adminLiveSessionTested: false,
    })
    console.log(
      stringify({
        receiptAmountNGN: 1000,
        transferAmountNGN: 500,
        order: "ORD-009",
        orderPaidNGN: 1000,
        orderOutstandingNGN: 4000,
        cashNetChangeNGN: 500,
        bankNetChangeNGN: 500,
        replaysUnchanged: true,
      }),
    )
  }
} finally {
  await prisma.$disconnect()
}
