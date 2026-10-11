import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getFinanceSupplierCreationReview } from "./supplier-create-review"

const input = {
  tenantId: "tenant", actorUserId: "owner", bookId: "book",
  code: " acme-1 ", name: " ACME Ltd ",
}

function fixture(options: { denied?: boolean; missingBook?: boolean; duplicate?: boolean } = {}) {
  const calls: string[] = []
  const tx = {
    $queryRaw: async () => { calls.push("authority-lock"); return [] },
    membership: { findFirst: async (args: unknown) => {
      calls.push("authority")
      expect(args).toMatchObject({ where: {
        tenantId: "tenant", userId: "owner", status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
      } })
      return options.denied ? null : { tenant: { isActive: true } }
    } },
    financeBook: { findFirst: async (args: unknown) => {
      calls.push("book")
      expect(args).toMatchObject({ where: { id: "book", tenantId: "tenant" } })
      return options.missingBook ? null : { id: "book", currencyCode: "NGN" }
    } },
    financeSupplierAccount: { findUnique: async (args: unknown) => {
      calls.push("supplier")
      expect(args).toEqual({ where: { bookId_code: { bookId: "book", code: "ACME-1" } }, select: { id: true } })
      return options.duplicate ? { id: "existing" } : null
    } },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}

test("supplier review scopes normalized identity and separates creation from financial effects", async () => {
  const { tx, calls } = fixture()
  expect(await getFinanceSupplierCreationReview(tx, input)).toEqual({
    bookId: "book", currencyCode: "NGN", code: "ACME-1", name: "ACME Ltd",
    payableMinor: "0", advanceMinor: "0", moneyTransfer: "NOT_PERFORMED",
  })
  expect(calls).toEqual(["authority-lock", "authority", "book", "supplier"])
})

test("supplier review checks fresh authority before looking up a Book or supplier", async () => {
  const { tx, calls } = fixture({ denied: true })
  await expect(getFinanceSupplierCreationReview(tx, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(calls).toEqual(["authority-lock", "authority"])
})

test("supplier review refuses unavailable Books and duplicate normalized codes", async () => {
  const missing = fixture({ missingBook: true })
  await expect(getFinanceSupplierCreationReview(missing.tx, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(missing.calls).not.toContain("supplier")
  await expect(getFinanceSupplierCreationReview(fixture({ duplicate: true }).tx, input)).rejects.toMatchObject({ code: "CONFLICT" })
})

test("supplier review uses canonical code and name bounds before querying identity", async () => {
  for (const change of [{ code: "_bad" }, { code: "x".repeat(41) }, { name: " " }, { name: "x".repeat(161) }]) {
    const { tx, calls } = fixture()
    await expect(getFinanceSupplierCreationReview(tx, { ...input, ...change })).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
    expect(calls).not.toContain("supplier")
  }
})
