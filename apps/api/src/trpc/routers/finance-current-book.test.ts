import { expect, test } from "bun:test"
import {
  financeBillsReadSchema,
  financeBookSchema,
  financeReadBookSchema,
} from "../../schemas/finance"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"
const createCaller = createCallerFactory(financeRouter)
function fixture(role = "OWNER", plan = "starter") {
  const raw: unknown[][] = []
  const books: unknown[] = []
  const tx = {
    $queryRaw: async (_query: TemplateStringsArray, ...values: unknown[]) => {
      raw.push(values)
      return [
        {
          id: "tenant-a",
          currencyCode: "NGN",
          timezone: "UTC",
          isActive: true,
          role: "OWNER",
          status: "ACTIVE",
        },
      ]
    },
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant-a",
          currencyCode: "NGN",
          timezone: "UTC",
          isActive: true,
        },
      }),
    },
    financeBook: {
      findFirst: async (args: unknown) => {
        books.push(args)
        return null
      },
    },
  }
  let transactions = 0
  const db = {
    $transaction: async (work: (tx: unknown) => unknown) => {
      transactions++
      return work(tx)
    },
  }
  const caller = createCaller({
    db,
    requestHeaders: new Headers(),
    requestId: "inert-current-book",
    session: {
      session: { id: "inert", token: "inert" },
      user: { id: "actor-a" },
    },
    tenantContext: {
      tenant: { id: "tenant-a", qaPurgeStartedAt: null, retailOpsPlanId: plan },
      membership: { id: "member-a", role },
    },
  } as never)
  return { caller, raw, books, transactions: () => transactions }
}
test("only the three read inputs allow a strict current-currency alternative", () => {
  expect(financeReadBookSchema.parse({ bookId: "book-a" })).toEqual({
    bookId: "book-a",
  })
  expect(financeReadBookSchema.parse({ currentCurrency: "NGN" })).toEqual({
    currentCurrency: "NGN",
  })
  expect(
    financeBillsReadSchema.parse({ currentCurrency: "NGN", limit: 5 }),
  ).toEqual({ currentCurrency: "NGN", limit: 5 })
  expect(financeBookSchema.safeParse({ currentCurrency: "NGN" }).success).toBe(
    false,
  )
  for (const input of [
    {},
    { currentCurrency: "ngn" },
    { currentCurrency: "USD' OR true --" },
    { currentCurrency: "NGN", bookId: "a" },
    { currentCurrency: "NGN", tenantId: "b" },
    { currentCurrency: "NGN", actorUserId: "b" },
  ])
    expect(financeReadBookSchema.safeParse(input).success).toBe(false)
  for (const input of [
    { currentCurrency: "NGN" },
    { currentCurrency: "NGN", limit: 30 },
    { currentCurrency: "NGN", limit: 5, cursor: "unsupported" },
    { currentCurrency: "NGN", limit: 5, query: "hidden" },
    { currentCurrency: "NGN", limit: 5, storeId: "foreign" },
  ])
    expect(financeBillsReadSchema.safeParse(input).success).toBe(false)
})
for (const method of ["balances", "owedSummary", "bills"] as const) {
  const invoke = (
    caller: ReturnType<typeof fixture>["caller"],
    input: { currentCurrency: string; tenantId?: string },
  ) =>
    method === "bills"
      ? caller.bills({ ...input, limit: 5 })
      : caller[method](input)
  const input = { currentCurrency: "NGN" }
  test(`${method} derives actor/business from protected context and selects only the current currency`, async () => {
    const f = fixture()
    await expect(invoke(f.caller, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    expect(f.raw).toEqual([["tenant-a", "actor-a"]])
    expect(f.books).toEqual([
      {
        where: { tenantId: "tenant-a", currencyCode: "NGN" },
        ...(method === "owedSummary"
          ? { select: { id: true, currencyCode: true, lastSequence: true } }
          : {}),
      },
    ])
  })
  test(`${method} retains Owner/Admin plan gates and rejects forged scope before DB work`, async () => {
    for (const [role, plan] of [
      ["MANAGER", "starter"],
      ["OWNER", "free"],
    ]) {
      const f = fixture(role, plan)
      await expect(invoke(f.caller, input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(f.transactions()).toBe(0)
    }
    const f = fixture()
    await expect(
      invoke(f.caller, { ...input, tenantId: "foreign" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(f.transactions()).toBe(0)
  })
}
