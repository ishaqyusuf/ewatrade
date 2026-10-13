import { describe, expect, test } from "bun:test"
import {
  type OrderChangeApproval,
  approvalMenuMeta,
  hasOpenApproval,
  orderApprovalBanners,
  returnNeedsApproval,
} from "./order-change-approval-model"

const approval = (
  patch: Partial<OrderChangeApproval> = {},
): OrderChangeApproval => ({
  amountMinor: 15_000,
  currencyCode: "NGN",
  customerName: "Ada",
  decidedAt: null,
  decidedBy: null,
  decisionNote: null,
  expiresAt: new Date("2026-10-13T23:00:00Z"),
  id: "approval-1",
  kind: "return",
  orderId: "order-1",
  orderNumber: "ORD-040",
  payload: { lines: [], money: null, reason: "Customer returned it" },
  reason: "Customer returned it",
  requestedAt: new Date("2026-10-13T14:10:00Z"),
  requestedBy: "Musa",
  requestedByUserId: "user-musa",
  status: "pending",
  summary: "1 × Eggs (back on shelf) · stock only",
  ...patch,
})

const returnLine = (patch: {
  ask?: boolean
  moneyAsk?: boolean
  cashBackAsk?: boolean
}) => ({
  returnLine: {
    allowed: true,
    ask: patch.ask ?? false,
    cashBack: { ask: patch.cashBackAsk ?? false, lockedReason: null },
    lines: [],
    money: { ask: patch.moneyAsk ?? false, lockedReason: null },
    reason: null,
  },
})

describe("order change approvals", () => {
  test("a return asks when returns, its money or its cash back need approval", () => {
    expect(
      returnNeedsApproval(returnLine({}), { cashBack: true, withMoney: true }),
    ).toBe(false)
    expect(
      returnNeedsApproval(returnLine({ ask: true }), {
        cashBack: false,
        withMoney: false,
      }),
    ).toBe(true)
    const cashBackOnly = returnLine({ cashBackAsk: true })
    expect(
      returnNeedsApproval(cashBackOnly, { cashBack: false, withMoney: true }),
    ).toBe(false)
    expect(
      returnNeedsApproval(cashBackOnly, { cashBack: true, withMoney: true }),
    ).toBe(true)
  })

  test("approvers see each waiting request; requesters see their own", () => {
    const pending = approval()
    const forApprover = orderApprovalBanners({
      approvals: { pending: [pending], refund: null, return: null },
    })
    expect(forApprover).toHaveLength(1)
    expect(forApprover[0]?.title).toBe("Musa asks to return items")
    expect(forApprover[0]?.target).toEqual({
      approvalId: "approval-1",
      view: "review",
    })

    const approved = approval({
      decidedAt: new Date("2026-10-13T14:20:00Z"),
      decidedBy: "Ada",
      kind: "refund",
      status: "approved",
    })
    const forRequester = orderApprovalBanners({
      approvals: { pending: [], refund: approved, return: null },
    })
    expect(forRequester[0]).toMatchObject({
      actionLabel: "Record refund",
      title: "Approved by Ada",
      tone: "success",
    })
  })

  test("menu lines and polling follow the request state", () => {
    expect(approvalMenuMeta(null, "Stock back")).toBe("Stock back")
    expect(
      approvalMenuMeta(
        approval({ decidedBy: "Ada", status: "rejected" }),
        "Stock back",
      ),
    ).toBe("Not approved by Ada · ask again")
    expect(
      hasOpenApproval({
        approvals: { pending: [], refund: null, return: approval() },
      }),
    ).toBe(true)
    expect(
      hasOpenApproval({
        approvals: {
          pending: [],
          refund: null,
          return: approval({ status: "approved" }),
        },
      }),
    ).toBe(false)
  })
})
