import { describe, expect, it } from "bun:test"
import {
  assertNativeBankReviewUnchanged,
  nativeBankMatchEvidence,
  nativeBankMatchReason,
  nativeBankMatchSelection,
  nativeBankMatchedGroups,
  nativeBankSelectionTotals,
  nativeBankUnmatchEvidence,
  toggleNativeBankSelection,
} from "./finance-bank-match-state"

const evidenceEvent = {
  id: "match-1",
  kind: "MATCH",
  revision: "7",
  reason: "Same amount and date",
  bankRows: [
    {
      id: "bank-a",
      statementId: "statement-1",
      externalId: "external-1",
      occurredAt: "2026-09-15T00:00:00.000Z",
      amountMinor: "2750000",
    },
    {
      id: "bank-b",
      statementId: "statement-1",
      externalId: "external-2",
      occurredAt: "2026-09-15T00:00:00.000Z",
      amountMinor: "1200000",
    },
  ],
  journalLines: [
    {
      id: "line-a",
      entryId: "entry-1",
      sequence: "41",
      effectiveAt: "2026-09-15T00:00:00.000Z",
      payloadHash: "hash",
      debitMinor: "3950000",
      creditMinor: "0",
    },
  ],
  amountMinor: "3950000",
}

describe("native bank match selection", () => {
  it("sorts a many-to-many group and returns its exact signed total", () => {
    const result = nativeBankMatchSelection(
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

  it("keeps BigInt precision beyond Number.MAX_SAFE_INTEGER", () => {
    const big = "9007199254740993"
    const result = nativeBankMatchSelection(
      {
        rows: [{ id: "bank-a", amountMinor: big, activeMatchId: null }],
        candidates: [{ id: "line-a", amountMinor: big }],
      },
      ["bank-a"],
      ["line-a"],
    )
    expect(result.amountMinor).toBe(big)
    expect(() =>
      nativeBankMatchSelection(
        {
          rows: [{ id: "bank-a", amountMinor: big, activeMatchId: null }],
          candidates: [{ id: "line-a", amountMinor: "9007199254740992" }],
        },
        ["bank-a"],
        ["line-a"],
      ),
    ).toThrow("Selected totals differ")
  })

  it("rejects empty, duplicate, oversized, matched, missing and unequal groups", () => {
    const row = { id: "bank-a", amountMinor: "100", activeMatchId: null }
    const data = {
      rows: [row],
      candidates: [{ id: "line-a", amountMinor: "100" }],
    }
    expect(() => nativeBankMatchSelection(data, [], ["line-a"])).toThrow(
      "Select between 1 and 50",
    )
    expect(() =>
      nativeBankMatchSelection(data, ["bank-a", "bank-a"], ["line-a"]),
    ).toThrow("Select between 1 and 50")
    expect(() =>
      nativeBankMatchSelection(
        data,
        ["bank-a"],
        Array.from({ length: 51 }, (_, index) => `line-${index}`),
      ),
    ).toThrow("Select between 1 and 50")
    expect(() =>
      nativeBankMatchSelection(
        { ...data, rows: [{ ...row, activeMatchId: "match-1" }] },
        ["bank-a"],
        ["line-a"],
      ),
    ).toThrow("Selected sources changed")
    expect(() =>
      nativeBankMatchSelection(data, ["bank-missing"], ["line-a"]),
    ).toThrow("Selected sources changed")
    expect(() =>
      nativeBankMatchSelection(
        { ...data, candidates: [{ id: "line-a", amountMinor: "99" }] },
        ["bank-a"],
        ["line-a"],
      ),
    ).toThrow("Selected totals differ")
  })

  it("reports footer totals and the absolute difference without throwing", () => {
    const data = {
      rows: [{ id: "bank-a", amountMinor: "-107500", activeMatchId: null }],
      candidates: [{ id: "line-a", amountMinor: "-100000" }],
    }
    expect(nativeBankSelectionTotals(data, [], [])).toMatchObject({
      count: 0,
      both: false,
      equal: false,
    })
    const differ = nativeBankSelectionTotals(data, ["bank-a"], ["line-a"])
    expect(differ).toMatchObject({
      bankMinor: "-107500",
      postedMinor: "-100000",
      differenceMinor: "7500",
      both: true,
      equal: false,
    })
    expect(differ.error).toContain("Selected totals differ")
  })

  it("toggles within the 50 per side limit", () => {
    const full = Array.from({ length: 50 }, (_, index) => `id-${index}`)
    expect(toggleNativeBankSelection(["a"], "a")).toEqual([])
    expect(toggleNativeBankSelection(["a"], "b")).toEqual(["a", "b"])
    expect(toggleNativeBankSelection(full, "extra")).toHaveLength(50)
  })

  it("requires a trimmed reason of 1 to 400 characters", () => {
    expect(nativeBankMatchReason("  Same amount  ")).toBe("Same amount")
    expect(() => nativeBankMatchReason("   ")).toThrow("1 to 400")
    expect(nativeBankMatchReason("x".repeat(400))).toHaveLength(400)
    expect(() => nativeBankMatchReason("x".repeat(401))).toThrow("1 to 400")
  })
})

describe("native bank review and evidence", () => {
  it("rejects a stale account, statement, bank revision or journal snapshot", () => {
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
    expect(() =>
      assertNativeBankReviewUnchanged(current, reviewed),
    ).not.toThrow()
    for (const stale of [
      { ...current, bookId: "book-2" },
      { ...current, accountId: "account-2" },
      { ...current, statement: { id: "statement-2" } },
      { ...current, bankRevision: "6" },
      { ...current, snapshotSequence: "10" },
    ])
      expect(() => assertNativeBankReviewUnchanged(stale, reviewed)).toThrow(
        "Bank evidence or posted records changed. Refresh and review again.",
      )
  })

  it("validates immutable evidence amounts and one-sided postings", () => {
    expect(nativeBankMatchEvidence(evidenceEvent).amountMinor).toBe("3950000")
    expect(() =>
      nativeBankMatchEvidence({ ...evidenceEvent, amountMinor: "1" }),
    ).toThrow("Original matching amounts cannot be verified")
    const [line] = evidenceEvent.journalLines
    expect(() =>
      nativeBankMatchEvidence({
        ...evidenceEvent,
        journalLines: [{ ...line, creditMinor: "3950000" }],
      }),
    ).toThrow("Original posted evidence is invalid")
  })

  it("only releases a match whose rows are all still active on this statement", () => {
    const source = {
      statement: { id: "statement-1" },
      rows: [
        { id: "bank-a", activeMatchId: "match-1" },
        { id: "bank-b", activeMatchId: "match-1" },
      ],
    }
    const expected = { matchId: "match-1", matchRevision: "7" }
    expect(
      nativeBankUnmatchEvidence(source, evidenceEvent, expected).bank,
    ).toHaveLength(2)
    expect(() =>
      nativeBankUnmatchEvidence(
        { ...source, rows: [{ id: "bank-a", activeMatchId: "match-1" }] },
        evidenceEvent,
        expected,
      ),
    ).toThrow("already undone or has changed")
    expect(() =>
      nativeBankUnmatchEvidence(source, evidenceEvent, {
        ...expected,
        matchRevision: "8",
      }),
    ).toThrow("couldn't check the original match")
    expect(() =>
      nativeBankUnmatchEvidence(
        source,
        { ...evidenceEvent, kind: "UNMATCH" },
        expected,
      ),
    ).toThrow("couldn't check the original match")
  })

  it("groups active rows by match and only allows Undo with valid evidence", () => {
    const rows = [
      { id: "bank-a", amountMinor: "2750000", activeMatchId: "match-1" },
      { id: "bank-b", amountMinor: "1200000", activeMatchId: "match-1" },
      { id: "bank-c", amountMinor: "500", activeMatchId: "match-2" },
      { id: "bank-d", amountMinor: "900", activeMatchId: null },
    ]
    const groups = nativeBankMatchedGroups(rows, [
      evidenceEvent,
      { ...evidenceEvent, id: "match-2", amountMinor: "1" },
    ])
    expect(groups.map((group) => group.matchId)).toEqual(["match-1", "match-2"])
    expect(groups[0]).toMatchObject({ amountMinor: "3950000", canUndo: true })
    expect(groups[1]).toMatchObject({ amountMinor: "500", canUndo: false })
    expect(nativeBankMatchedGroups(rows, [])[0]?.canUndo).toBe(false)
  })
})
