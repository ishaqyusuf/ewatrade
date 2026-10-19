import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { simpleTransferAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "../../../../apps/api/src/assistant/general-actions"

// Run alone. Only canonical movement review/posting are replaced; the actual
// adapter's readiness, Book, account, authority and receipt boundaries run.
const canonical = await import("@ewatrade/db/queries")
let commandResult: unknown = { entryId: "entry", sequence: "1" }
mock.module("@ewatrade/db/queries", () => ({
  ...canonical,
  getFinanceMoneyMovementReview: async () => ({ bookId: "book" }),
  recordFinanceMoneyMovementInTransaction: async () => commandResult,
}))
const { simpleTransferRecord, simpleTransferOptions } = await import(
  "../../../../apps/api/src/assistant/general-simple-transfer"
)
const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "t".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})
function context(bookExists = true) {
  const observed = { accountReads: 0 }
  const ctx = {
    session: { user: { id: "actor" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "QA",
        currencyCode: "NGN",
        retailOpsPlanId: "pro",
      },
      membership: { id: "membership", role: "OWNER" },
      activeStore: { id: "store", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: "OWNER",
        mode: "LEGACY",
        status: "ACTIVE",
        assignments: [],
      },
    },
    db: {
      financeBook: {
        findUnique: async () =>
          bookExists
            ? {
                id: "book",
                currencyCode: "NGN",
                startsAt: new Date("2026-01-01T00:00:00Z"),
                closedThrough: null,
              }
            : null,
      },
      financeAccount: {
        findMany: async () => {
          observed.accountReads++
          return [
            { id: "cash", name: "Shop cash", purpose: "CASH" },
            { id: "bank", name: "Bank", purpose: "BANK" },
          ]
        },
      },
      assistantAttachment: { findMany: async () => [] },
    },
  }
  return { ctx: ctx as unknown as GeneralTransactionContext, observed }
}
const payload = simpleTransferAction.parse({
  action: "money_transfer_simple",
  amountMinor: 100,
  bookId: "book",
  fromMoneyAccountId: "cash",
  fromAccountName: "Shop cash",
  toMoneyAccountId: "bank",
  toAccountName: "Bank",
  effectiveAt: "2026-10-01T12:00:00Z",
})

test("a canonical saved journal produces an exact original receipt", async () => {
  commandResult = { entryId: "entry", sequence: "1" }
  expect(
    await simpleTransferRecord.execute(context().ctx, payload, "key"),
  ).toMatchObject({
    kind: "finance_movement",
    recordId: "entry",
    bookId: "book",
  })
})
for (const invalid of [null, "entry", {}, { entryId: "" }, { entryId: 12 }]) {
  test(`malformed canonical result ${JSON.stringify(invalid)} cannot become a success receipt`, async () => {
    commandResult = invalid
    await expect(
      simpleTransferRecord.execute(context().ctx, payload, "key"),
    ).rejects.toBeDefined()
  })
}
test("a missing Finance Book refuses before looking up accounts", async () => {
  const f = context(false)
  await expect(simpleTransferOptions(f.ctx)).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Set up Finance first.",
  })
  expect(f.observed.accountReads).toBe(0)
})
