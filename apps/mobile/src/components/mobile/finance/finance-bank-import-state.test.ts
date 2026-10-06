import { describe, expect, it } from "bun:test"
import {
  type NativeFinanceBankImportSource,
  decodeNativeFinanceBankStatementCsv,
  prepareNativeFinanceBankStatementImportPreview,
  toNativeFinanceBankStatementImportPayload,
} from "./finance-bank-import-state"

const source: NativeFinanceBankImportSource = {
  book: {
    id: "book-1",
    currencyCode: "NGN",
    startsAt: "2026-09-01T00:00:00.000Z",
  },
  account: {
    id: "bank-1",
    bookId: "book-1",
    kind: "ASSET",
    purpose: "BANK",
    archivedAt: null,
  },
  bankRevision: "7",
}

const csv =
  "Transaction ID,Date,Amount,Description\nrow-1,2026-09-30,12.34,Deposit\nrow-2,2026-09-01,-2.34,Fee"

function bytes(value: string) {
  return new TextEncoder().encode(value)
}

function preview(
  overrides: Partial<
    Parameters<typeof prepareNativeFinanceBankStatementImportPreview>[0]
  > = {},
) {
  return prepareNativeFinanceBankStatementImportPreview({
    source,
    selectedAccountId: "bank-1",
    bytes: bytes(csv),
    columns: {
      transactionId: "Transaction ID",
      date: "Date",
      amount: "Amount",
      description: "Description",
    },
    units: "MAJOR",
    reference: "September 2026",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    openingBalance: "10.00",
    closingBalance: "20.00",
    now: new Date("2026-10-02T12:00:00.000Z"),
    ...overrides,
  })
}

describe("native finance bank import state", () => {
  it("strictly decodes UTF-8, including supplementary characters", () => {
    expect(decodeNativeFinanceBankStatementCsv(bytes("café,💧"))).toBe(
      "café,💧",
    )
    expect(() => decodeNativeFinanceBankStatementCsv(new Uint8Array())).toThrow(
      "non-empty CSV",
    )
    expect(() =>
      decodeNativeFinanceBankStatementCsv(new Uint8Array([0xc3, 0x28])),
    ).toThrow("not valid UTF-8")
    expect(() =>
      decodeNativeFinanceBankStatementCsv(new Uint8Array([0xed, 0xa0, 0x80])),
    ).toThrow("not valid UTF-8")
    expect(() =>
      decodeNativeFinanceBankStatementCsv(new Uint8Array(524_289)),
    ).toThrow("512 KiB")
  })

  it("preserves bounded byte views and chunk boundaries while rejecting invalid Unicode encodings", () => {
    const text = `${"a".repeat(8191)}💧${"é".repeat(8192)}`
    const encoded = bytes(text)
    const backing = new Uint8Array(encoded.length + 2)
    backing[0] = 0xff
    backing.set(encoded, 1)
    backing[backing.length - 1] = 0xff
    expect(decodeNativeFinanceBankStatementCsv(backing.subarray(1, -1))).toBe(
      text,
    )
    for (const invalid of [
      [0x80],
      [0xff],
      [0xc0, 0xaf],
      [0xe0, 0x80, 0xaf],
      [0xf0, 0x80, 0x80, 0xaf],
      [0xf4, 0x90, 0x80, 0x80],
      [0xf0, 0x9f, 0x92],
    ])
      expect(() =>
        decodeNativeFinanceBankStatementCsv(new Uint8Array(invalid)),
      ).toThrow("not valid UTF-8")
  })

  it("previews inclusive UTC date boundaries with exact signed minor amounts", () => {
    const result = preview()
    expect(result.startsAt.toISOString()).toBe("2026-09-01T00:00:00.000Z")
    expect(result.endsAt.toISOString()).toBe("2026-09-30T23:59:59.999Z")
    expect(result.rows.map((row) => row.amountMinor.toString())).toEqual([
      "1234",
      "-234",
    ])
    expect(result.openingBalanceMinor).toBe("1000")
    expect(result.transactionTotalMinor).toBe("1000")
    expect(result.closingBalanceMinor).toBe("2000")
    expect(result.rows[0]?.occurredAt.toISOString()).toBe(
      "2026-09-30T00:00:00.000Z",
    )
  })

  it("rejects mismatched balances, dates outside the period, and unfinished periods", () => {
    expect(() => preview({ closingBalance: "19.99" })).toThrow(
      "Opening balance plus transactions",
    )
    expect(() =>
      preview({
        bytes: bytes(
          "Transaction ID,Date,Amount,Description\nrow-1,2026-08-31,12.34,Deposit",
        ),
        openingBalance: "0.00",
        closingBalance: "12.34",
      }),
    ).toThrow("Every transaction date")
    expect(() => preview({ endsOn: "2026-10-02" })).toThrow("completed")
    expect(() => preview({ now: new Date(Number.NaN) })).toThrow(
      "current date could not be confirmed",
    )
    expect(() =>
      preview({ startsOn: "2026-09-30", endsOn: "2026-09-01" }),
    ).toThrow("on or before")
    expect(() => preview({ startsOn: "2026-08-31" })).toThrow(
      "before this finance book",
    )
  })

  it("rejects invalid or changed original account and revision scope", () => {
    expect(() => preview({ selectedAccountId: "other-bank" })).toThrow(
      "original bank account",
    )
    expect(() =>
      preview({
        source: {
          ...source,
          account: { ...source.account, archivedAt: "2026-09-30" },
        },
      }),
    ).toThrow("active bank or clearing")
    expect(() =>
      preview({
        columns: {
          transactionId: "T".repeat(129),
          date: "Date",
          amount: "Amount",
          description: "Description",
        },
      }),
    ).toThrow("mapped transactionId CSV header")
    expect(() =>
      preview({
        source: {
          ...source,
          account: { ...source.account, purpose: "CASH" },
        },
      }),
    ).toThrow("active bank or clearing")
    const reviewed = preview()
    expect(() =>
      toNativeFinanceBankStatementImportPayload({
        preview: reviewed,
        currentSource: { ...source, bankRevision: "8" },
        clientCommandId: "command-1",
      }),
    ).toThrow("changed after review")
    expect(() =>
      toNativeFinanceBankStatementImportPayload({
        preview: reviewed,
        currentSource: {
          ...source,
          book: { ...source.book, currencyCode: "USD" },
        },
        clientCommandId: "command-1",
      }),
    ).toThrow("changed after review")
  })

  it("adapts a reviewed preview to the exact import command input", () => {
    const result = toNativeFinanceBankStatementImportPayload({
      preview: preview(),
      currentSource: source,
      clientCommandId: "command-1",
    })

    expect(result).toEqual({
      bookId: "book-1",
      accountId: "bank-1",
      clientCommandId: "command-1",
      expectedRevision: "7",
      currencyCode: "NGN",
      reference: "September 2026",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-30T23:59:59.999Z"),
      openingBalanceMinor: "1000",
      closingBalanceMinor: "2000",
      csv,
      columns: {
        transactionId: "Transaction ID",
        date: "Date",
        amount: "Amount",
        description: "Description",
      },
      units: "MAJOR",
    })
  })
})
