import { afterAll, beforeAll, expect, test } from "bun:test"
import { simpleExpenseAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import { simpleExpenseRecord } from "./general-simple-expense"
const oldKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "e".repeat(32)
})
afterAll(() => {
  if (oldKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldKey
})
function context(role = "OWNER", closed = false) {
  const book = {
    id: "book",
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01T18:00:00.000Z"),
    closedThrough: closed ? new Date() : null,
  }
  const rows = [
    {
      id: "cash",
      name: "Shop cash",
      purpose: "CASH",
      kind: "ASSET",
      code: "1000",
    },
    {
      id: "bank",
      name: "Ishaq PalmPay",
      purpose: "BANK",
      kind: "ASSET",
      code: "1100",
    },
    {
      id: "expense",
      name: "Operating expenses",
      purpose: "OPERATING_EXPENSE",
      kind: "EXPENSE",
      code: "6000",
    },
    {
      id: "feed",
      name: "Feed",
      purpose: "OPERATING_EXPENSE",
      kind: "EXPENSE",
      code: "6001",
    },
  ]
  return {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "QA",
        currencyCode: "NGN",
        retailOpsPlanId: "pro",
        timezone: "Africa/Lagos",
      },
      membership: { id: "member", role },
      activeStore: { id: "store", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: role,
        assignments: [],
      },
    },
    db: {
      $queryRaw: async () => [],
      membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
      store: { findFirst: async () => ({ id: "store" }) },
      financeBook: {
        findUnique: async () => book,
        findFirst: async () => book,
      },
      financeAccount: {
        findMany: async (args: { where: { id?: { in: string[] } } }) =>
          args.where.id
            ? rows.filter((a) => args.where.id?.in.includes(a.id))
            : rows,
        findUnique: async () => ({
          id: "payable",
          name: "Accounts payable",
          archivedAt: null,
        }),
        findFirst: async (args: { where: { id?: string } }) =>
          rows.find((a) => a.id === args.where.id),
      },
    },
  } as unknown as GeneralTransactionContext
}
const caption = () =>
  simpleExpenseAction.parse({
    action: "expense_record_simple",
    amountMinor: 500000,
    description: "feed",
    accountName: "shop CASH",
    paid: true,
  })
test("defaults exact category/account and current time; optional payee is not invented", async () => {
  const d = await simpleExpenseRecord.prepare(context(), caption())
  expect(d).toMatchObject({
    bookId: "book",
    moneyAccountId: "cash",
    accountName: "Shop cash",
    expenseCategoryId: "feed",
    categoryName: "Feed",
    paid: true,
  })
  expect(d.payeeName).toBeUndefined()
  expect(Date.now() - Date.parse(d.effectiveAt)).toBeLessThan(5000)
  expect(
    (await simpleExpenseRecord.review(context(), d)).question,
  ).toBeUndefined()
  expect((await simpleExpenseRecord.review(context(), d)).lines).toContain(
    "Paid from Shop cash",
  )
})
test("fallback category is existing Operating expenses; unknown spending account/category require choices", async () => {
  const d = await simpleExpenseRecord.prepare(context(), {
    ...caption(),
    description: "transport",
    accountName: "Unknown bank",
  })
  expect(d).toMatchObject({
    expenseCategoryId: "expense",
    categoryName: "Operating expenses",
  })
  expect(d.moneyAccountId).toBeUndefined()
  const r = await simpleExpenseRecord.review(context(), d)
  expect(r.question).toBe("Which account did it come from?")
  expect(r.choices.map((choice) => choice.label)).toEqual([
    "Shop cash",
    "Ishaq PalmPay",
  ])
  const explicit = await simpleExpenseRecord.prepare(context(), {
    ...caption(),
    categoryName: "Unknown category",
  })
  expect(explicit.expenseCategoryId).toBeUndefined()
  expect(
    (await simpleExpenseRecord.review(context(), explicit)).choices.length,
  ).toBe(2)
})
test("unpaid clears funding and canonical review has no payment; Finance permissions and source guards remain", async () => {
  const d = await simpleExpenseRecord.prepare(context(), {
    ...caption(),
    paid: false,
    moneyAccountId: "cash",
  })
  expect(d.moneyAccountId).toBeUndefined()
  expect(d.accountName).toBeUndefined()
  expect((await simpleExpenseRecord.review(context(), d)).lines).toContain(
    "Unpaid",
  )
  await expect(
    simpleExpenseRecord.prepare(context("CASHIER"), caption()),
  ).rejects.toBeDefined()
  for (const change of [
    { bookId: "other" },
    { moneyAccountId: "foreign" },
    { expenseCategoryId: "foreign" },
  ])
    await expect(
      simpleExpenseRecord.validate(context(), { ...d, ...change }, true),
    ).rejects.toBeDefined()
  await expect(
    simpleExpenseRecord.validate(
      context(),
      simpleExpenseAction.parse({ action: "expense_record_simple" }),
      true,
    ),
  ).rejects.toBeDefined()
  await expect(
    simpleExpenseRecord.review(context(), {
      ...d,
      effectiveAt: new Date(Date.now() + 60000).toISOString(),
    }),
  ).rejects.toBeDefined()
  await expect(
    simpleExpenseRecord.review(context("OWNER", true), d),
  ).rejects.toBeDefined()
})
test("first-day timestamps clamp but earlier calendar days remain refused", async () => {
  expect(
    (
      await simpleExpenseRecord.prepare(context(), {
        ...caption(),
        effectiveAt: "2026-01-01T12:00:00.000Z",
      })
    ).effectiveAt,
  ).toBe("2026-01-01T18:00:00.000Z")
  await expect(
    simpleExpenseRecord.prepare(context(), {
      ...caption(),
      effectiveAt: "2025-12-31T12:00:00.000Z",
    }),
  ).rejects.toThrow("Bookkeeping starts on")
})
