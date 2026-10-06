import { describe, expect, it } from "bun:test"
import {
  assertBankReviewUnchanged,
  bankMatchEvidence,
  bankMatchSelection,
} from "./bank-match-state"

describe("bank match state", () => {
  it("sorts a balanced group and returns its exact signed total", () => {
    const result = bankMatchSelection(
      {
        rows: [
          { id: "bank-b", amountMinor: "-250", activeMatchId: null },
          { id: "bank-a", amountMinor: "1000", activeMatchId: null },
        ],
        candidates: [
          { id: "line-b", amountMinor: "-250" },
          { id: "line-a", amountMinor: "1000" },
        ],
      },
      ["bank-b", "bank-a"],
      ["line-b", "line-a"],
    )

    expect(result.bankRowIds).toEqual(["bank-a", "bank-b"])
    expect(result.journalLineIds).toEqual(["line-a", "line-b"])
    expect(result.amountMinor).toBe("750")
  })

  it("rejects duplicates, already matched rows, missing sources, and unequal totals", () => {
    const originalRow = {
      id: "bank-a",
      amountMinor: "100",
      activeMatchId: null,
    }
    const data = {
      rows: [originalRow],
      candidates: [{ id: "line-a", amountMinor: "100" }],
    }

    expect(() =>
      bankMatchSelection(data, ["bank-a", "bank-a"], ["line-a"]),
    ).toThrow("Select between 1 and 50")
    expect(() =>
      bankMatchSelection(
        { ...data, rows: [{ ...originalRow, activeMatchId: "match-1" }] },
        ["bank-a"],
        ["line-a"],
      ),
    ).toThrow("Selected sources changed")
    expect(() =>
      bankMatchSelection(data, ["bank-missing"], ["line-a"]),
    ).toThrow("Selected sources changed")
    expect(() =>
      bankMatchSelection(
        { ...data, candidates: [{ id: "line-a", amountMinor: "99" }] },
        ["bank-a"],
        ["line-a"],
      ),
    ).toThrow("Selected totals differ")
  })

  it("validates immutable evidence amounts and one-sided journal postings", () => {
    const event = {
      bankRows: [
        {
          id: "bank-a",
          statementId: "statement-1",
          externalId: "external-1",
          occurredAt: "2026-01-01T00:00:00.000Z",
          amountMinor: "100",
        },
      ],
      journalLines: [
        {
          id: "line-a",
          entryId: "entry-1",
          sequence: "1",
          effectiveAt: "2026-01-01T00:00:00.000Z",
          payloadHash: "hash",
          debitMinor: "100",
          creditMinor: "0",
        },
      ],
      amountMinor: "100",
    }

    const originalBank = event.bankRows[0]
    const originalLine = event.journalLines[0]
    if (!originalBank || !originalLine)
      throw new Error("Missing original fixture evidence")
    expect(bankMatchEvidence(event).amountMinor).toBe("100")
    expect(() => bankMatchEvidence({ ...event, amountMinor: "99" })).toThrow(
      "Original matching amounts cannot be verified",
    )
    expect(() =>
      bankMatchEvidence({
        ...event,
        journalLines: [{ ...originalLine, creditMinor: "100" }],
      }),
    ).toThrow("Original posted evidence is invalid")
    expect(() =>
      bankMatchEvidence({
        ...event,
        bankRows: [originalBank, { ...originalBank }],
      }),
    ).toThrow("Original matching identities are incomplete")
  })

  it("rejects stale account, statement, bank revision, or book snapshot", () => {
    const reviewed = {
      bookId: "book-1",
      accountId: "account-1",
      expectedRevision: "5",
      expectedSnapshotSequence: "9",
      statementId: "statement-1",
    }
    const current = {
      bookId: "book-1",
      accountId: "account-1",
      bankRevision: "5",
      snapshotSequence: "9",
      statement: { id: "statement-1" },
    }

    expect(() => assertBankReviewUnchanged(current, reviewed)).not.toThrow()
    for (const stale of [
      { ...current, accountId: "account-2" },
      { ...current, statement: { id: "statement-2" } },
      { ...current, bankRevision: "6" },
      { ...current, snapshotSequence: "10" },
    ]) {
      expect(() => assertBankReviewUnchanged(stale, reviewed)).toThrow(
        "Bank evidence or posted records changed",
      )
    }
  })
})
