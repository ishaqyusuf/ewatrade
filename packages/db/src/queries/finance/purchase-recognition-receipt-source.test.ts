import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  getPurchaseRecognitionReceiptDate,
  getPurchaseRecognitionReceiptDates,
} from "./purchase-recognition-receipt-source"

const agreedAt = new Date("2026-09-01T12:00:00.123Z")
const receivedAt = new Date("2026-09-03T12:00:00.456Z")
const decimal = (value: string) => ({ toFixed: () => value })
function fixture() {
  let ownerReads = 0
  const controls = [
    {
      id: "inventory",
      bookId: "book",
      code: "1300",
      name: "Inventory",
      kind: "ASSET",
      purpose: "INVENTORY",
      archivedAt: null,
    },
    {
      id: "grni",
      bookId: "book",
      code: "2050",
      name: "Goods awaiting invoice",
      kind: "LIABILITY",
      purpose: "OTHER",
      archivedAt: null,
    },
  ]
  const costs = [50n, 75n].map((amountMinor, position) => ({
    id: `cost-${position}`,
    bookId: "book",
    billId: "cost",
    position,
    accountId: "inventory",
    description: `Goods ${position}`,
    amountMinor,
  }))
  const lines = costs.map((costBillLine, i) => ({
    id: `line-${i}`,
    tenantId: "tenant",
    bookId: "book",
    recognitionId: "agreement",
    costBillId: "cost",
    costBillLineId: costBillLine.id,
    costBillLine,
    balanceSourceId: `balance-${i}`,
    configurationVersionId: `config-${i}`,
    enteredInventoryUnitId: `unit-${i}`,
    enteredQuantity: decimal(String(i + 2)),
  }))
  const event = {
    id: "receipt-event",
    originalStage: "RECEIPT",
    stage: "RECEIPT",
    supplierId: "supplier",
    reversalOfId: null,
    reversal: null,
    reason: null,
    invoiceBillId: null,
    actorUserId: "receiver",
    effectiveAt: receivedAt,
    debitAccountId: "inventory",
    creditAccountId: "grni",
    journalEntry: {
      id: "journal",
      sequence: 1n,
      reversal: null,
      reversalOfId: null,
      sourceKind: "PURCHASE_RECEIPT_RECOGNITION",
      sourceId: "receipt-event",
      actorUserId: "receiver",
      effectiveAt: receivedAt,
      storeId: "store",
      description: "Original goods",
      lines: [
        { accountId: "inventory", debitMinor: 125n, creditMinor: 0n },
        { accountId: "grni", debitMinor: 0n, creditMinor: 125n },
      ],
    },
  }
  const document = {
    id: "agreement",
    tenantId: "tenant",
    bookId: "book",
    supplierId: "supplier",
    storeId: "store",
    actorUserId: "owner",
    costBillId: "cost",
    agreedAt,
    costBill: {
      id: "cost",
      bookId: "book",
      supplierId: "supplier",
      storeId: "store",
      actorUserId: "owner",
      kind: "PURCHASE_ACCRUAL",
      paidMinor: 0n,
      voidedAt: null,
      incurredAt: agreedAt,
      totalMinor: 125n,
      description: "Original goods",
      lines: costs,
    },
    lines,
    events: [event],
  }
  const movements = lines.map((line, i) => ({
    id: `movement-${i}`,
    balanceSourceId: line.balanceSourceId,
    enteredInventoryUnitId: line.enteredInventoryUnitId,
    configurationVersionId: line.configurationVersionId,
    enteredQuantity: line.enteredQuantity,
    operation: {
      actorUserId: "receiver",
      effectiveAt: receivedAt,
      tenantId: "tenant",
      storeId: "store",
    },
  }))
  const owners = [{ id: "agreement", costBillId: "cost" }]
  const tx = {
    financePurchaseRecognition: {
      findMany: async (args: unknown) => {
        expect(args).toMatchObject({
          where: {
            tenantId: "tenant",
            bookId: "book",
            costBillId: { in: ["cost"] },
          },
          take: 11,
        })
        return owners
      },
      findUnique: async () => owners[0],
      findFirst: async () => {
        ownerReads++
        return document
      },
    },
    financeAccount: {
      findUnique: async ({
        where,
      }: { where: { bookId_code: { code: string } } }) =>
        controls.find((c) => c.code === where.bookId_code.code),
    },
    financeBook: { findUniqueOrThrow: async () => ({ currencyCode: "NGN" }) },
    store: { findFirst: async () => ({ id: "store" }) },
    stockMovement: {
      findMany: async () => movements,
      findUnique: async ({ where }: { where: { id: string } }) =>
        movements.find((m) => m.id === where.id),
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    controls,
    document,
    movements,
    owners,
    get ownerReads() {
      return ownerReads
    },
  }
}
const input = {
  tenantId: "tenant",
  bookId: "book",
  actorUserId: "receiver",
  receipts: [0, 1].map((i) => ({
    costBillId: "cost",
    costBillLineId: `cost-${i}`,
    stockMovementId: `movement-${i}`,
  })),
}

test("two receipt lines share one complete owner proof and retain the physical actor/date", async () => {
  const f = fixture()
  const dates = await getPurchaseRecognitionReceiptDates(f.tx, input)
  expect([...dates.entries()]).toEqual([
    ["movement-0", receivedAt],
    ["movement-1", receivedAt],
  ])
  expect(f.ownerReads).toBe(1)
  expect(f.document.actorUserId).not.toBe(input.actorUserId)
  expect(receivedAt).not.toEqual(agreedAt)
})

test("batch and existing single receipt proof agree on every original line", async () => {
  const f = fixture()
  const dates = await getPurchaseRecognitionReceiptDates(f.tx, input)
  for (const receipt of input.receipts) {
    const date = dates.get(receipt.stockMovementId)
    if (!date) throw Error("The batch missed an original movement")
    expect(
      await getPurchaseRecognitionReceiptDate(f.tx, { ...input, ...receipt }),
    ).toEqual(date)
  }
})

test("batch rejects changed goods, dated actor, scope and immutable receipt journal", async () => {
  const changes = [
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.enteredQuantity = decimal("4")
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.enteredInventoryUnitId = "other"
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.configurationVersionId = "old"
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.balanceSourceId = "other"
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.operation.actorUserId = "owner"
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.operation.effectiveAt = agreedAt
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.operation.tenantId = "other"
    },
    (f: ReturnType<typeof fixture>) => {
      f.movements[1]!.operation.storeId = "other"
    },
    (f: ReturnType<typeof fixture>) => {
      f.document.events[0]!.journalEntry.lines[0]!.debitMinor = 124n
    },
    (f: ReturnType<typeof fixture>) => {
      f.controls[1]!.purpose = "PAYABLE"
    },
    (f: ReturnType<typeof fixture>) => {
      f.document.costBill.totalMinor = 126n
    },
  ]
  for (const change of changes) {
    const f = fixture()
    change(f)
    await expect(
      getPurchaseRecognitionReceiptDates(f.tx, input),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }
})

test("batch refuses duplicate, oversized and missing original sources", async () => {
  for (const receipts of [
    [],
    [input.receipts[0]!, input.receipts[0]!],
    Array.from({ length: 11 }, (_, i) => ({
      costBillId: "cost",
      costBillLineId: `cost-${i}`,
      stockMovementId: `movement-${i}`,
    })),
  ])
    await expect(
      getPurchaseRecognitionReceiptDates(fixture().tx, { ...input, receipts }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  const owner = fixture()
  owner.owners.pop()
  await expect(
    getPurchaseRecognitionReceiptDates(owner.tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const movement = fixture()
  movement.movements.pop()
  await expect(
    getPurchaseRecognitionReceiptDates(movement.tx, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
