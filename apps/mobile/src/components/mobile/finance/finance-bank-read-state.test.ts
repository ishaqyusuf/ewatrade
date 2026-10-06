import { describe, expect, it } from "bun:test"
import {
  type NativeBankCorrectionSource,
  type NativeBankStatementDetail,
  type NativeBankStatementPage,
  validateNativeBankCorrectionSource,
  validateNativeBankStatementDetail,
  validateNativeBankStatementPage,
} from "./finance-bank-read-state"

const startsAt = new Date("2026-09-01T00:00:00.000Z")
const endsAt = new Date("2026-09-30T23:59:59.999Z")

const listItem = {
  id: "statement-1",
  bookId: "book-1",
  accountId: "bank-1",
  currencyCode: "NGN",
  reference: "September",
  startsAt,
  endsAt,
  openingBalanceMinor: "1000",
  closingBalanceMinor: "1100",
  rowCount: 1,
  contentHash: "hash-1",
  importedRevision: "1",
  actorUserId: "actor-1",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    bookId: "book-1",
    currencyCode: "NGN",
    items: [listItem],
    nextCursor: null,
    ...overrides,
  } as unknown as NativeBankStatementPage
}

const detail = {
  bookId: "book-1",
  accountId: "bank-1",
  currencyCode: "NGN",
  bankRevision: "2",
  snapshotSequence: "1",
  statement: {
    id: "statement-1",
    reference: "September",
    startsAt,
    endsAt,
    importedAt: new Date("2026-10-01T00:00:00.000Z"),
    openingBalanceMinor: "1000",
    closingBalanceMinor: "1100",
    rowCount: 1,
  },
  rows: [
    {
      id: "bank-row-1",
      position: 0,
      externalId: "external-1",
      occurredAt: new Date("2026-09-15T00:00:00.000Z"),
      amountMinor: "100",
      description: "Deposit",
      activeMatchId: null,
    },
  ],
  candidates: [
    {
      id: "journal-line-1",
      entryId: "journal-entry-1",
      amountMinor: "100",
      effectiveAt: new Date("2026-09-15T00:00:00.000Z"),
      sequence: "1",
      description: "Deposit source",
      sourceKind: "MONEY",
      sourceId: "money-entry-1",
    },
  ],
  unmatchedBankRows: 1,
  unmatchedBankMinor: "100",
  postedOpeningMinor: "1000",
  postedClosingMinor: "1100",
  openingDifferenceMinor: "0",
  closingDifferenceMinor: "0",
  candidateCoverageComplete: true,
  candidateReviewLimit: 500,
  operationallyReconciled: false,
  canReconcileClose: false,
} as unknown as NativeBankStatementDetail

function validateDetail(
  value: NativeBankStatementDetail = detail,
  overrides: Partial<{
    bookId: string
    accountId: string
    currencyCode: string
    statementId: string
  }> = {},
) {
  return validateNativeBankStatementDetail({
    detail: value,
    bookId: "book-1",
    accountId: "bank-1",
    currencyCode: "NGN",
    statementId: "statement-1",
    bookStartsAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  })
}

describe("native finance bank read state", () => {
  it("accepts blank descriptions allowed by the CSV producer and enforces the book start boundary", () => {
    const blank = {
      ...detail,
      rows: detail.rows.map((row) => ({ ...row, description: "" })),
    }
    expect(validateDetail(blank)).toBe(blank)
    expect(() =>
      validateNativeBankStatementDetail({
        detail,
        bookId: "book-1",
        accountId: "bank-1",
        currencyCode: "NGN",
        statementId: "statement-1",
        bookStartsAt: "2026-09-02T00:00:00.000Z",
      }),
    ).toThrow("before this finance book")
  })
  it("validates page scope and requires the next cursor to be the last shown statement", () => {
    const items = [{ ...listItem, id: "statement-2" }, listItem]
    const valid = page({ items, nextCursor: "statement-1" })
    expect(
      validateNativeBankStatementPage({
        page: valid,
        bookId: "book-1",
        currencyCode: "NGN",
        accountId: "bank-1",
        limit: 2,
      }),
    ).toBe(valid)
    expect(() =>
      validateNativeBankStatementPage({
        page: page({ items, nextCursor: "outside-page" }),
        bookId: "book-1",
        currencyCode: "NGN",
        accountId: "bank-1",
        limit: 2,
      }),
    ).toThrow("last shown row")
    expect(() =>
      validateNativeBankStatementPage({
        page: page({ nextCursor: " bad cursor " }),
        bookId: "book-1",
        currencyCode: "NGN",
        limit: 1,
      }),
    ).toThrow("cursor is invalid")
  })

  it("rejects out-of-scope, duplicate and malformed statement list rows", () => {
    const base = {
      page: page(),
      bookId: "book-1",
      currencyCode: "NGN",
      accountId: "bank-1",
    }
    expect(() =>
      validateNativeBankStatementPage({
        ...base,
        page: page({ currencyCode: "USD" }),
      }),
    ).toThrow("book and currency")
    expect(() =>
      validateNativeBankStatementPage({
        ...base,
        page: page({ items: [{ ...listItem, accountId: "other-bank" }] }),
      }),
    ).toThrow("different account or book")
    expect(() =>
      validateNativeBankStatementPage({
        ...base,
        page: page({ items: [listItem, listItem] }),
      }),
    ).toThrow("repeats a statement identity")
    expect(() =>
      validateNativeBankStatementPage({
        ...base,
        page: page({ items: [{ ...listItem, openingBalanceMinor: "01" }] }),
      }),
    ).toThrow("opening balance")
  })

  it("validates exact detail provenance, bounded identities and distinct journal/source IDs", () => {
    expect(validateDetail()).toBe(detail)
    expect(detail.candidates[0]).toMatchObject({
      id: "journal-line-1",
      entryId: "journal-entry-1",
      sourceId: "money-entry-1",
    })
    expect(() =>
      validateDetail(detail, { statementId: "statement-other" }),
    ).toThrow("different source")
    expect(() =>
      validateDetail({ ...detail, accountId: "other-bank" } as never),
    ).toThrow("different source")
    expect(() =>
      validateDetail({
        ...detail,
        rows: [detail.rows[0], detail.rows[0]],
        statement: { ...detail.statement, rowCount: 2 },
      } as never),
    ).toThrow("duplicated or outside")
    expect(() =>
      validateDetail({
        ...detail,
        candidates: [detail.candidates[0], detail.candidates[0]],
      } as never),
    ).toThrow("duplicated or outside")
  })

  it("keeps capped coverage and unreconciled status truthful", () => {
    expect(() =>
      validateDetail({
        ...detail,
        candidateCoverageComplete: false,
      } as never),
    ).toThrow("coverage or reconciliation")
    expect(() =>
      validateDetail({
        ...detail,
        operationallyReconciled: true,
      } as never),
    ).toThrow("coverage or reconciliation")
    expect(() =>
      validateDetail({
        ...detail,
        unmatchedBankMinor: "99",
      } as never),
    ).toThrow("differences do not match")
    expect(() =>
      validateDetail({
        ...detail,
        closingDifferenceMinor: "1",
      } as never),
    ).toThrow("differences do not match")
  })

  it("validates original correction lookup while retaining journal and payment identities", () => {
    const result = {
      bookId: "book-1",
      bankAccountId: "bank-1",
      journalEntryId: "journal-entry-1",
      sourceKind: "PURCHASE_PAYMENT",
      sourceId: "supplier-entry-1",
      target: {
        kind: "PURCHASE",
        billId: "purchase-bill-1",
        paymentId: "purchase-payment-1",
      },
      posted: {
        description: "Supplier payment",
        effectiveAt: new Date("2026-09-15T00:00:00.000Z"),
        sequence: "1",
        amountMinor: "-100",
      },
    } as unknown as NativeBankCorrectionSource
    expect(
      validateNativeBankCorrectionSource({
        result,
        bookId: "book-1",
        accountId: "bank-1",
        journalEntryId: "journal-entry-1",
      }),
    ).toBe(result)
    expect(result).toMatchObject({
      journalEntryId: "journal-entry-1",
      sourceId: "supplier-entry-1",
      target: { paymentId: "purchase-payment-1" },
    })
    expect(() =>
      validateNativeBankCorrectionSource({
        result,
        bookId: "book-1",
        accountId: "bank-1",
        journalEntryId: "journal-entry-other",
      }),
    ).toThrow("different bank entry")
  })
})
