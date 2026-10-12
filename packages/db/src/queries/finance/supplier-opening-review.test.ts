import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  getFinanceSupplierOpeningReview,
  reviewSupplierOpeningSource,
} from "./supplier-opening-review"
const startsAt = new Date("2026-01-01T00:00:00.123Z")
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  supplierId: "supplier",
  kind: "PAYABLE" as const,
  amountMinor: "600",
  description: " Opening balance ",
}
function fixture() {
  const state = {
    denied: false,
    missingBook: false,
    missingSupplier: false,
    prior: null as { id: string } | null,
    book: {
      id: "book",
      tenantId: "tenant",
      currencyCode: "NGN",
      startsAt,
      closedThrough: null as Date | null,
    },
    supplier: { id: "supplier", bookId: "book", name: "ACME", code: "ACME" },
    accounts: [
      {
        id: "payable",
        bookId: "book",
        code: "2000",
        name: "Supplier payable",
        kind: "LIABILITY",
        purpose: "PAYABLE",
        archivedAt: null as Date | null,
      },
      {
        id: "advance",
        bookId: "book",
        code: "1250",
        name: "Supplier advance",
        kind: "ASSET",
        purpose: "SUPPLIER_ADVANCE",
        archivedAt: null as Date | null,
      },
      {
        id: "equity",
        bookId: "book",
        code: "3900",
        name: "Opening equity",
        kind: "EQUITY",
        purpose: "OPENING_EQUITY",
        archivedAt: null as Date | null,
      },
    ],
    calls: [] as string[],
  }
  const tx = {
    $queryRaw: async () => {
      state.calls.push("authority-lock")
      return []
    },
    membership: {
      findFirst: async (args: unknown) => {
        state.calls.push("authority")
        expect(args).toMatchObject({
          where: {
            tenantId: "tenant",
            userId: "owner",
            status: "ACTIVE",
            role: { in: ["OWNER", "ADMIN"] },
          },
        })
        return state.denied ? null : { tenant: { isActive: true } }
      },
    },
    financeBook: {
      findFirst: async (args: unknown) => {
        state.calls.push("book")
        expect(args).toEqual({ where: { id: "book", tenantId: "tenant" } })
        return state.missingBook ? null : state.book
      },
    },
    financeSupplierAccount: {
      findFirst: async (args: unknown) => {
        state.calls.push("supplier")
        expect(args).toMatchObject({
          where: { id: "supplier", bookId: "book" },
        })
        return state.missingSupplier ? null : state.supplier
      },
    },
    financeSupplierEntry: {
      findFirst: async (args: unknown) => {
        state.calls.push("prior")
        expect(args).toMatchObject({
          where: { bookId: "book", supplierId: "supplier" },
        })
        expect(Object.keys((args as { where: object }).where).sort()).toEqual([
          "bookId",
          "kind",
          "supplierId",
        ])
        return state.prior
      },
    },
    financeAccount: {
      findUnique: async (args: {
        where: { bookId_code: { bookId: string; code: string } }
      }) => {
        state.calls.push("account:" + args.where.bookId_code.code)
        expect(args.where.bookId_code.bookId).toBe("book")
        return (
          state.accounts.find((a) => a.code === args.where.bookId_code.code) ??
          null
        )
      },
    },
  } as unknown as Prisma.TransactionClient
  return { state, tx }
}
test("opening review derives exact Book start and opposite control/equity lines for both kinds", async () => {
  for (const kind of ["PAYABLE", "ADVANCE"] as const) {
    const { tx } = fixture()
    const r = await getFinanceSupplierOpeningReview(tx, { ...input, kind })
    expect(r).toMatchObject({
      bookId: "book",
      supplierId: "supplier",
      supplierName: "ACME",
      supplierCode: "ACME",
      kind,
      entryKind: `OPENING_${kind}`,
      amountMinor: "600",
      description: "Opening balance",
      effectiveAt: startsAt.toISOString(),
      startsAt: startsAt.toISOString(),
      closedThrough: null,
      payableIncreaseMinor: kind === "PAYABLE" ? "600" : "0",
      unallocatedAdvanceIncreaseMinor: kind === "ADVANCE" ? "600" : "0",
      stockEffect: "NONE",
      moneyTransfer: "NOT_PERFORMED",
      moneyAccountEffect: "NONE",
      purchaseEffect: "NONE",
    })
    expect(r.lines).toEqual(
      kind === "PAYABLE"
        ? [
            {
              accountId: "equity",
              accountName: "Opening equity",
              code: "3900",
              kind: "EQUITY",
              purpose: "OPENING_EQUITY",
              debitMinor: "600",
              creditMinor: "0",
            },
            {
              accountId: "payable",
              accountName: "Supplier payable",
              code: "2000",
              kind: "LIABILITY",
              purpose: "PAYABLE",
              debitMinor: "0",
              creditMinor: "600",
            },
          ]
        : [
            {
              accountId: "advance",
              accountName: "Supplier advance",
              code: "1250",
              kind: "ASSET",
              purpose: "SUPPLIER_ADVANCE",
              debitMinor: "600",
              creditMinor: "0",
            },
            {
              accountId: "equity",
              accountName: "Opening equity",
              code: "3900",
              kind: "EQUITY",
              purpose: "OPENING_EQUITY",
              debitMinor: "0",
              creditMinor: "600",
            },
          ],
    )
  }
})
test("opening review refuses authority, scope, any prior opening, invalid values and closed starts", async () => {
  for (const mutate of [
    (s: ReturnType<typeof fixture>["state"]) => {
      s.denied = true
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.missingBook = true
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.missingSupplier = true
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.supplier.bookId = "other"
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.prior = { id: "prior-including-reversed" }
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.book.closedThrough = startsAt
    },
    (s: ReturnType<typeof fixture>["state"]) => {
      s.book.startsAt = new Date("2999-01-01T00:00:00Z")
    },
  ]) {
    const { state, tx } = fixture()
    mutate(state)
    await expect(
      getFinanceSupplierOpeningReview(tx, input),
    ).rejects.toBeInstanceOf(Error)
    if (state.denied)
      expect(state.calls).toEqual(["authority-lock", "authority"])
    expect(state.calls.some((c) => c.startsWith("account:"))).toBe(false)
  }
  for (const change of [
    { kind: "BAD" },
    { amountMinor: "0" },
    { amountMinor: "100000000000001" },
    { description: " " },
    { description: "x".repeat(401) },
  ]) {
    const { tx } = fixture()
    await expect(
      getFinanceSupplierOpeningReview(tx, {
        ...input,
        ...change,
      } as typeof input),
    ).rejects.toBeInstanceOf(Error)
  }
  const { tx, state } = fixture()
  await expect(
    reviewSupplierOpeningSource(
      tx,
      { ...input, effectiveAt: new Date(startsAt.getTime() + 1) },
      state.book as never,
    ),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  expect(state.calls).toHaveLength(0)
})
test("opening review requires both original active controls of the exact Book/kind/purpose", async () => {
  for (const kind of ["PAYABLE", "ADVANCE"] as const)
    for (const code of [kind === "PAYABLE" ? "2000" : "1250", "3900"])
      for (const change of ["missing", "archived", "kind", "purpose", "book"]) {
        const { tx, state } = fixture()
        const account = state.accounts.find((a) => a.code === code)!
        if (change === "missing")
          state.accounts = state.accounts.filter((a) => a !== account)
        else if (change === "archived") account.archivedAt = new Date()
        else if (change === "kind") account.kind = "INCOME"
        else if (change === "purpose") account.purpose = "CASH"
        else account.bookId = "other"
        await expect(
          getFinanceSupplierOpeningReview(tx, { ...input, kind }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
      }
})
