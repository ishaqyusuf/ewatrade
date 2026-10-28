import { describe, expect, test } from "bun:test"
import {
  bankAccountNumberProblem,
  bankCheckKey,
  businessToday,
  oneTimeWhatsAppDraft,
  rebuildWhatsAppUrl,
  receivedAtFromDay,
  receivedLine,
  spacedAccountNumber,
  whatsAppPhoneLabel,
  whatsAppText,
} from "./business-banking-model"

describe("bank account numbers", () => {
  test("accepts exactly ten digits and keeps leading zeros", () => {
    expect(bankAccountNumberProblem("0123456789")).toBeNull()
    expect(spacedAccountNumber("0123456789")).toBe("012 345 6789")
  })
  test("explains short, long and non-digit numbers", () => {
    expect(bankAccountNumberProblem("012345678")).toContain("This one has 9")
    expect(bankAccountNumberProblem("01234567890")).toContain("has 11")
    expect(bankAccountNumberProblem("01234-6789")).toBe("Use digits only.")
    expect(bankAccountNumberProblem(" ")).toContain("10-digit")
  })
})

describe("WhatsApp links", () => {
  const server =
    "https://wa.me/2348030004521?text=Hello%2C%20here%20is%20your%20payment%20link"
  test("reads the prepared text and phone", () => {
    expect(whatsAppText(server)).toBe("Hello, here is your payment link")
    expect(whatsAppPhoneLabel(server)).toBe("+2348030004521")
  })
  test("rebuilds the same phone with the edited text", () => {
    expect(rebuildWhatsAppUrl(server, "Edited & sent by hand")).toBe(
      "https://wa.me/2348030004521?text=Edited%20%26%20sent%20by%20hand",
    )
  })
  test("falls back to Copy only without a usable wa.me phone", () => {
    expect(rebuildWhatsAppUrl(null, "x")).toBeNull()
    expect(rebuildWhatsAppUrl("https://example.com/2348030004521", "x")).toBe(
      null,
    )
    expect(rebuildWhatsAppUrl("https://wa.me/?text=x", "x")).toBeNull()
  })
})

describe("one-time WhatsApp number", () => {
  test("reads a Nigerian national number and keeps the edited text", () => {
    const draft = oneTimeWhatsAppDraft(" 0803 000 4521 ", "Pay here & thanks")
    expect(draft).toMatchObject({
      kind: "ready",
      url: "https://wa.me/2348030004521?text=Pay%20here%20%26%20thanks",
    })
  })
  test("accepts other countries only with their country code", () => {
    expect(oneTimeWhatsAppDraft("+44 7911 123456", "Hi").kind).toBe("ready")
    expect(oneTimeWhatsAppDraft("07911 123456", "Hi").kind).toBe("invalid")
  })
  test("separates an empty, invalid or unsendable draft", () => {
    expect(oneTimeWhatsAppDraft("  ", "Hi").kind).toBe("empty")
    expect(oneTimeWhatsAppDraft("0803 000", "Hi").kind).toBe("invalid")
    expect(oneTimeWhatsAppDraft("08030004521 ext 2", "Hi").kind).toBe("invalid")
    expect(oneTimeWhatsAppDraft("08030004521", "  ").kind).toBe("no-text")
    expect(oneTimeWhatsAppDraft("08030004521", "x".repeat(1501)).kind).toBe(
      "too-long",
    )
  })
})

describe("bank check acknowledgment", () => {
  const facts = {
    reportId: "rep_1",
    revision: 3,
    receivedMinor: 500_000,
    accountId: "acc_gtb",
    day: "2026-10-26",
    reference: "TRX-9",
    referenceKind: "bank" as const,
    fundsSnapshot: "none",
  }
  test("goes stale when the report or any checked fact changes", () => {
    const checked = bankCheckKey(facts)
    expect(checked).not.toBeNull()
    expect(bankCheckKey({ ...facts, reference: " TRX-9 " })).toBe(checked)
    for (const change of [
      { reportId: "rep_2" },
      { revision: 4 },
      { receivedMinor: 499_999 },
      { accountId: "acc_opay" },
      { day: "2026-10-25" },
      { reference: "" },
      { referenceKind: "nibss_session_id" as const },
      { fundsSnapshot: '["acc_1","4"]' },
    ])
      expect(bankCheckKey({ ...facts, ...change })).not.toBe(checked)
  })
  test("can't be given while the facts are incomplete", () => {
    expect(bankCheckKey({ ...facts, receivedMinor: null })).toBeNull()
    expect(bankCheckKey({ ...facts, receivedMinor: 0 })).toBeNull()
    expect(bankCheckKey({ ...facts, accountId: "" })).toBeNull()
    expect(bankCheckKey({ ...facts, day: "" })).toBeNull()
  })
})

describe("review helpers", () => {
  test("never sends a received date in the future", () => {
    const now = new Date("2026-10-26T08:00:00Z")
    expect(receivedAtFromDay("2026-10-26", now)).toEqual(now)
    expect(receivedAtFromDay("2026-10-25", now)?.toISOString()).toBe(
      "2026-10-25T11:00:00.000Z",
    )
    expect(receivedAtFromDay("26 Oct", now)).toBeNull()
  })
  test("uses the business time zone for today", () => {
    expect(
      businessToday("Africa/Lagos", new Date("2026-10-26T23:30:00Z")),
    ).toBe("2026-10-27")
  })
  test("describes what confirming records against the authoritative balance", () => {
    expect(
      receivedLine({
        receivedMinor: null,
        claimedMinor: 5000,
        balanceMinor: 9,
      }),
    ).toEqual({ kind: "empty" })
    expect(
      receivedLine({
        receivedMinor: 20_000,
        claimedMinor: 5000,
        balanceMinor: 15_000,
      }),
    ).toEqual({ kind: "over" })
    expect(
      receivedLine({
        receivedMinor: 3000,
        claimedMinor: 5000,
        balanceMinor: 15_000,
      }),
    ).toEqual({ kind: "records", lessBy: 2000, left: 12_000 })
  })
})
