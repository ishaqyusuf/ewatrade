import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { MAX_FINANCE_AMOUNT } from "./rules"
import { getFinanceSupplierEntryReversalReview } from "./supplier-writes"
const startsAt = new Date("2026-01-01T00:00:00Z"),
  originalAt = new Date("2026-09-02T12:00:00.123Z")
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  entryId: "entry",
  effectiveAt: new Date("2026-09-05T12:00:00.123Z"),
  reason: " Correct original supplier source ",
}
function fixture(
  kind: "OPENING_PAYABLE" | "OPENING_ADVANCE" | "ADVANCE" = "ADVANCE",
) {
  const account = (
    code: string,
    name: string,
    kind: string,
    purpose: string,
  ) => ({
    id: code,
    bookId: "book",
    code,
    name,
    kind,
    purpose,
    archivedAt: null as Date | null,
  })
  const accounts = [
    account("1250", "Supplier advances", "ASSET", "SUPPLIER_ADVANCE"),
    account("2000", "Supplier payable", "LIABILITY", "PAYABLE"),
    account("3900", "Opening equity", "EQUITY", "OPENING_EQUITY"),
    account("money", "Shop cash", "ASSET", "CASH"),
  ]
  const get = (code: string) => accounts.find((a) => a.id === code)!
  const debit = kind === "OPENING_PAYABLE" ? "3900" : "1250",
    credit =
      kind === "OPENING_PAYABLE"
        ? "2000"
        : kind === "OPENING_ADVANCE"
          ? "3900"
          : "money"
  const date = kind === "ADVANCE" ? originalAt : startsAt
  const original = {
    id: "entry",
    bookId: "book",
    supplierId: "supplier",
    kind: kind as string,
    side: kind === "OPENING_PAYABLE" ? "CREDIT" : "DEBIT",
    amountMinor: 1100n,
    moneyAccountId: kind === "ADVANCE" ? "money" : (null as string | null),
    actorUserId: "original-actor",
    effectiveAt: date,
    description: "Original supplier source",
    journalEntryId: "journal",
    reversalOfId: null as string | null,
    reversals: [] as Array<{ id: string }>,
    supplier: { id: "supplier", bookId: "book", code: "ACME", name: "ACME" },
    journalEntry: {
      id: "journal",
      bookId: "book",
      sequence: 1n,
      sourceKind: kind === "ADVANCE" ? "SUPPLIER_ADVANCE" : `SUPPLIER_${kind}`,
      sourceId: kind === "ADVANCE" ? "entry" : "supplier",
      reversalOfId: null as string | null,
      reversal: null as { id: string } | null,
      actorUserId: "original-actor",
      effectiveAt: date,
      description: "Original supplier source",
      lines: [
        {
          accountId: debit,
          debitMinor: 1100n,
          creditMinor: 0n,
          account: get(debit),
        },
        {
          accountId: credit,
          debitMinor: 0n,
          creditMinor: 1100n,
          account: get(credit),
        },
      ],
    },
  }
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    startsAt,
    closedThrough: null as Date | null,
  }
  const state = {
    denied: false,
    missingBook: false,
    missingEntry: false,
    allocated: 0n,
    released: 0n,
    openingPayments: 0,
    allocationAt: null as Date | null,
    releaseAt: null as Date | null,
  }
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async () =>
        state.denied ? null : { tenant: { isActive: true } },
    },
    financeBook: { findFirst: async () => (state.missingBook ? null : book) },
    financeSupplierEntry: {
      findFirst: async () => (state.missingEntry ? null : original),
      count: async () => state.openingPayments,
    },
    financeAccount: {
      findUnique: async ({
        where,
      }: { where: { bookId_code: { code: string } } }) =>
        get(where.bookId_code.code),
      findFirst: async () => get("money"),
    },
    financeSupplierAllocation: {
      aggregate: async () => ({
        _sum: { amountMinor: state.allocated },
        _max: { effectiveAt: state.allocationAt },
      }),
    },
    financeSupplierAllocationRelease: {
      aggregate: async () => ({
        _sum: { amountMinor: state.released },
        _max: { effectiveAt: state.releaseAt },
      }),
    },
  } as unknown as Prisma.TransactionClient
  return { tx, original, book, state, accounts }
}
test("all three original supplier kinds reverse whole original controls with separate effects", async () => {
  for (const kind of [
    "OPENING_PAYABLE",
    "OPENING_ADVANCE",
    "ADVANCE",
  ] as const) {
    const f = fixture(kind),
      r = await getFinanceSupplierEntryReversalReview(f.tx, input)
    expect(r).toMatchObject({
      kind,
      entryId: "entry",
      supplierId: "supplier",
      supplierName: "ACME",
      amountMinor: "1100",
      originalActorUserId: "original-actor",
      originalEffectiveAt: f.original.effectiveAt.toISOString(),
      effectiveAt: input.effectiveAt.toISOString(),
      reason: input.reason.trim(),
      stockEffect: "NONE",
      moneyTransfer: "NOT_PERFORMED",
      payableDecreaseMinor: kind === "OPENING_PAYABLE" ? "1100" : "0",
      unallocatedAdvanceDecreaseMinor:
        kind === "OPENING_PAYABLE" ? "0" : "1100",
      recordedMoneyIncreaseMinor: kind === "ADVANCE" ? "1100" : "0",
    })
    expect(
      r.lines.map((l) => ({
        id: l.accountId,
        debit: l.debitMinor,
        credit: l.creditMinor,
      })),
    ).toEqual(
      f.original.journalEntry.lines
        .map((l) => ({
          id: l.accountId,
          debit: l.creditMinor.toString(),
          credit: l.debitMinor.toString(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    )
  }
})
test("fully released advances retain original allocation/release chronology", async () => {
  const f = fixture()
  f.state.allocated = 1100n
  f.state.released = 1100n
  f.state.allocationAt = originalAt
  f.state.releaseAt = input.effectiveAt
  expect(
    (await getFinanceSupplierEntryReversalReview(f.tx, input)).settlement,
  ).toEqual({
    allocatedMinor: "1100",
    releasedMinor: "1100",
    latestAt: input.effectiveAt.toISOString(),
  })
})
test("wrong source, authority, cutoff, consumed funds and malformed original proof refuse", async () => {
  type F = ReturnType<typeof fixture>
  const probes: Array<
    ["OPENING_PAYABLE" | "OPENING_ADVANCE" | "ADVANCE", (f: F) => void]
  > = [
    [
      "ADVANCE",
      (f) => {
        f.state.denied = true
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.state.missingBook = true
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.state.missingEntry = true
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.book.closedThrough = input.effectiveAt
      },
    ],
    ...["PURCHASE_BILL", "PAYMENT", "ALLOCATION", "REVERSAL"].map(
      (kind) =>
        [
          "ADVANCE",
          (f: F) => {
            f.original.kind = kind
          },
        ] as ["ADVANCE", (f: F) => void],
    ),
    [
      "ADVANCE",
      (f) => {
        f.original.reversalOfId = "other"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.reversals = [{ id: "corrected" }]
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.reversal = { id: "corrected" }
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.effectiveAt = new Date("2026-09-06T00:00:00Z")
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.state.allocated = 100n
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.state.allocated = 100n
        f.state.released = 100n
        f.state.releaseAt = new Date("2026-09-06T00:00:00Z")
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.moneyAccountId = null
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.accounts[3]!.purpose = "EXPENSE"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.sourceKind = "OTHER"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.sourceId = "other"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.actorUserId = "other"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.description = "changed"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.lines[0]!.debitMinor = 1099n
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.amountMinor = 0n
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.amountMinor = MAX_FINANCE_AMOUNT + 1n
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.supplier.bookId = "other"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.original.journalEntry.bookId = "other"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.accounts[3]!.bookId = "other"
      },
    ],
    [
      "ADVANCE",
      (f) => {
        f.accounts[3]!.archivedAt = originalAt
      },
    ],
    [
      "OPENING_PAYABLE",
      (f) => {
        f.original.effectiveAt = originalAt
        f.original.journalEntry.effectiveAt = originalAt
      },
    ],
    [
      "OPENING_ADVANCE",
      (f) => {
        f.accounts[2]!.purpose = "CAPITAL"
      },
    ],
  ]
  for (const [kind, change] of probes) {
    const f = fixture(kind)
    change(f)
    await expect(
      getFinanceSupplierEntryReversalReview(f.tx, input),
    ).rejects.toThrow()
  }
  for (const change of [
    { reason: "" },
    { reason: "x".repeat(401) },
    { effectiveAt: new Date("bad") },
  ])
    await expect(
      getFinanceSupplierEntryReversalReview(fixture().tx, {
        ...input,
        ...change,
      }),
    ).rejects.toThrow()
})

test("a starting balance cannot be undone while payments toward it stand", async () => {
  const f = fixture("OPENING_PAYABLE")
  f.state.openingPayments = 1
  await expect(
    getFinanceSupplierEntryReversalReview(f.tx, input),
  ).rejects.toThrow(
    "Undo the payments toward this starting balance before undoing it.",
  )
})
