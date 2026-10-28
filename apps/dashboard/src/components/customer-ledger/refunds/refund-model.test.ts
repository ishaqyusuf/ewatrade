import { describe, expect, test } from "bun:test"
import {
  localDay,
  maskedAccountNumber,
  refundActions,
  refundReviewLabel,
  refundStatus,
  reserveAckKey,
  returnAckKey,
  returnEffectiveAt,
} from "./refund-model"

const request = {
  id: "rfr_1",
  version: 2,
  accountRevision: "14",
  destinationFingerprint: "a".repeat(64),
}

describe("approval check", () => {
  test("goes stale when the request, account or destination changes", () => {
    const checked = reserveAckKey(request)
    expect(reserveAckKey({ ...request })).toBe(checked)
    for (const change of [
      { id: "rfr_2" },
      { version: 3 },
      { accountRevision: "15" },
      { destinationFingerprint: "b".repeat(64) },
    ])
      expect(reserveAckKey({ ...request, ...change })).not.toBe(checked)
  })
})

describe("money-returned check", () => {
  const fields = {
    moneyAccountId: "fa_gtb",
    day: "2026-10-27",
    reference: "RF26",
  }
  test("binds the exact account, day and outgoing reference", () => {
    const checked = returnAckKey(request, fields)
    expect(checked).not.toBeNull()
    expect(returnAckKey(request, { ...fields, reference: " RF26 " })).toBe(
      checked,
    )
    for (const change of [
      { moneyAccountId: "fa_opay" },
      { day: "2026-10-26" },
      { reference: "RF27" },
    ])
      expect(returnAckKey(request, { ...fields, ...change })).not.toBe(checked)
    expect(returnAckKey({ ...request, version: 3 }, fields)).not.toBe(checked)
  })
  test("can't be given while a detail is missing", () => {
    expect(returnAckKey(request, { ...fields, moneyAccountId: "" })).toBeNull()
    expect(returnAckKey(request, { ...fields, day: "" })).toBeNull()
    expect(returnAckKey(request, { ...fields, reference: "  " })).toBeNull()
  })
})

describe("date the money was sent", () => {
  const openedAt = new Date(2026, 9, 28, 15, 30)
  const approvedAt = new Date(2026, 9, 27, 16, 0)
  test("today is the moment the form opened", () => {
    expect(
      returnEffectiveAt(localDay(openedAt), { openedAt, approvedAt }),
    ).toEqual({ at: openedAt })
  })
  test("an earlier day is local midday, never before the approval", () => {
    expect(returnEffectiveAt("2026-10-27", { openedAt, approvedAt })).toEqual({
      at: approvedAt,
    })
    const laterApproval = new Date(2026, 9, 25, 9, 0)
    expect(
      returnEffectiveAt("2026-10-27", { openedAt, approvedAt: laterApproval }),
    ).toEqual({ at: new Date(2026, 9, 27, 12) })
  })
  test("refuses future days, days before approval and unapproved refunds", () => {
    expect(
      "problem" in returnEffectiveAt("2026-10-29", { openedAt, approvedAt }),
    ).toBe(true)
    expect(
      "problem" in returnEffectiveAt("2026-10-26", { openedAt, approvedAt }),
    ).toBe(true)
    expect(
      "problem" in
        returnEffectiveAt("2026-10-28", { openedAt, approvedAt: null }),
    ).toBe(true)
    expect(
      "problem" in returnEffectiveAt("28 Oct", { openedAt, approvedAt }),
    ).toBe(true)
  })
  test("refuses impossible days instead of rolling into another day", () => {
    const early = { openedAt, approvedAt: new Date(2026, 0, 1, 9) }
    for (const day of ["2026-02-31", "2026-13-01", "2026-10-00", "2026-04-31"])
      expect(returnEffectiveAt(day, early)).toEqual({
        problem: "Choose the day you sent the money.",
      })
    expect(returnEffectiveAt("2026-02-28", early)).toEqual({
      at: new Date(2026, 1, 28, 12),
    })
  })
  test("gives the same instant on a retry of the same form", () => {
    expect(returnEffectiveAt("2026-10-28", { openedAt, approvedAt })).toEqual(
      returnEffectiveAt("2026-10-28", { openedAt, approvedAt }),
    )
  })
})

describe("display", () => {
  test("shows only the last four digits until revealed", () => {
    expect(maskedAccountNumber("0123456789")).toBe("•••• 6789")
    expect(maskedAccountNumber("")).toBe("—")
  })
  test("never treats an unknown server status as a known state", () => {
    expect(refundStatus("RESERVED")).toBe("RESERVED")
    expect(refundStatus("SENT")).toBeNull()
  })
})

describe("what a request may offer", () => {
  const readable = {
    destinationStatus: "AVAILABLE" as const,
    destination: {
      bankCode: "058",
      accountNumber: "0123456789",
      accountName: "ISHAQ YUSUF",
    },
  }
  const unreadable = {
    destinationStatus: "UNAVAILABLE" as const,
    destination: null,
  }
  test("approves only a requested refund the server allows, with a readable destination", () => {
    const base = { status: "REQUESTED", canApprove: true, canCancel: true }
    expect(refundActions({ ...base, ...readable })).toMatchObject({
      approve: true,
      askForDetails: true,
      cancel: true,
    })
    expect(
      refundActions({ ...base, canApprove: false, ...readable }).approve,
    ).toBe(false)
    expect(refundActions({ ...base, ...unreadable })).toMatchObject({
      approve: false,
      readable: false,
      askForDetails: true,
      cancel: true,
    })
  })
  test("records a return only for a held refund it can show, cancel stays", () => {
    const held = { status: "RESERVED", canApprove: false, canCancel: true }
    expect(refundActions({ ...held, ...readable })).toMatchObject({
      recordReturn: true,
      approve: false,
      askForDetails: false,
      cancel: true,
    })
    expect(refundActions({ ...held, ...unreadable })).toMatchObject({
      recordReturn: false,
      cancel: true,
    })
  })
  test("an unknown or finished status offers nothing", () => {
    for (const status of ["SENT", "COMPLETED", "CANCELLED"])
      expect(
        refundActions({
          status,
          // Even contradictory server flags can't unlock a finished request.
          canApprove: true,
          canCancel: true,
          ...readable,
        }),
      ).toMatchObject({
        approve: false,
        askForDetails: false,
        recordReturn: false,
        cancel: false,
      })
  })
})

describe("list badge", () => {
  test("shows a details request only on a requested refund", () => {
    expect(
      refundReviewLabel({ status: "REQUESTED", reviewState: "NEEDS_DETAILS" }),
    ).toBe("More details needed")
    expect(
      refundReviewLabel({ status: "REQUESTED", reviewState: "REQUESTED" }),
    ).toBe("To review")
    expect(
      refundReviewLabel({ status: "RESERVED", reviewState: "NEEDS_DETAILS" }),
    ).toBe("Approved · reserved")
    expect(refundReviewLabel({ status: "SENT", reviewState: "SENT" })).toBe(
      "SENT",
    )
  })
})
