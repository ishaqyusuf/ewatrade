import { expect, mock, test } from "bun:test"
import { simpleTransferAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
let result: unknown = { entryId: "entry-1" }
mock.module("@ewatrade/db/queries", () => ({
  assertFinancePostingDate: () => {},
  createFinanceMoneyAccountInTransaction: async () => {
    throw Error("Existing destination expected")
  },
  getFinanceMoneyMovementReview: async () => ({}),
  recordFinanceMoneyMovementInTransaction: async () => result,
}))
mock.module("@ewatrade/db/assistant-attachments", () => ({
  listAssistantAttachments: async () => [],
}))
mock.module("../trpc/finance-procedure", () => ({
  assertFinanceAccess: () => {},
}))
mock.module("./general-context", () => ({
  requireGeneralScope: () => ({
    tenantId: "tenant",
    storeId: "store",
    userId: "user",
  }),
}))
mock.module("./proposal-security", () => ({ proposalDigest: () => "digest" }))
const { simpleTransferRecord } = await import("./general-simple-transfer")
const ctx = {
  tenantContext: { tenant: { currencyCode: "NGN" } },
  db: {
    financeBook: {
      findUnique: async () => ({
        id: "book",
        currencyCode: "NGN",
        startsAt: new Date(0),
        closedThrough: null,
      }),
    },
    financeAccount: {
      findMany: async () => [
        { id: "from", name: "Cash", purpose: "CASH" },
        { id: "to", name: "Bank", purpose: "BANK" },
      ],
    },
  },
} as unknown as GeneralTransactionContext
const input = simpleTransferAction.parse({
  action: "money_transfer_simple",
  bookId: "book",
  amountMinor: 100,
  fromMoneyAccountId: "from",
  fromAccountName: "Cash",
  toMoneyAccountId: "to",
  toAccountName: "Bank",
  effectiveAt: new Date().toISOString(),
  attachmentIds: [],
})
test("valid canonical transfer receipt keeps its entry identity", async () => {
  result = { entryId: "entry-1" }
  expect(
    await simpleTransferRecord.execute(ctx, input, "operation"),
  ).toMatchObject({ recordId: "entry-1" })
})
test("malformed canonical transfer result cannot produce a success receipt", async () => {
  for (const invalid of [{}, { entryId: "" }, { entryId: 1 }, null]) {
    result = invalid
    await expect(
      simpleTransferRecord.execute(ctx, input, "operation"),
    ).rejects.toBeDefined()
  }
})
