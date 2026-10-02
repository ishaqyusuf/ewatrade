import { describe, expect, test } from "bun:test"
import {
  assertOriginalSupplierPosting,
  normalizeFinanceSupplier,
  normalizeFinanceSupplierDescription,
} from "./supplier-rules"

function originalPosting(
  overrides: Partial<Parameters<typeof assertOriginalSupplierPosting>[0]> = {},
) {
  return {
    kind: "ADVANCE" as const,
    side: "DEBIT" as const,
    amountMinor: BigInt(2750),
    moneyAccountId: "cash-1",
    entryId: "entry-1",
    supplierId: "supplier-1",
    supplierActorUserId: "user-1",
    supplierEffectiveAt: new Date("2026-01-01T00:00:00.000Z"),
    supplierDescription: "Advance sent",
    bookStartsAt: new Date("2026-01-01T00:00:00.000Z"),
    journal: {
      sourceKind: "SUPPLIER_ADVANCE",
      sourceId: "entry-1",
      reversalOfId: null,
      actorUserId: "user-1",
      effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
      description: "Advance sent",
      lines: [
        {
          accountId: "supplier-advance-1",
          debitMinor: BigInt(2750),
          creditMinor: BigInt(0),
        },
        {
          accountId: "cash-1",
          debitMinor: BigInt(0),
          creditMinor: BigInt(2750),
        },
      ],
    },
    advanceAccountId: "supplier-advance-1",
    payableAccountId: "payable-1",
    openingEquityAccountId: "opening-equity-1",
    ...overrides,
  }
}

describe("supplier write rules", () => {
  test("normalizes supplier identity and bounds supplier descriptions", () => {
    expect(
      normalizeFinanceSupplier({ code: "  acme-1 ", name: "  ACME Ltd  " }),
    ).toEqual({
      code: "ACME-1",
      name: "ACME Ltd",
    })
    expect(() =>
      normalizeFinanceSupplier({ code: "_bad", name: "ACME" }),
    ).toThrow()
    expect(() =>
      normalizeFinanceSupplier({ code: "ACME", name: " " }),
    ).toThrow()
    expect(normalizeFinanceSupplierDescription(` ${"x".repeat(400)} `)).toBe(
      "x".repeat(400),
    )
    expect(() => normalizeFinanceSupplierDescription(" ")).toThrow()
    expect(() => normalizeFinanceSupplierDescription("x".repeat(401))).toThrow()
  })

  test("accepts only the exact source, actor, date, description, and advance lines", () => {
    expect(() => assertOriginalSupplierPosting(originalPosting())).not.toThrow()
    expect(() =>
      assertOriginalSupplierPosting(
        originalPosting({
          journal: { ...originalPosting().journal, sourceId: "another-entry" },
        }),
      ),
    ).toThrow()
    expect(() =>
      assertOriginalSupplierPosting(
        originalPosting({
          journal: {
            ...originalPosting().journal,
            description: "Changed journal description",
          },
        }),
      ),
    ).toThrow()
    expect(() =>
      assertOriginalSupplierPosting(
        originalPosting({
          journal: {
            ...originalPosting().journal,
            lines: [
              {
                accountId: "supplier-advance-1",
                debitMinor: BigInt(2750),
                creditMinor: BigInt(0),
              },
              {
                accountId: "cash-1",
                debitMinor: BigInt(1),
                creditMinor: BigInt(2750),
              },
            ],
          },
        }),
      ),
    ).toThrow()
  })

  test("opening source identity and start-date rules are independently verified", () => {
    const payable = originalPosting({
      kind: "OPENING_PAYABLE",
      side: "CREDIT",
      moneyAccountId: null,
      journal: {
        ...originalPosting().journal,
        sourceKind: "SUPPLIER_OPENING_PAYABLE",
        sourceId: "supplier-1",
        lines: [
          {
            accountId: "opening-equity-1",
            debitMinor: BigInt(2750),
            creditMinor: BigInt(0),
          },
          {
            accountId: "payable-1",
            debitMinor: BigInt(0),
            creditMinor: BigInt(2750),
          },
        ],
      },
    })
    expect(() => assertOriginalSupplierPosting(payable)).not.toThrow()
    expect(() =>
      assertOriginalSupplierPosting({
        ...payable,
        journal: { ...payable.journal, sourceKind: "SUPPLIER_ADVANCE" },
      }),
    ).toThrow()
    expect(() =>
      assertOriginalSupplierPosting({ ...payable, moneyAccountId: "cash-1" }),
    ).toThrow()
    expect(() =>
      assertOriginalSupplierPosting({
        ...payable,
        supplierEffectiveAt: new Date("2026-01-02T00:00:00.000Z"),
        journal: {
          ...payable.journal,
          effectiveAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      }),
    ).toThrow()
  })
})
