import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalMoney,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "@ewatrade/assistant/general/read-continuation"
import {
  appendAssistantMessage,
  assistantBudgetScopeKey,
} from "@ewatrade/db/assistant"
import { disconnectAssistantWhatsApp } from "@ewatrade/db/assistant-whatsapp"
import {
  createFinanceBook,
  createFinanceSupplier,
  createSimpleCatalogItem,
  payFinancePurchaseBill,
  recognizeFinancePurchase,
  registerFinancePurchase,
} from "@ewatrade/db/queries"
import { z } from "zod"
import { financePostingCommandId } from "../../../../packages/db/src/queries/finance/commands"
import { inventoryRouter } from "../trpc/routers/inventory"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalPersistentParts } from "./general-persistence"
import { createGeneralTools } from "./general-tools"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-purchase-reads")
const previousRehearsal = process.env.ASSISTANT_REHEARSAL_MODE
const commands = {
  supplier: `${fixture.marker}-supplier`,
  catalog: `${fixture.marker}-catalog`,
  register: `${fixture.marker}-register`,
  invoice: `${fixture.marker}-invoice`,
  payment: `${fixture.marker}-payment`,
}
const supplierName = "Synthetic invoice-only supplier"
const goodsName = "Synthetic invoice-only goods"
const description = "Synthetic agreement; no ownership or physical receipt"
const agreedAt = new Date("2026-10-01T10:00:00.000Z")
const invoiceAt = new Date("2026-10-02T10:00:00.000Z")
const paidAt = new Date("2026-10-03T10:00:00.000Z")
let bookId = ""
let supplierId = ""
let cashId = ""
let itemId = ""
let recognitionId = ""
let invoiceEventId = ""
let invoiceBillId = ""
let paymentId = ""
let balanceSourceId = ""
let enteredInventoryUnitId = ""
let configurationVersionId = ""
let externalCalls = 0
let restoreFetch: (() => void) | undefined

beforeAll(async () => {
  if (!enabled) return
  const refuse = () => {
    externalCalls += 1
    throw Error("External fetch forbidden in purchase read fixture")
  }
  const trap = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => refuse(), { preconnect: refuse }),
  )
  restoreFetch = () => trap.mockRestore()
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  await fixture.setup()
  const { db, tenantId, storeId, userId } = fixture
  const actor = { tenantId, actorUserId: userId }
  bookId = (
    await createFinanceBook(db, {
      ...actor,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    })
  ).id
  cashId = (
    await db.financeAccount.findUniqueOrThrow({
      where: { bookId_code: { bookId, code: "1000" } },
    })
  ).id
  supplierId = (
    await createFinanceSupplier(db, {
      ...actor,
      bookId,
      clientCommandId: commands.supplier,
      code: "READ_INVOICE_ONLY",
      name: supplierName,
    })
  ).id
  itemId = (
    await createSimpleCatalogItem(db, {
      ...actor,
      storeId,
      clientOperationId: commands.catalog,
      kind: "product",
      name: goodsName,
      canonicalUnitName: "Piece",
      priceMinor: 5000,
      openingStockQuantity: "0",
    })
  ).id
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: itemId },
  })
  // Deliberate canonical setup initialization; no read is credited with creating a source.
  const available = await inventoryRouter
    .createCaller(await fixture.browserContext())
    .offeringAvailability({ offeringId: offering.id, storeId })
  ;({ balanceSourceId, enteredInventoryUnitId, configurationVersionId } =
    available)
  expect(available.onHandQuantity).toBe("0")
  recognitionId = (
    await registerFinancePurchase(db, {
      ...actor,
      bookId,
      clientCommandId: commands.register,
      supplierId,
      storeId,
      description,
      agreedAt,
      lines: [
        {
          balanceSourceId,
          enteredInventoryUnitId,
          expectedConfigurationVersionId: configurationVersionId,
          enteredQuantity: "2.5",
          amountMinor: "12500",
          description: goodsName,
          categories: [{ name: "Synthetic agreement goods" }],
        },
      ],
    })
  ).id
  expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(0)
  expect(await db.stockOperation.count({ where: { tenantId } })).toBe(0)
  invoiceEventId = (
    await recognizeFinancePurchase(db, {
      ...actor,
      bookId,
      clientCommandId: commands.invoice,
      recognitionId,
      stage: "INVOICE",
      effectiveAt: invoiceAt,
      invoiceAmountMinor: "12500",
      reference: `${fixture.marker}-invoice-source`,
    })
  ).id
  const invoice = await db.financePurchaseRecognitionEvent.findUniqueOrThrow({
    where: { id: invoiceEventId },
  })
  if (!invoice.invoiceBillId)
    throw Error("Canonical INVOICE must return a purchase bill source")
  invoiceBillId = invoice.invoiceBillId
  paymentId = (
    await payFinancePurchaseBill(db, {
      ...actor,
      bookId,
      clientCommandId: commands.payment,
      billId: invoiceBillId,
      moneyAccountId: cashId,
      amountMinor: "3500",
      effectiveAt: paidAt,
      reference: `${fixture.marker}-recorded-cash`,
      description: "Synthetic partial cash payment already made",
    })
  ).id
}, 180_000)

async function snapshot() {
  const { db, tenantId } = fixture
  const [
    book,
    suppliers,
    recognitions,
    events,
    recognitionLines,
    bills,
    billLines,
    payments,
    entries,
    journal,
    journalLines,
    commandRows,
    sources,
  ] = await Promise.all([
    db.financeBook.findUniqueOrThrow({ where: { id: bookId } }),
    db.financeSupplierAccount.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financePurchaseRecognition.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    db.financePurchaseRecognitionEvent.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financePurchaseRecognitionLine.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financeBill.findMany({ where: { bookId }, orderBy: { id: "asc" } }),
    db.financeBillLine.findMany({ where: { bookId }, orderBy: { id: "asc" } }),
    db.financeBillPayment.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financeSupplierEntry.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financeJournalEntry.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financeJournalLine.findMany({
      where: { bookId },
      orderBy: { id: "asc" },
    }),
    db.financeCommand.findMany({ where: { bookId }, orderBy: { id: "asc" } }),
    db.stockBalanceSource.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
  ])
  return {
    book,
    suppliers,
    recognitions,
    events,
    recognitionLines,
    bills,
    billLines,
    payments,
    entries,
    journal,
    journalLines,
    commandRows,
    sources,
  }
}

async function noOtherEffects() {
  const { db, tenantId, conversationId } = fixture
  for (const count of await Promise.all([
    db.stockOperation.count({ where: { tenantId } }),
    db.stockMovement.count({ where: { operation: { tenantId } } }),
    db.stockReservation.count({ where: { tenantId } }),
    db.stockCount.count({ where: { tenantId } }),
    db.stockTransfer.count({ where: { tenantId } }),
    db.financePurchaseReceiptLine.count({ where: { bookId } }),
    db.financeInventoryPool.count({ where: { bookId } }),
    db.financeInventoryValuationEvent.count({ where: { bookId } }),
    db.financeSupplierAllocation.count({ where: { bookId } }),
    db.financeSupplierAllocationRelease.count({ where: { bookId } }),
    db.financePeriod.count({ where: { bookId } }),
    db.customer.count({ where: { tenantId } }),
    db.commercialOrder.count({ where: { tenantId } }),
    db.serviceJob.count({ where: { tenantId } }),
    db.assistantActionProposal.count({ where: { tenantId } }),
    db.assistantAttachment.count({ where: { tenantId } }),
    db.assistantRun.count({ where: { conversationId } }),
    db.assistantUsageEvent.count({ where: { tenantId } }),
  ]))
    expect(count).toBe(0)
}

async function cleanup() {
  const { db, tenantId, storeId, userId, conversationId } = fixture
  await noOtherEffects()
  await db.$transaction(
    async (tx) => {
      expect(
        await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      ).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      expect(
        await tx.user.findUniqueOrThrow({ where: { id: userId } }),
      ).toMatchObject({ email: `${fixture.marker}@example.test` })
      expect(await tx.membership.count({ where: { userId } })).toBe(1)
      expect(await tx.store.count({ where: { tenantId } })).toBe(1)
      const links = await tx.assistantWhatsAppLink.findMany({
        where: {
          tenantId,
          storeId,
          userId,
          membershipId: fixture.membershipId,
          confirmedAt: { not: null },
          phoneNumberId: fixture.principal.phoneNumberId,
          claimedSenderId: fixture.principal.senderId,
        },
      })
      expect(links).toHaveLength(1)
      const link = links[0]
      if (!link) throw Error("Exact owned confirmed link is required")
      const chats = await tx.assistantConversation.findMany({
        where: { OR: [{ tenantId }, { ownerUserId: userId }] },
        include: {
          setupDraft: true,
          messages: true,
          _count: { select: { runs: true, proposals: true } },
        },
      })
      expect(chats.map((row) => row.id).sort()).toEqual(
        [conversationId, `wa-linked_${link.id}`].sort(),
      )
      for (const chat of chats) {
        expect(chat).toMatchObject({
          tenantId,
          storeId,
          ownerUserId: userId,
          purpose: "GENERAL",
          status: "ACTIVE",
          setupDraft: null,
          workflowContext: null,
          _count: { runs: 0, proposals: 0 },
        })
        for (const message of chat.messages)
          expect(message.id).toBe(`${fixture.marker}-saved-read-facts`)
      }
      expect(await tx.financeBook.count({ where: { tenantId } })).toBe(1)
      expect(
        await tx.financeBook.findUniqueOrThrow({ where: { id: bookId } }),
      ).toMatchObject({
        tenantId,
        createdById: userId,
        currencyCode: "NGN",
        lastSequence: 2n,
      })
      const suppliers = await tx.financeSupplierAccount.findMany({
        where: { bookId },
      })
      expect(suppliers).toHaveLength(1)
      expect(suppliers[0]).toMatchObject({
        id: supplierId,
        actorUserId: userId,
        code: "READ_INVOICE_ONLY",
        name: supplierName,
      })
      const documents = await tx.financePurchaseRecognition.findMany({
        where: { bookId },
      })
      expect(documents).toHaveLength(1)
      const document = documents[0]
      if (!document) throw Error("Exact owned registration required")
      expect(document).toMatchObject({
        id: recognitionId,
        tenantId,
        supplierId,
        storeId,
        actorUserId: userId,
        agreedAt,
      })
      const lines = await tx.financePurchaseRecognitionLine.findMany({
        where: { bookId },
      })
      expect(lines).toHaveLength(1)
      const line = lines[0]
      if (!line) throw Error("Exact owned agreement line required")
      expect(line).toMatchObject({
        tenantId,
        recognitionId,
        costBillId: document.costBillId,
        balanceSourceId,
        enteredInventoryUnitId,
        configurationVersionId,
      })
      expect(line.enteredQuantity.toFixed()).toBe("2.5")
      const events = await tx.financePurchaseRecognitionEvent.findMany({
        where: { bookId },
      })
      expect(events).toHaveLength(1)
      const event = events[0]
      if (!event) throw Error("Exact invoice event required")
      expect(event).toMatchObject({
        id: invoiceEventId,
        recognitionId,
        supplierId,
        invoiceBillId,
        stage: "INVOICE",
        originalStage: "INVOICE",
        reversalOfId: null,
        reason: null,
        actorUserId: userId,
        effectiveAt: invoiceAt,
        reference: `${fixture.marker}-invoice-source`,
      })
      const bills = await tx.financeBill.findMany({
        where: { bookId },
        orderBy: { id: "asc" },
      })
      expect(bills.map((row) => row.id).sort()).toEqual(
        [document.costBillId, invoiceBillId].sort(),
      )
      for (const bill of bills)
        expect(bill).toMatchObject({
          supplierId,
          storeId,
          actorUserId: userId,
          payeeName: supplierName,
          description,
          totalMinor: 12500n,
          paidMinor: bill.id === invoiceBillId ? 3500n : 0n,
          kind: bill.id === invoiceBillId ? "PURCHASE" : "PURCHASE_ACCRUAL",
        })
      const billLines = await tx.financeBillLine.findMany({ where: { bookId } })
      expect(billLines).toHaveLength(2)
      for (const row of billLines) {
        expect([document.costBillId, invoiceBillId]).toContain(row.billId)
        expect(row.amountMinor).toBe(12500n)
        expect(row.description).toBe(goodsName)
      }
      const payments = await tx.financeBillPayment.findMany({
        where: { bookId },
      })
      expect(payments).toHaveLength(1)
      expect(payments[0]).toMatchObject({
        id: paymentId,
        billId: invoiceBillId,
        accountId: cashId,
        amountMinor: 3500n,
        actorUserId: userId,
        effectiveAt: paidAt,
        reversedAt: null,
      })
      const entries = await tx.financeSupplierEntry.findMany({
        where: { bookId },
      })
      expect(entries).toHaveLength(2)
      for (const entry of entries)
        expect(entry).toMatchObject({
          supplierId,
          actorUserId: userId,
          billId: invoiceBillId,
          reversalOfId: null,
          kind: entry.paymentId ? "PURCHASE_PAYMENT" : "PURCHASE_BILL",
          amountMinor: entry.paymentId ? 3500n : 12500n,
          side: entry.paymentId ? "DEBIT" : "CREDIT",
        })
      const journal = await tx.financeJournalEntry.findMany({
        where: { bookId },
      })
      expect(journal).toHaveLength(2)
      expect(new Set(entries.map((row) => row.journalEntryId))).toEqual(
        new Set(journal.map((row) => row.id)),
      )
      for (const row of journal)
        expect(row).toMatchObject({
          actorUserId: userId,
          storeId,
          sourceKind:
            row.sourceId === invoiceBillId
              ? "PURCHASE_BILL"
              : "PURCHASE_PAYMENT",
        })
      expect(new Set(journal.map((row) => row.sourceId))).toEqual(
        new Set([invoiceBillId, paymentId]),
      )
      const postedLines = await tx.financeJournalLine.findMany({
        where: { bookId },
      })
      expect(postedLines).toHaveLength(4)
      for (const posting of journal) {
        const posted = postedLines.filter((row) => row.entryId === posting.id)
        expect(posted).toHaveLength(2)
        const amount = posting.sourceId === invoiceBillId ? 12500n : 3500n
        expect(posted.reduce((total, row) => total + row.debitMinor, 0n)).toBe(
          amount,
        )
        expect(posted.reduce((total, row) => total + row.creditMinor, 0n)).toBe(
          amount,
        )
      }
      const commandRows = await tx.financeCommand.findMany({
        where: { bookId },
      })
      const expected = new Set([
        commands.supplier,
        commands.register,
        commands.invoice,
        commands.payment,
        financePostingCommandId(commands.invoice, "recognition-journal"),
        financePostingCommandId(commands.payment, "purchase-payment"),
      ])
      expect(new Set(commandRows.map((row) => row.clientCommandId))).toEqual(
        expected,
      )
      for (const row of commandRows) {
        expect(row.actorUserId).toBe(userId)
        const sourceId =
          row.clientCommandId === commands.supplier
            ? supplierId
            : row.clientCommandId === commands.register
              ? recognitionId
              : row.clientCommandId === commands.invoice
                ? invoiceEventId
                : row.clientCommandId === commands.payment
                  ? paymentId
                  : undefined
        if (sourceId)
          expect(z.object({ id: z.string() }).parse(row.result)).toEqual({
            id: sourceId,
          })
        else
          expect(journal.map((posting) => posting.id)).toContain(
            z.object({ entryId: z.string() }).parse(row.result).entryId,
          )
      }
      const sources = await tx.stockBalanceSource.findMany({
        where: { tenantId },
        include: { product: true },
      })
      expect(sources).toHaveLength(1)
      expect(sources[0]).toMatchObject({
        id: balanceSourceId,
        storeId,
        inventoryUnitId: enteredInventoryUnitId,
        revision: 0,
        custodyType: "STORE",
        product: { catalogItemId: itemId },
      })
      expect(sources[0]?.onHandQuantity.toFixed()).toBe("0")
      expect(sources[0]?.reservedQuantity.toFixed()).toBe("0")
      expect(
        (await tx.catalogItem.findMany({ where: { tenantId } })).map(
          (row) => row.id,
        ),
      ).toEqual([itemId])
      for (const row of await tx.catalogCommandReceipt.findMany({
        where: { tenantId },
      }))
        expect(row).toMatchObject({
          catalogItemId: itemId,
          storeId,
          clientOperationId: commands.catalog,
          commandType: "CREATE_CATALOG_ITEM",
        })
      // These direct canonical read-fixture commands never emit business activity.
      // Refuse unexpected rows rather than deleting an actor-only allowlist.
      expect(
        await tx.businessActivityEvent.count({
          where: { OR: [{ tenantId }, { actorUserId: userId }] },
        }),
      ).toBe(0)
      expect(
        await tx.assistantBudget.count({
          where: {
            OR: [
              { scopeKey: { startsWith: `assistant:${tenantId}:GENERAL:` } },
              {
                scopeKey: {
                  in: [
                    assistantBudgetScopeKey(tenantId, "SETUP"),
                    assistantBudgetScopeKey(tenantId, "PRODUCT_CREATE"),
                  ],
                },
              },
            ],
          },
        }),
      ).toBe(0)
      // Only known private objects, all verified above. Recognition edges precede bill/supplier/journal roots.
      await tx.financePurchaseRecognitionEvent.delete({
        where: { id: invoiceEventId },
      })
      await tx.financePurchaseRecognitionLine.delete({ where: { id: line.id } })
      await tx.financePurchaseRecognition.delete({
        where: { id: recognitionId },
      })
      await tx.financeSupplierEntry.deleteMany({
        where: { bookId, id: { in: entries.map((row) => row.id) } },
      })
      await tx.financeBillPayment.delete({ where: { id: paymentId } })
      await tx.financeBillLine.deleteMany({
        where: { bookId, id: { in: billLines.map((row) => row.id) } },
      })
      await tx.financeBill.deleteMany({
        where: { bookId, id: { in: bills.map((row) => row.id) } },
      })
      await tx.financeCommand.deleteMany({
        where: { bookId, id: { in: commandRows.map((row) => row.id) } },
      })
      await tx.financeJournalLine.deleteMany({
        where: { bookId, entryId: { in: journal.map((row) => row.id) } },
      })
      await tx.financeJournalEntry.deleteMany({
        where: { bookId, id: { in: journal.map((row) => row.id) } },
      })
      await tx.financeSupplierAccount.delete({ where: { id: supplierId } })
      await tx.financeAccount.deleteMany({ where: { bookId } })
      await tx.financeBook.delete({ where: { id: bookId } })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      try {
        await cleanup()
      } catch (cause) {
        await fixture.db.$disconnect()
        throw new Error(
          `Purchase read cleanup unverified; retained ${fixture.tenantId}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    restoreFetch?.()
    if (previousRehearsal === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_REHEARSAL_MODE")
    else process.env.ASSISTANT_REHEARSAL_MODE = previousRehearsal
    expect(externalCalls).toBe(0)
  }
}, 90_000)

const result = <S extends z.ZodType>(data: S) =>
  z.object({ status: z.literal("available"), asOf: z.string(), data })

suite("linked invoice-only purchase, supplier and recorded cash facts", () => {
  test("separates exact agreed/invoiced/part-paid/payable and cash facts without inventing ownership or physical receipt", async () => {
    const { db, tenantId, conversationId } = fixture
    const before = await snapshot()
    const answers: GeneralAnswer[] = []
    const ctx = await fixture.context(`${fixture.marker}-reads`)
    expect(ctx.session.session).toBeNull()
    const tools = createGeneralTools(
      ctx,
      conversationId,
      () => {
        throw Error("Reads cannot draft")
      },
      (answer) => answers.push(answer),
    )
    const {
      readPurchaseRegistrations: registrations,
      readPurchaseRecognition: recognition,
      readPurchaseBills: bills,
      readPurchaseBill: bill,
      readSupplierStatement: statement,
      readMoneyAccountBalances: cash,
    } = tools
    if (
      !registrations?.execute ||
      !recognition?.execute ||
      !bills?.execute ||
      !bill?.execute ||
      !statement?.execute ||
      !cash?.execute
    )
      throw Error(
        "All six existing eligible purchase/supplier/balance reads required",
      )
    const start = Date.now()
    const registration = result(
      z.object({
        bookId: z.string(),
        supplierId: z.string(),
        currencyCode: z.string(),
        items: z.array(z.object({ id: z.string(), amountMinor: z.string() })),
        nextCursor: z.null(),
      }),
    ).parse(
      await registrations.execute(
        { bookId, supplierId },
        { toolCallId: "agreement", messages: [] },
      ),
    )
    expect(registration.data).toEqual({
      bookId,
      supplierId,
      currencyCode: "NGN",
      items: [{ id: recognitionId, amountMinor: "12500" }],
      nextCursor: null,
    })
    const original = result(
      z.object({
        id: z.string(),
        invoiceBillId: z.string(),
        amountMinor: z.string(),
        lines: z.array(
          z.object({
            balanceSourceId: z.string(),
            enteredInventoryUnitId: z.string(),
            configurationVersionId: z.string(),
            enteredUnitName: z.string(),
            enteredQuantity: z.string(),
            receiptId: z.null(),
            receipt: z.null(),
          }),
        ),
        events: z.array(
          z.object({
            id: z.string(),
            stage: z.string(),
            invoiceBillId: z.string(),
            reversalOfId: z.null(),
            reversalId: z.null(),
          }),
        ),
      }),
    ).parse(
      await recognition.execute(
        { bookId, recognitionId },
        { toolCallId: "recognition", messages: [] },
      ),
    )
    expect(original.data).toEqual({
      id: recognitionId,
      invoiceBillId,
      amountMinor: "12500",
      lines: [
        {
          balanceSourceId,
          enteredInventoryUnitId,
          configurationVersionId,
          enteredUnitName: "Piece",
          enteredQuantity: "2.5",
          receiptId: null,
          receipt: null,
        },
      ],
      events: [
        {
          id: invoiceEventId,
          stage: "INVOICE",
          invoiceBillId,
          reversalOfId: null,
          reversalId: null,
        },
      ],
    })
    const purchases = result(
      z.object({
        count: z.number(),
        items: z.array(
          z.object({
            id: z.string(),
            totalMinor: z.string(),
            paidMinor: z.string(),
            outstandingMinor: z.string(),
            status: z.string(),
          }),
        ),
        summary: z.object({
          incurredMinor: z.string(),
          paidMinor: z.string(),
          outstandingMinor: z.string(),
          coverage: z.string(),
        }),
        nextCursor: z.null(),
      }),
    ).parse(
      await bills.execute(
        { bookId, supplierId, status: "PARTIAL" },
        { toolCallId: "purchase-page", messages: [] },
      ),
    )
    expect(purchases.data).toEqual({
      count: 1,
      items: [
        {
          id: invoiceBillId,
          totalMinor: "12500",
          paidMinor: "3500",
          outstandingMinor: "9000",
          status: "PARTIAL",
        },
      ],
      summary: {
        incurredMinor: "12500",
        paidMinor: "3500",
        outstandingMinor: "9000",
        coverage: "SETTLED_AGAINST_BILLS",
      },
      nextCursor: null,
    })
    const detail = result(
      z.object({
        id: z.string(),
        recognitionId: z.string(),
        totalMinor: z.string(),
        paidMinor: z.string(),
        cashPaidMinor: z.string(),
        activeAllocatedMinor: z.string(),
        releasedAllocationMinor: z.string(),
        outstandingMinor: z.string(),
        coverage: z.object({ receipts: z.string(), valuation: z.string() }),
        payments: z.array(
          z.object({ id: z.string(), amountMinor: z.string() }),
        ),
        paymentsHasMore: z.boolean(),
        allocationsHasMore: z.boolean(),
        supplierEntriesHasMore: z.boolean(),
      }),
    ).parse(
      await bill.execute(
        { bookId, billId: invoiceBillId },
        { toolCallId: "purchase-original", messages: [] },
      ),
    )
    expect(detail.data).toEqual({
      id: invoiceBillId,
      recognitionId,
      totalMinor: "12500",
      paidMinor: "3500",
      cashPaidMinor: "3500",
      activeAllocatedMinor: "0",
      releasedAllocationMinor: "0",
      outstandingMinor: "9000",
      coverage: {
        receipts: "SEPARATE_RECOGNITION_SOURCE",
        valuation: "SEPARATE_RECOGNITION_SOURCE",
      },
      payments: [{ id: paymentId, amountMinor: "3500" }],
      paymentsHasMore: false,
      allocationsHasMore: false,
      supplierEntriesHasMore: false,
    })
    const supplier = result(
      z.object({
        payableMinor: z.string(),
        advanceMinor: z.string(),
        snapshotSequence: z.string(),
        data: z.array(
          z.object({
            kind: z.string(),
            side: z.string(),
            amountMinor: z.string(),
          }),
        ),
        nextCursor: z.null(),
      }),
    ).parse(
      await statement.execute(
        { bookId, supplierId },
        { toolCallId: "supplier-statement", messages: [] },
      ),
    )
    expect(supplier.data).toEqual({
      payableMinor: "9000",
      advanceMinor: "0",
      snapshotSequence: "2",
      data: [
        { kind: "PURCHASE_PAYMENT", side: "DEBIT", amountMinor: "3500" },
        { kind: "PURCHASE_BILL", side: "CREDIT", amountMinor: "12500" },
      ],
      nextCursor: null,
    })
    const money = result(
      z.object({
        bookId: z.string(),
        snapshotSequence: z.string(),
        accounts: z.array(
          z.object({ id: z.string(), balanceMinor: z.string() }),
        ),
        nextCursor: z.null(),
      }),
    ).parse(
      await cash.execute(
        { bookId },
        { toolCallId: "recorded-cash", messages: [] },
      ),
    )
    expect(money.data.bookId).toBe(bookId)
    expect(money.data.snapshotSequence).toBe("2")
    expect(
      money.data.accounts.find((row) => row.id === cashId)?.balanceMinor,
    ).toBe("-3500")
    const end = Date.now()
    for (const answer of answers) {
      expect(Date.parse(answer.asOf)).toBeGreaterThanOrEqual(start)
      expect(Date.parse(answer.asOf)).toBeLessThanOrEqual(end)
    }
    // Only primitive assertions touch cards: Bun asymmetric matchers can mutate raw values.
    expect(
      answers.some(
        (answer) => answer.value === `${generalMoney("12500", "NGN")} agreed`,
      ),
    ).toBe(true)
    expect(
      answers.some(
        (answer) => answer.value === `${generalMoney("9000", "NGN")} payable`,
      ),
    ).toBe(true)
    const facts = answers.map((answer) => answer.detail ?? "").join("\n")
    for (const exact of [
      "INVOICE: active recorded event",
      "OWNERSHIP: no active recorded event",
      "RECEIPT: no active recorded event",
      `recorded cash payments ${generalMoney("3500", "NGN")}`,
      "inspect the separate recognition record",
      "not proof of bank/provider settlement",
      "not checked against a bank balance or a cash count",
    ])
      expect(facts).toContain(exact)
    expect(await snapshot()).toEqual(before)
    await noOtherEffects()
    const hints = answers.flatMap((answer) => {
      const hint = parseGeneralReadContinuation(answer.continuation)
      return hint ? [hint] : []
    })
    expect(hints).toEqual([
      {
        version: 1,
        tool: "readPurchaseRegistrations",
        input: { bookId, supplierId },
        nextCursor: null,
      },
      {
        version: 1,
        tool: "readPurchaseBills",
        input: { bookId, supplierId, status: "PARTIAL" },
        nextCursor: null,
      },
      {
        version: 1,
        tool: "readSupplierStatement",
        input: { bookId, supplierId, snapshotSequence: "2" },
        nextCursor: null,
      },
      {
        version: 1,
        tool: "readMoneyAccountBalances",
        input: { bookId },
        nextCursor: null,
      },
    ])
    for (const hint of hints)
      expect(nextGeneralReadRequest(hint)).toBeUndefined()
    const parts = z
      .array(z.json())
      .parse(
        generalPersistentParts(
          answers.map((data) => ({ type: "data-general-answer", data })),
        ),
      )
    const messageId = `${fixture.marker}-saved-read-facts`
    await db.$transaction((tx) =>
      appendAssistantMessage(tx, {
        conversationId,
        message: { id: messageId, role: "assistant", parts },
      }),
    )
    const saved = await db.assistantMessage.findUniqueOrThrow({
      where: { id: messageId },
    })
    const restored = z.array(generalStoredPartSchema).parse(saved.parts)
    expect(
      restored.flatMap((part) =>
        part.type === "data-general-answer" ? [part.data] : [],
      ),
    ).toEqual(answers)
    const history = generalReadContinuationContext([
      { role: "assistant", parts: restored },
    ])
    expect(history).toContain(`"supplierId":"${supplierId}"`)
    expect(history).toContain('"snapshotSequence":"2"')
    expect(history).toContain('"next":null')
    const rendered = renderWhatsAppFinalReply(restored)
    expect(rendered.kind).toBe("reply")
    const text = rendered.chunks.join("\n")
    for (const exact of [
      generalMoney("12500", "NGN"),
      generalMoney("3500", "NGN"),
      generalMoney("9000", "NGN"),
      generalMoney("-3500", "NGN"),
      "OWNERSHIP: no active recorded event",
      "RECEIPT: no active recorded event",
    ])
      expect(text).toContain(exact)
    answers.length = 0
    expect(
      await disconnectAssistantWhatsApp(db, {
        phoneNumberId: fixture.principal.phoneNumberId,
        senderId: fixture.principal.senderId,
      }),
    ).toEqual({ disconnected: true })
    expect(
      z
        .object({ status: z.string() })
        .parse(
          await bill.execute(
            { bookId, billId: invoiceBillId },
            { toolCallId: "revoked-bill", messages: [] },
          ),
        ).status,
    ).toBe("unavailable")
    expect(answers).toHaveLength(1)
    expect(answers[0]?.value).toBe("Unavailable")
    expect(answers[0]?.detail).toBe(
      "This read could not be completed for your current access and setup. No value or zero balance has been inferred. Check the saved record or try again.",
    )
    const denied = JSON.stringify(answers)
    for (const secret of [
      invoiceBillId,
      recognitionId,
      supplierId,
      generalMoney("12500", "NGN"),
      generalMoney("9000", "NGN"),
      generalMoney("3500", "NGN"),
    ])
      expect(denied).not.toContain(secret)
    expect(await snapshot()).toEqual(before)
    await noOtherEffects()
    expect(
      await db.assistantRun.count({ where: { conversation: { tenantId } } }),
    ).toBe(0)
  }, 300_000)
})
