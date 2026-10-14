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
import { simpleTransferAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import { simpleTransferRecord } from "./general-simple-transfer"
function context(role = "OWNER") {
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
      assistantAttachment: { findMany: async () => [] },
      financeBook: {
        findUnique: async () => ({
          id: "book",
          currencyCode: "NGN",
          startsAt: new Date("2026-01-01"),
          closedThrough: null,
        }),
        findFirst: async () => ({
          id: "book",
          startsAt: new Date("2026-01-01"),
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

test("source reuses exact/cash; missing destination stages without writing", async () => {
  const p = await simpleTransferRecord.prepare(
    context(),
    simpleTransferAction.parse({
      action: "money_transfer_simple",
      amountMinor: 500000,
      fromAccountName: "cash",
      toAccountName: "New bank",
    }),
  )
  expect(p).toMatchObject({
    fromMoneyAccountId: "cash",
    fromAccountName: "Shop cash",
    bookId: "book",
    newToAccount: { name: "New bank", kind: "BANK" },
    note: "",
  })
  const q = await simpleTransferRecord.prepare(context(), {
    ...p,
    toAccountName: "PalmPay Ishaq",
    newToAccount: undefined,
  })
  expect(q.newToAccount).toBeUndefined()
  const review = await simpleTransferRecord.review(context(), q)
  expect(review.question).toBe("To which account?")
  expect(review.choices).toContainEqual({
    label: "Ishaq PalmPay",
    text: "Use to account: bank",
  })
})
test("unknown source offers existing choices; foreign/same/role/date refuse", async () => {
  const base = simpleTransferAction.parse({
    action: "money_transfer_simple",
    amountMinor: 100,
    fromAccountName: "Unknown",
  })
  const p = await simpleTransferRecord.prepare(context(), base)
  expect(p.fromMoneyAccountId).toBeUndefined()
  expect(
    (await simpleTransferRecord.review(context(), p)).choices,
  ).toHaveLength(2)
  await expect(
    simpleTransferRecord.validate(context(), p, true),
  ).rejects.toBeDefined()
  await expect(
    simpleTransferRecord.prepare(context(), {
      ...base,
      fromMoneyAccountId: "foreign",
    }),
  ).rejects.toBeDefined()
  await expect(
    simpleTransferRecord.validate(
      context(),
      { ...base, fromMoneyAccountId: "cash", toMoneyAccountId: "cash" },
      false,
    ),
  ).rejects.toBeDefined()
  await expect(
    simpleTransferRecord.prepare(context("CASHIER"), base),
  ).rejects.toBeDefined()
  await expect(
    simpleTransferRecord.validate(
      context(),
      { ...base, effectiveAt: new Date(Date.now() + 60000).toISOString() },
      false,
    ),
  ).rejects.toBeDefined()
})
