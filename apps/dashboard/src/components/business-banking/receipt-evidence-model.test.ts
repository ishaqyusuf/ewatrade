import { describe, expect, test } from "bun:test"
import {
  type ReceiptExtraction,
  receiptCheckPoll,
  receiptCheckSummary,
  receiptExtractionRows,
  receiptFindingWords,
  receiptRetryOffered,
} from "./receipt-evidence-model"

const check = (
  state: "pending" | "checking" | "complete" | "unavailable",
  disposition: "consistent" | "needs_review" | null = null,
  unavailableReason: string | null = null,
) => ({ state, disposition, unavailableReason })

describe("saved receipt check polling", () => {
  const active = {
    state: "pending" as const,
    startedAt: null,
    now: 1_000,
    visible: true,
    failed: false,
  }
  test("waits only for a pending or checking assessment", () => {
    expect(receiptCheckPoll(active)).toEqual({
      startedAt: 1_000,
      interval: 3_000,
    })
    for (const state of ["complete", "unavailable", undefined] as const)
      expect(receiptCheckPoll({ ...active, state, startedAt: 1_000 })).toEqual({
        startedAt: null,
        interval: false,
      })
  })
  test("progress doesn't extend the minute, including the final interval", () => {
    expect(
      receiptCheckPoll({
        ...active,
        state: "checking",
        startedAt: 1_000,
        now: 60_000,
      }),
    ).toEqual({ startedAt: 1_000, interval: 1_000 })
    expect(
      receiptCheckPoll({ ...active, startedAt: 1_000, now: 61_000 }).interval,
    ).toBe(false)
  })
  test("hidden pages and failed reads stop without renewing the budget", () => {
    for (const change of [{ visible: false }, { failed: true }])
      expect(
        receiptCheckPoll({ ...active, startedAt: 1_000, ...change }),
      ).toEqual({
        startedAt: 1_000,
        interval: false,
      })
  })
})

describe("receipt check headline", () => {
  test("never says the money arrived, even when details look consistent", () => {
    const summary = receiptCheckSummary(check("complete", "consistent"), true)
    expect(summary?.title).toBe("Receipt details look consistent")
    expect(summary?.detail).toContain("doesn’t confirm the money arrived")
    expect(JSON.stringify(summary)).not.toMatch(/verified|confirmed by/i)
  })
  test("missing, waiting and unavailable checks fall back to the bank", () => {
    for (const assessment of [
      null,
      check("pending"),
      check("checking"),
      check("unavailable", null, "WORKER_UNAVAILABLE"),
    ])
      expect(receiptCheckSummary(assessment, true)?.detail).toContain(
        "Check your bank account directly.",
      )
    expect(
      receiptCheckSummary(check("unavailable", null, "PDF_MANUAL_REVIEW"), true)
        ?.detail,
    ).toContain("PDF receipts")
  })
  test("asks for a closer look when the check needs review or is unclear", () => {
    expect(
      receiptCheckSummary(check("complete", "needs_review"), true),
    ).toEqual(expect.objectContaining({ tone: "review" }))
    expect(receiptCheckSummary(check("complete", null), true)?.tone).toBe(
      "review",
    )
  })
  test("shows nothing when there's no receipt", () => {
    expect(receiptCheckSummary(null, false)).toBeNull()
  })
})

describe("findings and read fields", () => {
  test("an unknown finding code still asks for a check", () => {
    expect(receiptFindingWords("AMOUNT_MISMATCH")).toContain("amount differs")
    expect(receiptFindingWords("SOMETHING_NEW")).toContain("needs a check")
  })
  test("lists only fields that were read and flags an unclear date", () => {
    const extraction: ReceiptExtraction = {
      amountText: "5,000.00",
      currencyCode: "NGN",
      feeText: null,
      totalDebitText: null,
      recipientAccount: "******6789",
      recipientBank: "GTBank",
      recipientName: null,
      senderName: null,
      bankReference: null,
      narration: null,
      dateRaw: "03/04/2026",
      dateTimeIso: null,
      dateOnly: null,
      timezone: null,
      documentKind: "single_transfer",
      printedStatus: "unknown",
      dateAmbiguous: true,
      evidence: [],
    }
    expect(receiptExtractionRows(extraction)).toEqual([
      ["Amount", "5,000.00 · NGN"],
      ["To", "GTBank · ******6789"],
      ["Date", "03/04/2026 (day and month unclear)"],
      ["Status printed", "Not shown"],
    ])
  })
})

describe("asking for another receipt check", () => {
  test("only offered where the server can run the check again", () => {
    expect(receiptRetryOffered(null, false)).toBe(false)
    expect(receiptRetryOffered(null, true)).toBe(true)
    expect(
      receiptRetryOffered(
        { state: "unavailable", unavailableReason: "WORKER_UNAVAILABLE" },
        true,
      ),
    ).toBe(true)
    for (const assessment of [
      { state: "unavailable" as const, unavailableReason: "PDF_MANUAL_REVIEW" },
      { state: "unavailable" as const, unavailableReason: null },
      { state: "checking" as const, unavailableReason: null },
      { state: "complete" as const, unavailableReason: null },
    ])
      expect(receiptRetryOffered(assessment, true)).toBe(false)
  })
})
