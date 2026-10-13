import { describe, expect, test } from "bun:test"
import {
  OPEN_ORDER_CHANGE_POLICY,
  endOfBusinessDay,
  orderChangeRequirement,
} from "./commercial-order-change-rules"

const cashier = { isApprover: false, canManageMoney: false }
const manager = { isApprover: false, canManageMoney: true }
const owner = { isApprover: true, canManageMoney: true }

describe("orderChangeRequirement", () => {
  test("open stores keep today's rules", () => {
    const open = OPEN_ORDER_CHANGE_POLICY
    expect(
      orderChangeRequirement(open, { action: "return", ...cashier }),
    ).toEqual({ kind: "direct" })
    expect(
      orderChangeRequirement(open, {
        action: "return",
        withMoney: true,
        ...cashier,
      }),
    ).toEqual({ kind: "blocked", reason: "Owners and managers only" })
    expect(
      orderChangeRequirement(open, { action: "refund", ...cashier }),
    ).toEqual({ kind: "blocked", reason: "Owners and managers only" })
    expect(
      orderChangeRequirement(open, { action: "refund", ...manager }),
    ).toEqual({ kind: "direct" })
  })

  test("approval mode makes everyone below Owner/Admin ask", () => {
    const policy = {
      returnsMode: "APPROVAL_REQUIRED",
      refundsMode: "APPROVAL_REQUIRED",
    } as const
    for (const actor of [cashier, manager])
      for (const action of ["return", "refund"] as const)
        expect(orderChangeRequirement(policy, { action, ...actor })).toEqual({
          kind: "ask",
        })
    expect(
      orderChangeRequirement(policy, { action: "refund", ...owner }),
    ).toEqual({ kind: "direct" })
  })

  test("off blocks everyone, Owners included", () => {
    const policy = { returnsMode: "OFF", refundsMode: "OFF" } as const
    expect(
      orderChangeRequirement(policy, { action: "return", ...owner }),
    ).toEqual({ kind: "blocked", reason: "Returns are off for this store" })
    expect(
      orderChangeRequirement(policy, { action: "refund", ...owner }),
    ).toEqual({ kind: "blocked", reason: "Refunds are off for this store" })
  })

  test("a return paying money back follows the refund setting", () => {
    const refundsAsk = {
      returnsMode: "OPEN",
      refundsMode: "APPROVAL_REQUIRED",
    } as const
    expect(
      orderChangeRequirement(refundsAsk, {
        action: "return",
        cashBack: true,
        withMoney: true,
        ...manager,
      }),
    ).toEqual({ kind: "ask" })
    // Credit only, no cash leaving: the open returns rule applies.
    expect(
      orderChangeRequirement(refundsAsk, {
        action: "return",
        withMoney: true,
        ...manager,
      }),
    ).toEqual({ kind: "direct" })
    const refundsOff = { returnsMode: "OPEN", refundsMode: "OFF" } as const
    expect(
      orderChangeRequirement(refundsOff, {
        action: "return",
        cashBack: true,
        withMoney: true,
        ...owner,
      }).kind,
    ).toBe("blocked")
    expect(
      orderChangeRequirement(refundsOff, { action: "return", ...cashier }),
    ).toEqual({ kind: "direct" })
  })
})

describe("endOfBusinessDay", () => {
  test("is the next local midnight in the business time zone", () => {
    // 15:10 in Lagos (UTC+1) → midnight Lagos = 23:00 UTC the same day.
    expect(
      endOfBusinessDay(new Date("2026-10-13T14:10:00Z"), "Africa/Lagos"),
    ).toEqual(new Date("2026-10-13T23:00:00Z"))
    // 00:30 Lagos on the 14th is still the 14th.
    expect(
      endOfBusinessDay(new Date("2026-10-13T23:30:00Z"), "Africa/Lagos"),
    ).toEqual(new Date("2026-10-14T23:00:00Z"))
  })

  test("handles daylight saving and bad zones", () => {
    // London switches to GMT on 25 Oct 2026; midnight that night is 00:00Z.
    expect(
      endOfBusinessDay(new Date("2026-10-25T12:00:00Z"), "Europe/London"),
    ).toEqual(new Date("2026-10-26T00:00:00Z"))
    expect(
      endOfBusinessDay(new Date("2026-10-13T14:10:00Z"), "Not/AZone"),
    ).toEqual(new Date("2026-10-13T23:00:00Z"))
  })
})
