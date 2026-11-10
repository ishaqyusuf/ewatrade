import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  generalActionSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { createFinanceBook, createFinanceSupplier } from "@ewatrade/db/queries"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"

// Root alone selects this guarded QA suite. No import-time connection or live provider/model.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-shipment")
const released = process.env.ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS
let bookId = ""
let supplierId = ""
let catalogItemId = ""
let balanceSourceId = ""
let enteredInventoryUnitId = ""

beforeAll(async () => {
  if (!enabled) return
  process.env.ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS =
    "shipment_create,shipment_receive,shipment_cost_adjust"
  await fixture.setup()
  const { db, tenantId, storeId, userId } = fixture
  const item = await db.catalogItem.create({
    data: {
      tenantId,
      slug: `${fixture.marker}-charger`,
      kind: "PRODUCT",
      name: "Oraimo 20W Charger",
      product: { create: {} },
      variants: {
        create: { key: "default", name: "Default", isDefault: true },
      },
    },
    include: { product: true, variants: true },
  })
  catalogItemId = item.id
  const product = item.product
  const variant = item.variants[0]
  if (!product || !variant) throw Error("Incomplete charger fixture")
  const configuration = await db.unitConfigurationVersion.create({
    data: {
      productId: product.id,
      version: 1,
      status: "CURRENT",
      canonicalBalanceScale: 18,
      units: {
        create: {
          key: "piece",
          name: "Piece",
          factor: "1",
          stockBehavior: "CANONICAL_SHARED",
          transactionScale: 3,
        },
      },
    },
    include: { units: true },
  })
  const unit = configuration.units[0]
  if (!unit) throw Error("Missing charger unit")
  await db.catalogProduct.update({
    where: { id: product.id },
    data: { currentUnitConfigurationVersionId: configuration.id },
  })
  const balance = await db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: product.id,
      variantId: variant.id,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
    },
  })
  balanceSourceId = balance.id
  enteredInventoryUnitId = unit.id
  const actor = { tenantId, actorUserId: userId }
  bookId = (
    await createFinanceBook(db, {
      ...actor,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    })
  ).id
  supplierId = (
    await createFinanceSupplier(db, {
      ...actor,
      bookId,
      clientCommandId: `${fixture.marker}-supplier`,
      code: `SH-${fixture.marker.slice(-6)}`,
      name: "Shenzhen Hongda",
    })
  ).id
}, 300_000)

afterAll(async () => {
  if (released === undefined)
    Reflect.deleteProperty(
      process.env,
      "ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS",
    )
  else process.env.ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS = released
  if (enabled && fixture.db && bookId) {
    // The shared fixture does not know Finance or stock postings; remove them first.
    const tenantId = fixture.tenantId
    await fixture.db.$transaction(
      async (tx) => {
        const shipments = { shipment: { bookId } }
        await tx.financeShipmentReceiptLine.deleteMany({
          where: { receipt: { bookId } },
        })
        await tx.financeShipmentReceipt.deleteMany({ where: { bookId } })
        await tx.financeShipmentCostAdjustment.deleteMany({
          where: { bookId },
        })
        await tx.financeShipmentLine.deleteMany({ where: shipments })
        await tx.financeShipmentRate.deleteMany({ where: shipments })
        await tx.financeShipment.deleteMany({ where: { bookId } })
        await tx.financeInventoryValuationEvent.deleteMany({
          where: { bookId },
        })
        await tx.financeInventoryPool.deleteMany({ where: { bookId } })
        await tx.financePurchaseReceiptLine.deleteMany({ where: { bookId } })
        await tx.financeSupplierEntry.deleteMany({ where: { bookId } })
        await tx.financeBillLine.deleteMany({ where: { bookId } })
        await tx.financeBill.deleteMany({ where: { bookId } })
        await tx.stockMovement.deleteMany({
          where: { operation: { tenantId } },
        })
        await tx.stockOperationCategory.deleteMany({ where: { tenantId } })
        await tx.stockOperation.deleteMany({ where: { tenantId } })
        await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
        await tx.stockOperationCategoryName.deleteMany({ where: { tenantId } })
        await tx.financeSupplierAccount.deleteMany({ where: { bookId } })
        await tx.financeJournalLine.deleteMany({ where: { bookId } })
        await tx.financeJournalEntry.deleteMany({ where: { bookId } })
        await tx.financeCommand.deleteMany({ where: { bookId } })
        await tx.financeAccount.deleteMany({ where: { bookId } })
        await tx.financeBook.deleteMany({ where: { id: bookId } })
        await tx.catalogItem.deleteMany({ where: { id: catalogItemId } })
      },
      { timeout: 120_000 },
    )
  }
  await fixture.cleanup()
}, 300_000)

suite("native WhatsApp shipment lifecycle", () => {
  test("a reviewed shipment is expected without stock, a part arrival adds stock with one unpaid bill, and an arrival reviewed before a cost change is refused", async () => {
    const { db, tenantId } = fixture
    const onHand = async () =>
      (
        await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balanceSourceId },
        })
      ).onHandQuantity.toFixed()

    const created = await fixture.stagedProposal({
      text: "new shipment from Shenzhen Hongda: 200 Oraimo chargers at $3.20, freight $400, $1 = 1580",
      payload: generalActionSchema.parse({
        action: "shipment_create",
        bookId,
        supplierId,
        name: "SH-014",
        freightAmount: "400",
        freightCurrencyCode: "USD",
        rates: [{ currencyCode: "USD", rate: "1580" }],
        lines: [
          {
            description: "Oraimo chargers",
            balanceSourceId,
            enteredInventoryUnitId,
            expectedQuantity: "200",
            sourceCurrencyCode: "USD",
            sourceUnitPrice: "3.20",
          },
        ],
      }),
      reply: "Review this shipment.",
      expectedReviewText: "200 at USD 3.2",
    })
    expect(created.body).toContain("🧾 Review shipment")
    expect(created.body).toContain("1 USD = 1580 NGN")
    expect(created.body).toContain("₦632,000.00, split by value.")
    expect(created.body).toContain("Landed total ₦1,643,200.00.")
    await fixture.action(
      `Confirm ${created.confirmCode}`,
      created.providerMessageId,
    )
    const createdProposal = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: created.source.proposalId },
    })
    expect(createdProposal.status).toBe("COMPLETED")
    const receipt = generalReceiptSchema.parse(createdProposal.executedResult)
    expect(receipt.kind).toBe("finance_shipment")
    const shipment = await db.financeShipment.findFirstOrThrow({
      where: { bookId },
      include: { lines: true },
    })
    const line = shipment.lines[0]
    if (!line) throw Error("Expected the charger line")
    expect(shipment.status).toBe("EXPECTED")
    expect(await onHand()).toBe("0")

    const arrived = await fixture.stagedProposal({
      text: "SH-014 arrived: 180 chargers",
      payload: generalActionSchema.parse({
        action: "shipment_receive",
        bookId,
        shipmentId: shipment.id,
        lines: [{ lineId: line.id, quantity: "180" }],
      }),
      reply: "Review this arrival.",
      expectedReviewText: "180 of 200 still expected",
    })
    expect(arrived.body).toContain("🧾 Receive shipment")
    expect(arrived.body).toContain("Stock 0 → 180")
    expect(arrived.body).toContain("· unpaid.")
    expect(arrived.body).toContain("Still expected: 20 Oraimo 20W Charger")
    await fixture.action(
      `Confirm ${arrived.confirmCode}`,
      arrived.providerMessageId,
    )
    expect(await onHand()).toBe("180")
    expect(
      (
        await db.financeShipment.findUniqueOrThrow({
          where: { id: shipment.id },
        })
      ).status,
    ).toBe("PARTIALLY_RECEIVED")
    expect(await db.financeBill.count({ where: { bookId } })).toBe(1)

    // The rest is reviewed, then a cost is added before that review is confirmed.
    const rest = await fixture.stagedProposal({
      text: "SH-014 the last 20 chargers arrived",
      payload: generalActionSchema.parse({
        action: "shipment_receive",
        bookId,
        shipmentId: shipment.id,
        lines: [{ lineId: line.id, quantity: "20" }],
      }),
      reply: "Review this arrival.",
      expectedReviewText: "20 of 20 still expected",
    })
    const cost = await fixture.stagedProposal({
      text: "SH-014 paid 6000 customs for the chargers still coming",
      payload: generalActionSchema.parse({
        action: "shipment_cost_adjust",
        bookId,
        shipmentId: shipment.id,
        lineId: line.id,
        amountMinor: "600000",
        reason: "customs",
      }),
      reply: "Review this cost.",
      expectedReviewText: "+₦6,000.00 customs · ₦300.00 each",
    })
    expect(cost.body).toContain("🧾 Cost change")
    expect(cost.body).toContain("The 180 already received keep their cost.")
    await fixture.action(`Confirm ${cost.confirmCode}`, cost.providerMessageId)
    expect(
      await db.financeShipmentCostAdjustment.count({ where: { bookId } }),
    ).toBe(1)
    await fixture.action(`Confirm ${rest.confirmCode}`, rest.providerMessageId)
    expect(
      (
        await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: rest.source.proposalId },
        })
      ).status,
    ).not.toBe("COMPLETED")
    expect(await onHand()).toBe("180")
    expect(await db.financeBill.count({ where: { bookId } })).toBe(1)
    expect(await db.financeShipment.count({ where: { bookId } })).toBe(1)
    expect(tenantId).toBeTruthy()
  }, 1_200_000)
})
