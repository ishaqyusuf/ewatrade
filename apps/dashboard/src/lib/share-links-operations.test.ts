import { describe, expect, test } from "bun:test"
import {
  type DashboardProductShareLink,
  type DashboardSharedLinkOrderRequest,
  canManageAllShareLinks,
  canUseShareLinks,
  filterShareLinks,
  filterSharedOrders,
  formatShareLinkAmount,
  formatShareLinkLabel,
  getShareLinkCustomerLabel,
  getSharedOrderProductLabel,
} from "@/lib/share-links-operations"

const link: DashboardProductShareLink = {
  active: true,
  createdAt: "2026-07-14T00:00:00.000Z",
  createdByUserId: "user_1",
  deactivatedAt: null,
  id: "link_1",
  label: "Main catalog link",
  lastActivityAt: "2026-07-14T00:00:00.000Z",
  orderCount: 2,
  product: {
    id: "product_1",
    name: "Rice Bag",
    slug: "rice-bag",
  },
  token: "token_1",
  url: "https://store.test/rice-bag?share=token_1",
  viewCount: 10,
}

const order: DashboardSharedLinkOrderRequest = {
  createdAt: "2026-07-14T00:00:00.000Z",
  currencyCode: "NGN",
  customer: {
    email: "a@example.com",
    name: "Ada",
    phone: null,
  },
  fulfillment: {
    fulfilledAt: null,
    method: "delivery",
    note: null,
    status: "pending",
  },
  id: "order_1",
  line: {
    productName: "Rice Bag",
    quantity: 2,
    totalMinor: 100_000,
    unitName: "Bag",
    unitPriceMinor: 50_000,
  },
  notification: {
    status: "queued",
  },
  orderNumber: "ORD-1",
  paymentState: "pending",
  paymentStatus: "PENDING",
  reservation: {
    quantity: 2,
    status: "reserved",
  },
  shareLink: {
    id: "link_1",
    label: "Main catalog link",
    url: "https://store.test/rice-bag?share=token_1",
  },
  status: "PENDING",
  totalMinor: 100_000,
  updatedAt: "2026-07-14T00:00:00.000Z",
}

describe("share link dashboard helpers", () => {
  test("applies POS and manager-level permissions", () => {
    expect(canUseShareLinks("CASHIER")).toBe(true)
    expect(canUseShareLinks("MEMBER")).toBe(false)
    expect(canManageAllShareLinks("MANAGER")).toBe(true)
    expect(canManageAllShareLinks("OPERATOR")).toBe(false)
  })

  test("formats labels, money, customer, and product summaries", () => {
    expect(formatShareLinkAmount(123_456, "NGN")).toContain("1,234.56")
    expect(formatShareLinkLabel("ready_for_pickup")).toBe("Ready For Pickup")
    expect(getShareLinkCustomerLabel(order)).toBe("Ada")
    expect(getSharedOrderProductLabel(order)).toBe("Rice Bag - 2 Bag")
  })

  test("filters links and shared orders", () => {
    expect(filterShareLinks([link], { search: "rice" })).toHaveLength(1)
    expect(filterShareLinks([link], { status: "inactive" })).toHaveLength(0)
    expect(filterSharedOrders([order], { search: "ada" })).toHaveLength(1)
    expect(filterSharedOrders([order], { status: "COMPLETED" })).toHaveLength(0)
  })
})
