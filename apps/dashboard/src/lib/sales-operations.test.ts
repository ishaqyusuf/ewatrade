import { describe, expect, test } from "bun:test"
import {
  type DashboardSaleRow,
  type DashboardSessionRow,
  canManageSalesReports,
  canUseSalesOperations,
  filterSalesRows,
  formatMinorAmount,
  getPaymentLabel,
  getSaleCustomerLabel,
  getSaleProductSummary,
  getSalesActorScope,
  getSessionVarianceMinor,
} from "./sales-operations"

const sale: DashboardSaleRow = {
  createdAt: "2026-07-14T00:00:00.000Z",
  currencyCode: "NGN",
  customer: {
    email: null,
    name: "Amina Buyer",
    phone: null,
  },
  id: "sale_1",
  lines: [
    {
      productName: "Premium Rice",
      quantity: 2,
      totalMinor: 840000,
      unitName: "Bag",
    },
  ],
  orderNumber: "ORD-001",
  payment: {
    method: "cash",
    state: "PAID",
  },
  paymentStatus: "PAID",
  status: "COMPLETED",
  totalMinor: 840000,
}

const session: DashboardSessionRow = {
  closedAt: "2026-07-14T10:00:00.000Z",
  expectedCashMinor: 100000,
  id: "session_1",
  openedAt: "2026-07-14T08:00:00.000Z",
  payments: {
    cardMinor: 5000,
    cashMinor: 100000,
    creditMinor: 0,
    grossMinor: 105000,
    receiptCount: 2,
    transferMinor: 0,
  },
  review: null,
  status: "CLOSED",
  user: {
    displayName: "Cashier",
    email: "cashier@example.com",
    id: "user_1",
  },
  variance: {
    cardMinor: 0,
    cashMinor: -500,
    creditMinor: null,
    transferMinor: 250,
  },
}

describe("sales operations helpers", () => {
  test("applies POS and manager-level read scopes", () => {
    expect(canUseSalesOperations("OWNER")).toBe(true)
    expect(canUseSalesOperations("CASHIER")).toBe(true)
    expect(canUseSalesOperations("MEMBER")).toBe(false)
    expect(canManageSalesReports("MANAGER")).toBe(true)
    expect(canManageSalesReports("CASHIER")).toBe(false)
    expect(getSalesActorScope("MANAGER", "user_1")).toBeUndefined()
    expect(getSalesActorScope("CASHIER", "user_1")).toBe("user_1")
  })

  test("formats money, payments, customer, product, and variance", () => {
    expect(formatMinorAmount(840000)).toContain("8,400.00")
    expect(getPaymentLabel("partially_paid")).toBe("Partially Paid")
    expect(getSaleCustomerLabel(sale)).toBe("Amina Buyer")
    expect(getSaleProductSummary(sale)).toBe("Premium Rice - 2 Bag")
    expect(getSessionVarianceMinor(session)).toBe(-250)
  })

  test("filters sales by search and status", () => {
    expect(filterSalesRows([sale], { search: "rice" })).toHaveLength(1)
    expect(filterSalesRows([sale], { status: "paid" })).toHaveLength(1)
    expect(filterSalesRows([sale], { search: "unknown" })).toHaveLength(0)
  })
})
