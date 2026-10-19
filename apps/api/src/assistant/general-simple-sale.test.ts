import { afterAll, beforeAll, expect, test } from "bun:test"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction } from "./general-context"
import { generalProposalForApp } from "./general-proposals"
import { simpleSaleRecord } from "./general-simple-sale"
import { handleSimpleSaleChat } from "./general-simple-sale-chat"
const old = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "s".repeat(32)
})
afterAll(() => {
  if (old === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = old
})
function context(role = "OWNER", cashName = "Cash") {
  return {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "QA",
        currencyCode: "NGN",
        retailOpsPlanId: "pro",
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
        findFirst: async ({
          where,
        }: { where: { id: string; tenantId: string } }) =>
          where.id === "book" && where.tenantId === "tenant"
            ? { timezone: "Africa/Lagos" }
            : null,
      },
      financeAccount: {
        findMany: async () => [
          {
            id: "cash",
            name: cashName,
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
          {
            id: "paused",
            name: "Paused bank",
            purpose: "BANK",
            paymentMethods: [],
            paymentsPausedAt: new Date(),
          },
        ],
      },
      customer: {
        findMany: async () => [{ id: "salman", name: "Salman" }],
        findFirst: async ({
          where,
        }: { where: { id: string; tenantId: string } }) =>
          where.id === "salman" && where.tenantId === "tenant"
            ? { id: "salman", name: "Salman" }
            : null,
      },
      assistantAttachment: { findMany: async () => [] },
    },
  } as unknown as GeneralTransactionContext
}
test("existing account names normalize without creating another account", async () => {
  expect(
    await simpleSaleRecord.prepare(
      context(),
      simpleSaleAction.parse({
        action: "sale_record",
        accountName: "ishaq PALM PAY",
      }),
    ),
  ).toMatchObject({ moneyAccountId: "bank", createAccount: false })
})
test("missing typed account stages creation; close matches require a choice", async () => {
  expect(
    await simpleSaleRecord.prepare(
      context(),
      simpleSaleAction.parse({
        action: "sale_record",
        accountName: "New bank",
      }),
    ),
  ).toMatchObject({ createAccount: true })
  expect(
    await simpleSaleRecord.prepare(
      context(),
      simpleSaleAction.parse({
        action: "sale_record",
        accountName: "Ishaq Palmpa",
      }),
    ),
  ).toMatchObject({ createAccount: false })
})
test("draft review offers eligible account pills and pending amounts", async () => {
  const result = await simpleSaleRecord.review(
    context(),
    simpleSaleAction.parse({ action: "sale_record", receivedMinor: 2000000 }),
  )
  expect(result.question).toBe("Where do you want to record this?")
  expect(result.choices?.map((choice) => choice.label)).toEqual([
    "Cash",
    "Ishaq PalmPay",
  ])
  expect(result.lines).toContain("Received: ₦20,000.00")
  await expect(
    simpleSaleRecord.validate(
      context(),
      simpleSaleAction.parse({ action: "sale_record" }),
      true,
    ),
  ).rejects.toThrow("Finish")
})
test("customer suggestions include explicit new and walk-in", async () => {
  const result = await simpleSaleRecord.review(
    context(),
    simpleSaleAction.parse({
      action: "sale_record",
      moneyAccountId: "bank",
      customerName: "Salmam",
      receivedMinor: 2000000,
    }),
  )
  expect(result.choices?.map((choice) => choice.label)).toEqual([
    "Salman",
    "New customer: Salmam",
    "Walk-in",
  ])
})
test("partial debt is accurate; invalid accounts, customers and overpayments are refused", async () => {
  const payload = simpleSaleAction.parse({
    action: "sale_record",
    moneyAccountId: "bank",
    customerId: "salman",
    partial: true,
    receivedMinor: 3500000,
    totalMinor: 10500000,
  })
  const review = await simpleSaleRecord.review(context(), payload)
  expect(
    review.lines.some(
      (line) => line.startsWith("Remaining:") && line.includes("70,000"),
    ),
  ).toBe(true)
  await expect(
    simpleSaleRecord.validate(
      context(),
      { ...payload, moneyAccountId: "paused" },
      false,
    ),
  ).rejects.toThrow("available account")
  await expect(
    simpleSaleRecord.validate(
      context(),
      { ...payload, customerId: "other-tenant" },
      false,
    ),
  ).rejects.toThrow("customer from this business")
  await expect(
    simpleSaleRecord.validate(
      context(),
      { ...payload, receivedMinor: 20000000 },
      false,
    ),
  ).rejects.toThrow("exceed")
})
test("new account needs Finance authority and cashier cannot use composite write", async () => {
  await expect(
    simpleSaleRecord.validate(
      context("MANAGER"),
      simpleSaleAction.parse({
        action: "sale_record",
        createAccount: true,
        accountName: "New bank",
      }),
      false,
    ),
  ).rejects.toThrow()
  expect(() => assertGeneralAction(context("CASHIER"), "sale_record")).toThrow()
})
test("incomplete draft gets no approval token", () => {
  const row = {
    id: "proposal",
    revision: 1,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60000),
    createdAt: new Date(),
    payload: simpleSaleAction.parse({ action: "sale_record" }),
    executedResult: null,
  } as unknown as Parameters<typeof generalProposalForApp>[0]
  expect(generalProposalForApp(row).approvalToken).toBeUndefined()
})

test("image-only message asks purpose without any image or provider read", async () => {
  const result = await handleSimpleSaleChat(
    context() as unknown as GeneralContext,
    {
      conversationId: "chat",
      messageId: "message",
      text: "",
      imageIds: ["image"],
      history: [],
    },
  )
  expect(result).toEqual({ text: "What is this for?", proposalId: null })
})
test("stale pill metadata cannot mutate a newer draft", async () => {
  const ctx = context()
  const safe = {
    ...ctx,
    db: { ...ctx.db, assistantActionProposal: { findFirst: async () => null } },
  } as unknown as GeneralContext
  expect(
    await handleSimpleSaleChat(safe, {
      conversationId: "chat",
      messageId: "message",
      text: "Cash",
      imageIds: [],
      history: [],
      choice: { proposalId: "old", revision: 1, text: "Use account: cash" },
    }),
  ).toEqual({
    text: "That order card changed. Use its latest choices or open the form.",
    proposalId: null,
  })
})
test("selected ids receive canonical names for the review form", async () => {
  expect(
    await simpleSaleRecord.prepare(
      context(),
      simpleSaleAction.parse({
        action: "sale_record",
        moneyAccountId: "bank",
        customerId: "salman",
        receivedMinor: 5000000,
      }),
    ),
  ).toMatchObject({ accountName: "Ishaq PalmPay", customerName: "Salman" })
})

test("generic cash uses the single eligible cash drawer", async () => {
  const ctx = context("OWNER", "Shop cash")
  expect(
    await simpleSaleRecord.prepare(
      ctx,
      simpleSaleAction.parse({
        action: "sale_record",
        accountName: "cash",
        receivedMinor: 2000000,
      }),
    ),
  ).toMatchObject({
    moneyAccountId: "cash",
    accountName: "Shop cash",
    method: "cash",
    createAccount: false,
  })
})

test("non-sale funding bypasses an existing sale draft without reading or changing it", async () => {
  const ctx = context() as unknown as GeneralContext
  // No proposal DB implementation: reaching a pending-sale read would fail this test.
  expect(
    await handleSimpleSaleChat(ctx, {
      conversationId: "chat",
      messageId: "money",
      imageIds: ["receipt"],
      history: [],
      text: "Owner contribution 20k into Cash. No sale.",
    }),
  ).toBeNull()
})
