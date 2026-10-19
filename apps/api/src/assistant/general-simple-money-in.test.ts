import { afterAll, beforeAll, expect, test } from "bun:test"
const oldKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "m".repeat(32)
})
afterAll(() => {
  if (oldKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldKey
})
import { simpleMoneyInAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import { simpleMoneyInRecord } from "./general-simple-money-in"
function context(role = "OWNER", startsAt = new Date("2026-01-01")) {
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
      financeBook: {
        findUnique: async () => ({ id: "book", currencyCode: "NGN" }),
        findFirst: async () => ({
          id: "book",
          startsAt,
          closedThrough: null,
        }),
      },
      financeAccount: {
        findMany: async () => [
          {
            id: "cash",
            name: "Shop cash",
            purpose: "CASH",
            paymentMethods: [],
            paymentsPausedAt: null,
          },
          {
            id: "bank",
            name: "Ishaq PalmPay",
            purpose: "BANK",
            paymentMethods: [],
            paymentsPausedAt: null,
          },
        ],
      },
    },
  } as unknown as GeneralTransactionContext
}
test("money-in defaults current time and exact account without note", async () => {
  const p = await simpleMoneyInRecord.prepare(
    context(),
    simpleMoneyInAction.parse({
      action: "money_in_record",
      amountMinor: 2000000,
      accountName: "shop cash",
    }),
  )
  expect(p).toMatchObject({
    moneyAccountId: "cash",
    accountName: "Shop cash",
    createAccount: false,
    description: "",
  })
  expect(new Date(p.effectiveAt ?? "invalid").getTime()).toBeGreaterThan(
    Date.now() - 10000,
  )
  const review = await simpleMoneyInRecord.review(context(), p)
  expect(review.lines[0]).toContain("₦20,000.00 into Shop cash")
  expect(review.lines.join(" ")).toContain("Owner funds")
  expect(review.lines).toHaveLength(2)
})
test("new names stage on confirm, fuzzy matches require choice, cash alias works", async () => {
  const draft = simpleMoneyInAction.parse({
    action: "money_in_record",
    amountMinor: 500000,
  })
  expect(
    await simpleMoneyInRecord.prepare(context(), {
      ...draft,
      accountName: "Missing Bank",
    }),
  ).toMatchObject({ createAccount: true, accountName: "Missing Bank" })
  const fuzzy = await simpleMoneyInRecord.prepare(context(), {
    ...draft,
    accountName: "PalmPay Ishaq",
  })
  expect(fuzzy.createAccount).toBe(false)
  const review = await simpleMoneyInRecord.review(context(), fuzzy)
  expect(review.question).toBe("Which account?")
  expect(review.choices).toContainEqual({
    label: "Ishaq PalmPay",
    text: "Use account: bank",
  })
  expect(
    await simpleMoneyInRecord.prepare(context(), {
      ...draft,
      accountName: "cash",
    }),
  ).toMatchObject({ moneyAccountId: "cash", accountName: "Shop cash" })
})
test("incomplete, foreign-account, future-date and non-finance actor guards remain", async () => {
  const draft = simpleMoneyInAction.parse({ action: "money_in_record" })
  await expect(
    simpleMoneyInRecord.validate(context(), draft, true),
  ).rejects.toBeDefined()
  await expect(
    simpleMoneyInRecord.validate(
      context(),
      { ...draft, moneyAccountId: "other-business" },
      false,
    ),
  ).rejects.toBeDefined()
  await expect(
    simpleMoneyInRecord.prepare(context("CASHIER"), draft),
  ).rejects.toBeDefined()
  await expect(
    simpleMoneyInRecord.validate(
      context(),
      { ...draft, effectiveAt: new Date(Date.now() + 60000).toISOString() },
      false,
    ),
  ).rejects.toBeDefined()
})

test("first bookkeeping day clamps an earlier time; pre-book dates still fail", async () => {
  const ctx = context("OWNER", new Date("2026-01-01T18:00:00.000Z"))
  const input = simpleMoneyInAction.parse({
    action: "money_in_record",
    amountMinor: 100,
    accountName: "Shop cash",
    effectiveAt: "2026-01-01T12:00:00.000Z",
  })
  expect((await simpleMoneyInRecord.prepare(ctx, input)).effectiveAt).toBe(
    "2026-01-01T18:00:00.000Z",
  )
  await expect(
    simpleMoneyInRecord.prepare(ctx, {
      ...input,
      effectiveAt: "2025-12-31T12:00:00.000Z",
    }),
  ).rejects.toThrow("Bookkeeping starts on")
})
