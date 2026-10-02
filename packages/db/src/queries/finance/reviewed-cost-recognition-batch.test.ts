import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { loadReviewedCostPurchaseRecognitions } from "./reviewed-cost-recognition"

function fixture(size = 1) {
  const calls: string[] = []
  const date = new Date("2026-09-02T12:00:00Z")
  const inventory = {
    id: "inventory",
    bookId: "book",
    code: "1300",
    kind: "ASSET",
    purpose: "INVENTORY",
    archivedAt: null,
  }
  const grni = {
    id: "grni",
    bookId: "book",
    code: "2050",
    kind: "LIABILITY",
    purpose: "OTHER",
    archivedAt: null,
  }
  const documents = Array.from({ length: size }, (_, i) => {
    const cost = {
      id: `cost-line-${i}`,
      bookId: "book",
      billId: `bill-${i}`,
      accountId: inventory.id,
      position: 0,
      amountMinor: 100n,
    }
    return {
      id: `document-${i}`,
      tenantId: "tenant",
      bookId: "book",
      costBillId: `bill-${i}`,
      supplierId: "supplier",
      storeId: "store",
      actorUserId: "agreement-user",
      agreedAt: date,
      costBill: {
        id: `bill-${i}`,
        bookId: "book",
        kind: "PURCHASE_ACCRUAL",
        voidedAt: null,
        paidMinor: 0n,
        storeId: "store",
        supplierId: "supplier",
        actorUserId: "agreement-user",
        incurredAt: date,
        totalMinor: 100n,
        description: "Purchase",
        lines: [cost],
      },
      lines: [
        {
          id: `goods-${i}`,
          tenantId: "tenant",
          bookId: "book",
          recognitionId: `document-${i}`,
          costBillId: `bill-${i}`,
          costBillLineId: cost.id,
          costBillLine: cost,
        },
      ],
      events: [
        {
          id: `receipt-stage-${i}`,
          bookId: "book",
          recognitionId: `document-${i}`,
          supplierId: "supplier",
          stage: "RECEIPT",
          originalStage: "RECEIPT",
          reversalOfId: null,
          reason: null,
          invoiceBillId: null,
          invoiceBill: null,
          debitAccountId: "inventory",
          creditAccountId: "grni",
          actorUserId: "receipt-user",
          effectiveAt: date,
          reversal: null,
          journalEntry: {
            id: `journal-${i}`,
            sourceKind: "PURCHASE_RECEIPT_RECOGNITION",
            sourceId: `receipt-stage-${i}`,
            actorUserId: "receipt-user",
            effectiveAt: date,
            storeId: "store",
            description: "Purchase",
            sequence: BigInt(i + 1),
            reversalOfId: null,
            reversal: null,
            lines: [
              { accountId: "inventory", debitMinor: 100n, creditMinor: 0n },
              { accountId: "grni", debitMinor: 0n, creditMinor: 100n },
            ],
          },
        },
      ],
    }
  })
  const stores = [{ id: "store", tenantId: "tenant", currencyCode: "NGN" }]
  // Deliberately tiny persistence double; the production source types remain strict.
  const tx = {
    financePurchaseRecognition: {
      findMany: async () => {
        calls.push("documents")
        return documents
      },
    },
    financeAccount: {
      findMany: async () => {
        calls.push("controls")
        return [inventory, grni]
      },
    },
    store: {
      findMany: async () => {
        calls.push("stores")
        return stores
      },
    },
  } as unknown as Prisma.TransactionClient
  const input = {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    costBillIds: documents.map((row) => row.costBillId),
  }
  return { tx, input, documents, inventory, grni, stores, calls }
}
test("all 4096 complete recognition owners require three repository reads", async () => {
  const f = fixture(4096)
  const result = await loadReviewedCostPurchaseRecognitions(f.tx, f.input)
  expect(result.size).toBe(4096)
  expect(f.calls).toEqual(["documents", "controls", "stores"])
})
test("empty recognition scope makes no reads", async () => {
  const f = fixture(0)
  expect((await loadReviewedCostPurchaseRecognitions(f.tx, f.input)).size).toBe(
    0,
  )
  expect(f.calls).toEqual([])
})
for (const [name, mutate] of [
  [
    "missing requested owner",
    (f) => {
      f.documents.pop()
    },
  ],
  [
    "crossed owner Book",
    (f) => {
      const row = f.documents[0]
      if (row) row.bookId = "other"
    },
  ],
  [
    "crossed cost line",
    (f) => {
      const row = f.documents[0]?.lines[0]
      if (row) row.costBillLine.bookId = "other"
    },
  ],
  [
    "missing complete goods",
    (f) => {
      const row = f.documents[0]
      if (row) row.lines.pop()
    },
  ],
  [
    "changed total",
    (f) => {
      const row = f.documents[0]
      if (row) row.costBill.totalMinor = 101n
    },
  ],
  [
    "archived control",
    (f) => {
      Object.assign(f.inventory, { archivedAt: new Date() })
    },
  ],
  [
    "crossed credit control",
    (f) => {
      f.grni.bookId = "other"
    },
  ],
  [
    "changed original journal",
    (f) => {
      const row = f.documents[0]?.events[0]?.journalEntry.lines[0]
      if (row) row.debitMinor = 99n
    },
  ],
  [
    "foreign Store",
    (f) => {
      const row = f.stores[0]
      if (row) row.tenantId = "other"
    },
  ],
  [
    "changed currency",
    (f) => {
      const row = f.stores[0]
      if (row) row.currencyCode = "USD"
    },
  ],
] satisfies Array<[string, (f: ReturnType<typeof fixture>) => void]>) {
  test(`complete recognition batch rejects ${name}`, async () => {
    const f = fixture()
    mutate(f)
    await expect(
      loadReviewedCostPurchaseRecognitions(f.tx, f.input),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
}
