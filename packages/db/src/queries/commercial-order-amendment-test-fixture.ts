import type { Prisma } from "../../generated/prisma/client"
export function orderAmendmentFixture() {
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    reservedQuantity: "3",
    onHandQuantity: "8",
    revision: 1,
  }
  const reservation = {
    id: "reservation",
    tenantId: "tenant",
    storeId: "store",
    commercialOrderLineId: "line",
    balanceSourceId: "balance",
    balanceSource: balance,
    status: "ACTIVE",
    committedAt: null,
    committedOperationId: null,
    enteredQuantity: "2",
    canonicalQuantity: "2",
    unitFactorSnapshot: "1",
    enteredInventoryUnit: { stockBehavior: "ALTERNATE_TRANSACTION" },
  }
  const row = {
    id: "order",
    tenantId: "tenant",
    storeId: "store",
    currencyCode: "NGN",
    customerId: null as string | null,
    customerName: null as string | null,
    customerPhone: null as string | null,
    customerEmail: null as string | null,
    notes: "Original instructions" as string | null,
    deliveryDueAt: null as Date | null,
    orderNumber: "ORD-1",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    amountPaidMinor: 0,
    totalMinor: 100,
    updatedAt: new Date("2026-10-10T00:00:00Z"),
    store: { status: "ACTIVE" },
    acceptedQuoteVersion: null,
    acceptedCommerceQuoteVersion: null,
    serviceIntake: null,
    prescriptionPickupFulfillment: null,
    prescriptionDeliveryAddress: null,
    prescriptionDeliveryAssignment: null,
    _count: {
      lines: 1,
      payments: 0,
      ledgerEntries: 0,
      returns: 0,
      serviceAuthorizations: 0,
      serviceFulfillments: 0,
      serviceJobs: 0,
      prescriptionPaymentIntents: 0,
      serviceBookings: 0,
    },
    lines: [
      {
        id: "line",
        orderId: "order",
        offeringId: "offering",
        kind: "PRODUCT_UNIT",
        quantity: "2",
        snapshot: {
          orderLineId: "line",
          offeringId: "offering",
          offeringKind: "PRODUCT_UNIT",
          quantity: "2",
        },
        stockReservation: reservation,
        _count: { productFulfillments: 0, serviceJobLines: 0 },
      },
    ],
  }
  const events: string[] = []
  let saved: Record<string, unknown> | null = null
  const customer = {
    id: "customer",
    tenantId: "tenant",
    name: "QA customer",
    phone: null as string | null,
    email: null as string | null,
    updatedAt: new Date("2026-10-10T00:00:00Z"),
  }
  const tx = {
    customer: {
      findFirst: async ({
        where,
      }: { where: { id: string; tenantId: string } }) =>
        where.id === customer.id && where.tenantId === customer.tenantId
          ? customer
          : null,
    },
    commercialOrder: {
      findFirst: async () => row,
      update: async ({ data }: { data: { status: string } }) => {
        events.push("cancel")
        Object.assign(row, data)
        return row
      },
    },
    commercialOrderAmendment: {
      findUnique: async () => saved,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("receipt")
        saved = { id: "amendment", ...data }
        return saved
      },
    },
    stockReservation: {
      findFirst: async () => reservation,
      update: async ({ data }: { data: { status: string } }) => {
        events.push("release")
        Object.assign(reservation, data)
        return reservation
      },
    },
    stockBalanceSource: {
      updateMany: async ({ data }: { data: { reservedQuantity: string } }) => {
        events.push("balance")
        balance.reservedQuantity = data.reservedQuantity
        balance.revision++
        return { count: 1 }
      },
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?")
      if (sql.includes('FROM "FinanceBook"')) {
        events.push("lock:book")
        return []
      }
      if (sql.includes('FROM "CustomerLedgerAccount"')) return []
      if (sql.includes('FROM "Customer"')) return [{ id: customer.id }]
      if (sql.includes('FROM "CommercialOrder"')) {
        events.push("lock:order")
        return [{ id: "order" }]
      }
      if (sql.includes('FROM "StockReservation"')) {
        events.push("lock:reservation")
        return [
          { id: "reservation", storeId: "store", balanceSourceId: "balance" },
        ]
      }
      if (sql.includes('FROM "StockBalanceSource"')) {
        events.push("lock:balance")
        return [{ id: "balance" }]
      }
      throw Error("Unexpected query")
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    row,
    customer,
    reservation,
    balance,
    events,
    readReceipt: () => saved,
  }
}
