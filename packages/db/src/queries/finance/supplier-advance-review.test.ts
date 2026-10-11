import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinanceSupplierAdvanceReview } from "./supplier-advance-review"
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  supplierId: "supplier",
  moneyAccountId: "cash",
  amountMinor: "300",
  description: " Paid advance ",
  effectiveAt: new Date("2026-10-05T12:00:00.123Z"),
}
function fixture(
  o: {
    locked?: boolean
    denied?: boolean
    book?: boolean
    closed?: boolean
    supplier?: boolean
    money?: boolean
    control?: boolean
    archived?: boolean
  } = {},
) {
  let bookLocked = false
  return {
    $queryRaw: async (sql: TemplateStringsArray) => {
      if (sql.join(" ").includes("FinanceBook")) {
        bookLocked = true
        return o.book ? [] : [{ id: "book" }]
      }
      return []
    },
    membership: {
      findFirst: async () => (o.denied ? null : { tenant: { isActive: true } }),
    },
    financeBook: {
      findUniqueOrThrow: async () => {
        expect(bookLocked).toBe(true)
        return {
          id: "book",
          currencyCode: "NGN",
          startsAt: new Date("2026-01-01"),
          closedThrough: o.closed ? new Date("2026-10-06") : null,
        }
      },
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({ where: { id: "book", tenantId: "tenant" } })
        return o.book
          ? null
          : {
              id: "book",
              currencyCode: "NGN",
              startsAt: new Date("2026-01-01"),
              closedThrough: o.closed ? new Date("2026-10-06") : null,
            }
      },
    },
    financeSupplierAccount: {
      findFirst: async (a: unknown) => {
        if (o.locked) expect(bookLocked).toBe(true)
        expect(a).toMatchObject({ where: { id: "supplier", bookId: "book" } })
        return o.supplier
          ? null
          : { id: "supplier", name: "Supplier", code: "SUP" }
      },
    },
    financeAccount: {
      findUnique: async (a: unknown) => {
        expect(a).toMatchObject({
          where: { bookId_code: { bookId: "book", code: "1250" } },
        })
        return {
          id: "advance",
          name: "Supplier advance",
          purpose: o.control ? "PAYABLE" : "SUPPLIER_ADVANCE",
          kind: "ASSET",
          archivedAt: o.archived ? new Date() : null,
        }
      },
      findFirst: async (a: unknown) => {
        expect(a).toMatchObject({
          where: {
            id: "cash",
            bookId: "book",
            archivedAt: null,
            kind: "ASSET",
            purpose: { in: ["CASH", "BANK", "CLEARING"] },
          },
        })
        return o.money
          ? null
          : { id: "cash", name: "Shop cash", purpose: "CASH" }
      },
    },
  } as unknown as Prisma.TransactionClient
}
test("advance review adds exact separate unallocated funds without purchase/stock/payable effects", async () => {
  expect(await getFinanceSupplierAdvanceReview(fixture(), input)).toMatchObject(
    {
      supplierName: "Supplier",
      moneyAccountName: "Shop cash",
      amountMinor: "300",
      unallocatedAddedMinor: "300",
      description: "Paid advance",
      effectiveAt: "2026-10-05T12:00:00.123Z",
      effect: "RECORD_ALREADY_PAID_ADVANCE",
      moneyTransfer: "NOT_PERFORMED",
    },
  )
})
test("advance review refuses authority, scope, inactive controls/funding, bad amount/date and closed period", async () => {
  for (const o of [
    { denied: true },
    { book: true },
    { closed: true },
    { supplier: true },
    { money: true },
    { control: true },
    { archived: true },
  ])
    await expect(
      getFinanceSupplierAdvanceReview(fixture(o), input),
    ).rejects.toBeDefined()
  for (const p of [
    { amountMinor: "0" },
    { amountMinor: "100000000000001" },
    { description: " " },
    { description: "x".repeat(401) },
    { effectiveAt: new Date("invalid") },
    { effectiveAt: new Date("2025-12-31") },
    { effectiveAt: new Date("2099-01-01") },
  ])
    await expect(
      getFinanceSupplierAdvanceReview(fixture(), { ...input, ...p }),
    ).rejects.toBeDefined()
})

test("confirmation review holds the scoped Book lock before reading supplier/funding source", async () => {
  expect(
    await getFinanceSupplierAdvanceReview(
      fixture({ locked: true }),
      input,
      true,
    ),
  ).toMatchObject({ bookId: "book", supplierId: "supplier" })
  await expect(
    getFinanceSupplierAdvanceReview(
      fixture({ locked: true, denied: true }),
      input,
      true,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    getFinanceSupplierAdvanceReview(
      fixture({ locked: true, book: true }),
      input,
      true,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})
