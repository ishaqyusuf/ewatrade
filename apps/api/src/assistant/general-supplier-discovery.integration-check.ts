import { randomUUID } from "node:crypto"
import { expect } from "bun:test"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"

/** Read-only real tool calls against the caller's classified QA Book and saved sources. */
export async function verifySupplierPurchaseDiscovery(
  ctx: GeneralContext,
  fixture: {
    conversationId: string
    bookId: string
    supplierId: string
    supplierCode: string
    recognitionId: string
    billId: string
    advanceEntryId: string
    moneyAccountId: string
    payableMinor: string
    advanceMinor: string
    cashPaidMinor: string
    allocatedMinor: string
  },
) {
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  await db.financeBook.findFirstOrThrow({
    where: { id: fixture.bookId, tenantId, tenant: { dataClassification: "QA" } },
    select: { id: true },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: fixture.conversationId,
      tenantId,
      ownerUserId: ctx.session.user.id,
      storeId: ctx.tenantContext.activeStore?.id,
      purpose: "GENERAL",
    },
    select: { id: true },
  })
  const facts = async () => ({
    books: await db.financeBook.count({ where: { tenantId } }),
    journals: await db.financeJournalEntry.count({ where: { bookId: fixture.bookId } }),
    commands: await db.financeCommand.count({ where: { bookId: fixture.bookId } }),
    proposals: await db.assistantActionProposal.count({
      where: { tenantId, conversationId: fixture.conversationId },
    }),
    stocks: (
      await db.stockBalanceSource.findMany({
        where: { tenantId, storeId: ctx.tenantContext.activeStore?.id },
        select: { id: true, revision: true, onHandQuantity: true, reservedQuantity: true },
        orderBy: { id: "asc" },
      })
    ).map((stock) => ({
      ...stock,
      onHandQuantity: stock.onHandQuantity.toFixed(),
      reservedQuantity: stock.reservedQuantity.toFixed(),
    })),
  })
  const before = await facts()
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    ctx,
    fixture.conversationId,
    () => { throw Error("A read created a proposal") },
    (answer) => answers.push(answer),
  )
  const results: Record<string, unknown> = {}
  async function read(name: string, input: unknown) {
    const execute = tools[name]?.execute
    if (!execute) throw Error(`Missing supplier discovery tool: ${name}`)
    return execute(input, { toolCallId: randomUUID(), messages: [] })
  }
  results.suppliers = await read("readSuppliers", { query: fixture.supplierCode })
  expect(results.suppliers).toMatchObject({
    status: "available",
    data: {
      bookId: fixture.bookId,
      data: [expect.objectContaining({ id: fixture.supplierId, bookId: fixture.bookId })],
    },
  })
  const book = { bookId: fixture.bookId }
  results.emptySuppliers = await read("readSuppliers", { query: randomUUID() })
  expect(results.emptySuppliers).toMatchObject({
    status: "available", data: { bookId: fixture.bookId, data: [] },
  })
  results.statement = await read("readSupplierStatement", { ...book, supplierId: fixture.supplierId })
  expect(results.statement).toMatchObject({
    status: "available",
    data: {
      payableMinor: fixture.payableMinor,
      advanceMinor: fixture.advanceMinor,
      data: expect.arrayContaining([expect.objectContaining({ id: fixture.advanceEntryId, kind: "ADVANCE" })]),
    },
  })
  results.purchaseBills = await read("readPurchaseBills", { ...book, supplierId: fixture.supplierId, status: "PARTIAL" })
  expect(results.purchaseBills).toMatchObject({
    status: "available",
    data: { items: [expect.objectContaining({ id: fixture.billId, outstandingMinor: fixture.payableMinor })] },
  })
  results.purchaseBill = await read("readPurchaseBill", { ...book, billId: fixture.billId })
  expect(results.purchaseBill).toMatchObject({
    status: "available",
    data: {
      id: fixture.billId,
      supplier: { id: fixture.supplierId },
      recognitionId: fixture.recognitionId,
      cashPaidMinor: fixture.cashPaidMinor,
      activeAllocatedMinor: fixture.allocatedMinor,
      outstandingMinor: fixture.payableMinor,
      allocations: [expect.objectContaining({ advanceEntryId: fixture.advanceEntryId })],
    },
  })
  results.registrations = await read("readPurchaseRegistrations", { ...book, supplierId: fixture.supplierId })
  expect(results.registrations).toMatchObject({
    status: "available",
    data: { items: [expect.objectContaining({ id: fixture.recognitionId })] },
  })
  results.recognition = await read("readPurchaseRecognition", { ...book, recognitionId: fixture.recognitionId })
  expect(results.recognition).toMatchObject({
    status: "available",
    data: {
      id: fixture.recognitionId,
      invoiceBillId: fixture.billId,
      events: expect.arrayContaining(["INVOICE", "OWNERSHIP", "RECEIPT"].map((stage) =>
        expect.objectContaining({ stage, reversalOfId: null, reversalId: null }),
      )),
    },
  })
  results.moneyAccounts = await read("readMoneyAccounts", book)
  expect(results.moneyAccounts).toMatchObject({
    status: "available",
    data: { book: { id: fixture.bookId }, accounts: expect.arrayContaining([
      expect.objectContaining({ id: fixture.moneyAccountId }),
    ]) },
  })
  const missing = randomUUID()
  for (const [name, input] of [
    ["readSuppliers", { bookId: missing }],
    ["readSupplierStatement", { ...book, supplierId: missing }],
    ["readPurchaseBill", { ...book, billId: missing }],
    ["readPurchaseRecognition", { ...book, recognitionId: missing }],
  ] as const) {
    const result = await read(name, input)
    expect(result).toMatchObject({ status: "unavailable" })
    results[`missing_${name}`] = result
  }
  const after = await facts()
  expect(after).toEqual(before)
  return { verified: true, results, answers, before, after }
}
