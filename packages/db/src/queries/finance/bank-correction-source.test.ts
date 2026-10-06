import { describe, expect, test } from "bun:test"
import { resolveFinanceBankCorrectionSource } from "./bank-correction-source"
import { FinanceError } from "./rules"

const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "bank",
  entryId: "entry",
}

function fixture(options?: {
  entry?: Record<string, unknown> | null
  original?: Record<string, unknown> | null
  account?: Record<string, unknown> | null
  book?: Record<string, unknown> | null
  membership?: Record<string, unknown> | null
  models?: Record<string, unknown>
}) {
  const tx = {
    ...options?.models,
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        options?.membership === null
          ? null
          : {
              tenant: {
                id: "tenant",
                currencyCode: "NGN",
                timezone: "Africa/Lagos",
                isActive: true,
              },
            },
    },
    financeBook: {
      findFirst: async () =>
        options?.book === null
          ? null
          : { id: "book", tenantId: "tenant", lastSequence: 10n },
    },
    financeAccount: {
      findFirst: async () =>
        options?.account === null ? null : { id: "bank", bookId: "book" },
    },
    financeJournalEntry: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        if (where.id === "entry") return options?.entry ?? null
        if (where.id === "original") return options?.original ?? null
        return null
      },
    },
  }
  return {
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) =>
      callback(tx),
  } as never
}

function postedEntry(sourceKind = "OWNER_CONTRIBUTION") {
  return {
    id: "entry",
    bookId: "book",
    sequence: 7n,
    sourceKind,
    sourceId: "command",
    description: "Owner contribution",
    effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
    reversalOfId: null,
    lines: [{ debitMinor: 5000n, creditMinor: 0n }],
  }
}

describe("resolveFinanceBankCorrectionSource", () => {
  test("returns exact selected-account facts and an original supported money target", async () => {
    const result = await resolveFinanceBankCorrectionSource(
      fixture({ entry: postedEntry() }),
      input,
    )

    expect(result).toEqual({
      bookId: "book",
      bankAccountId: "bank",
      journalEntryId: "entry",
      sourceKind: "OWNER_CONTRIBUTION",
      sourceId: "command",
      target: { kind: "MONEY", entryId: "entry" },
      posted: {
        description: "Owner contribution",
        effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
        sequence: "7",
        amountMinor: "5000",
      },
    })
  })

  test("rejects an unowned Book, missing bank account or entry without an account line", async () => {
    await expect(
      resolveFinanceBankCorrectionSource(fixture({ book: null }), input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      resolveFinanceBankCorrectionSource(fixture({ account: null }), input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      resolveFinanceBankCorrectionSource(fixture({ entry: null }), input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("requires current active Owner or Admin membership", async () => {
    const db = fixture({ membership: null })
    await expect(
      resolveFinanceBankCorrectionSource(db, input),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolveFinanceBankCorrectionSource(db, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("keeps an unsupported correction source visible as unavailable", async () => {
    const result = await resolveFinanceBankCorrectionSource(
      fixture({
        entry: {
          ...postedEntry("FISCAL_YEAR_CLOSE"),
          sourceId: "event",
        },
      }),
      input,
    )
    expect(result.target).toEqual({
      kind: "UNAVAILABLE",
      reason: "This journal posting has no supported source correction.",
    })
    expect(result.posted.amountMinor).toBe("5000")
  })

  test("does not resolve a malformed reversal source or lose its posted facts", async () => {
    const result = await resolveFinanceBankCorrectionSource(
      fixture({
        entry: {
          ...postedEntry("MONEY_REVERSAL"),
          sourceId: "wrong-original",
          reversalOfId: "original",
        },
        original: {
          ...postedEntry("OWNER_CONTRIBUTION"),
          id: "original",
          reversalOfId: null,
          sequence: 5n,
        },
      }),
      input,
    )
    expect(result.target.kind).toBe("UNAVAILABLE")
    expect(result.posted).toMatchObject({
      description: "Owner contribution",
      sequence: "7",
      amountMinor: "5000",
    })
  })

  test("refuses reversed signs and an apparent reversal that does not invert the original bank amount", async () => {
    expect(
      (
        await resolveFinanceBankCorrectionSource(
          fixture({
            entry: {
              ...postedEntry(),
              lines: [{ debitMinor: 0n, creditMinor: 5000n }],
            },
          }),
          input,
        )
      ).target.kind,
    ).toBe("UNAVAILABLE")
    expect(
      (
        await resolveFinanceBankCorrectionSource(
          fixture({
            entry: {
              ...postedEntry("MONEY_REVERSAL"),
              sourceId: "original",
              reversalOfId: "original",
            },
            original: { ...postedEntry(), id: "original", sequence: 5n },
          }),
          input,
        )
      ).target.kind,
    ).toBe("UNAVAILABLE")
  })

  test("a bill payment resolves to its bill, preserving the distinct original payment identity", async () => {
    const db = fixture({
      entry: {
        ...postedEntry("BILL_PAYMENT"),
        sourceId: "payment-id",
        lines: [{ debitMinor: 0n, creditMinor: 5000n }],
      },
      models: {
        financeBillPayment: {
          findFirst: async ({ where }: { where: unknown }) => {
            expect(where).toEqual({
              id: "payment-id",
              bookId: "book",
              accountId: "bank",
            })
            return {
              id: "payment-id",
              amountMinor: 5000n,
              bill: { id: "bill-id", bookId: "book", kind: "EXPENSE" },
            }
          },
        },
      },
    })
    expect(
      (await resolveFinanceBankCorrectionSource(db, input)).target,
    ).toEqual({ kind: "BILL", billId: "bill-id", paymentId: "payment-id" })
  })

  test("purchase reversal source IDs refer to original supplier entries, separately from journal and payment IDs", async () => {
    const db = fixture({
      entry: {
        ...postedEntry("PURCHASE_PAYMENT_REVERSAL"),
        sourceId: "supplier-original",
        reversalOfId: "original",
      },
      original: {
        ...postedEntry("PURCHASE_PAYMENT"),
        id: "original",
        sourceId: "payment-original",
        sequence: 5n,
        lines: [{ debitMinor: 0n, creditMinor: 5000n }],
      },
      models: {
        financeSupplierEntry: {
          aggregate: async () => ({
            _max: { effectiveAt: new Date("2026-09-02T00:00:00.000Z") },
          }),
          findFirst: async ({ where }: { where: unknown }) => {
            expect(where).toEqual({
              bookId: "book",
              journalEntryId: "entry",
              kind: "REVERSAL",
              reversalOf: {
                id: "supplier-original",
                kind: "PURCHASE_PAYMENT",
                journalEntryId: "original",
              },
            })
            return { id: "supplier-reversal" }
          },
        },
        financeBillPayment: {
          findFirst: async () => ({
            id: "payment-original",
            amountMinor: 5000n,
            bill: {
              id: "purchase-bill",
              bookId: "book",
              kind: "PURCHASE",
              supplierId: "supplier",
            },
            actorUserId: "owner",
            effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
            reversedAt: new Date("2026-09-02T10:00:00.000Z"),
            supplierEntry: {
              id: "supplier-original",
              bookId: "book",
              kind: "PURCHASE_PAYMENT",
              side: "DEBIT",
              reversals: [
                {
                  id: "supplier-reversal",
                  effectiveAt: new Date("2026-09-02T00:00:00.000Z"),
                },
              ],
              journalEntryId: "original",
              paymentId: "payment-original",
              supplierId: "supplier",
              billId: "purchase-bill",
              moneyAccountId: "bank",
              amountMinor: 5000n,
              actorUserId: "owner",
              effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
              description: "Original purchase payment",
              journalEntry: {
                actorUserId: "owner",
                effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
                description: "Original purchase payment",
                reversalOfId: null,
                reversal: {
                  id: "entry",
                  effectiveAt: new Date("2026-09-02T00:00:00.000Z"),
                },
              },
            },
          }),
        },
      },
    })
    expect(
      (await resolveFinanceBankCorrectionSource(db, input)).target,
    ).toEqual({
      kind: "PURCHASE",
      billId: "purchase-bill",
      paymentId: "payment-original",
      payment: {
        id: "payment-original",
        supplierId: "supplier",
        amountMinor: "5000",
        effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
        description: "Original purchase payment",
        reversedAt: new Date("2026-09-02T10:00:00.000Z"),
        reversed: true,
        reversalEffectiveAt: new Date("2026-09-02T00:00:00.000Z"),
        latestEffectiveAt: new Date("2026-09-02T00:00:00.000Z"),
      },
    })
  })
  test("purchase correction exposes latest activity and all reversal markers, refusing a CREDIT supplier source", async () => {
    const at = new Date("2026-09-01T10:00:00.000Z")
    const later = new Date("2026-09-05T12:00:00.000Z")
    const payment = {
      id: "payment",
      amountMinor: 5000n,
      actorUserId: "owner",
      effectiveAt: at,
      reversedAt: null,
      reversalEffectiveAt: null,
      bill: {
        id: "purchase",
        bookId: "book",
        kind: "PURCHASE",
        supplierId: "supplier",
      },
      supplierEntry: {
        id: "supplier-entry",
        bookId: "book",
        kind: "PURCHASE_PAYMENT",
        side: "DEBIT",
        journalEntryId: "entry",
        paymentId: "payment",
        supplierId: "supplier",
        billId: "purchase",
        moneyAccountId: "bank",
        amountMinor: 5000n,
        actorUserId: "owner",
        effectiveAt: at,
        description: "Original payment",
        reversals: [] as Array<{ id: string; effectiveAt: Date }>,
        journalEntry: {
          actorUserId: "owner",
          effectiveAt: at,
          description: "Original payment",
          reversalOfId: null,
          reversal: null as null | { id: string; effectiveAt: Date },
        },
      },
    }
    const db = fixture({
      entry: {
        ...postedEntry("PURCHASE_PAYMENT"),
        sourceId: "payment",
        lines: [{ debitMinor: 0n, creditMinor: 5000n }],
      },
      models: {
        financeBillPayment: { findFirst: async () => payment },
        financeSupplierEntry: {
          aggregate: async ({ where }: { where: unknown }) => {
            expect(where).toEqual({
              bookId: "book",
              billId: "purchase",
              supplierId: "supplier",
            })
            return { _max: { effectiveAt: later } }
          },
        },
      },
    })
    expect(
      (await resolveFinanceBankCorrectionSource(db, input)).target,
    ).toMatchObject({
      kind: "PURCHASE",
      payment: {
        reversed: false,
        reversedAt: null,
        reversalEffectiveAt: null,
        latestEffectiveAt: later,
      },
    })
    payment.supplierEntry.journalEntry.reversal = {
      id: "journal-reversal",
      effectiveAt: later,
    }
    expect(
      (await resolveFinanceBankCorrectionSource(db, input)).target,
    ).toMatchObject({
      payment: { reversed: true, reversedAt: null, reversalEffectiveAt: later },
    })
    payment.supplierEntry.journalEntry.reversal = null
    payment.supplierEntry.reversals = [
      { id: "supplier-reversal", effectiveAt: later },
    ]
    expect(
      (await resolveFinanceBankCorrectionSource(db, input)).target,
    ).toMatchObject({ payment: { reversed: true, reversalEffectiveAt: later } })
    payment.supplierEntry.side = "CREDIT"
    expect(
      (await resolveFinanceBankCorrectionSource(db, input)).target.kind,
    ).toBe("UNAVAILABLE")
  })
})
