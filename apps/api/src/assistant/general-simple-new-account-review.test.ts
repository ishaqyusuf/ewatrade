import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  type GeneralReceipt,
  simpleMoneyInAction,
  simpleSaleAction,
} from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import { decideGeneralProposalInTransaction } from "./general-proposals"
import {
  createReviewedNewBook,
  isReviewedNewBookDefault,
} from "./general-reviewed-new-book"
import { simpleMoneyInRecord } from "./general-simple-money-in"
import { simpleSaleRecord } from "./general-simple-sale"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "synthetic-account-review-key-00000000"
})
afterAll(() => {
  if (previousKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})
const account = {
  id: "appeared-account",
  name: "Ishaq PalmPay",
  purpose: "BANK",
  paymentMethods: [],
  paymentsPausedAt: null,
}
const sale = simpleSaleAction.parse({
  action: "sale_record",
  accountName: "ISHAQ palm-pay",
  createAccount: true,
  receivedMinor: 12000,
  customerChoice: "walk_in",
  description: "Two bags of rice",
})
const moneyIn = simpleMoneyInAction.parse({
  action: "money_in_record",
  accountName: "ISHAQ palm-pay",
  createAccount: true,
  amountMinor: 12000,
  effectiveAt: "2026-10-14T12:00:00.000Z",
})
function context(accounts: (locked: boolean) => Array<typeof account>) {
  let locked = false
  let accountReads = 0
  const unexpected: string[] = []
  const db = new Proxy(
    {
      financeBook: {
        findUnique: async () => ({ id: "book", currencyCode: "NGN" }),
        findFirst: async () => ({
          id: "book",
          startsAt: new Date("2026-01-01"),
          closedThrough: null,
          timezone: "Africa/Lagos",
        }),
      },
      financeAccount: {
        findMany: async () => {
          accountReads++
          return accounts(locked)
        },
      },
      $queryRaw: async (query: TemplateStringsArray) => {
        expect(query.join("?")).toContain('"FinanceBook"')
        expect(query.join("?")).toContain("FOR UPDATE")
        locked = true
        return []
      },
    },
    {
      get(target, key, receiver) {
        if (Reflect.has(target, key)) return Reflect.get(target, key, receiver)
        unexpected.push(String(key))
        throw Error(`Unexpected canonical effect: ${String(key)}`)
      },
    },
  )
  const ctx = {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        currencyCode: "NGN",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
        timezone: "Africa/Lagos",
      },
      membership: { id: "membership", role: "OWNER" },
      activeStore: { id: "store", currencyCode: "NGN" },
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: "OWNER",
        assignments: [],
      },
    },
    db,
  } as unknown as GeneralTransactionContext
  return { ctx, unexpected, reads: () => accountReads, locked: () => locked }
}

test("both canonical current reviews refuse a staged account that now exists", async () => {
  for (const kind of ["sale", "money-in"] as const) {
    const fixture = context(() => [account])
    await expect(
      kind === "sale"
        ? simpleSaleRecord.validate(fixture.ctx, sale, true)
        : simpleMoneyInRecord.validate(fixture.ctx, moneyIn, true),
    ).rejects.toThrow("That account now exists. Choose it and review again.")
    expect(fixture.reads()).toBe(1)
    expect(fixture.locked()).toBe(false)
    expect(fixture.unexpected).toEqual([])
  }
})

test("both canonical executions recheck after the Book lock and refuse silent account reuse before effects", async () => {
  for (const kind of ["sale", "money-in"] as const) {
    const fixture = context((locked) => (locked ? [account] : []))
    await expect(
      kind === "sale"
        ? simpleSaleRecord.execute(fixture.ctx, sale, "synthetic-command")
        : simpleMoneyInRecord.execute(
            fixture.ctx,
            moneyIn,
            "synthetic-command",
          ),
    ).rejects.toThrow("That account now exists. Choose it and review again.")
    expect(fixture.reads()).toBe(2)
    expect(fixture.locked()).toBe(true)
    expect(fixture.unexpected).toEqual([])
  }
})

test("pre-review preparation still selects the existing normalized account and validates that explicit choice", async () => {
  for (const kind of ["sale", "money-in"] as const) {
    const fixture = context(() => [account])
    const prepared =
      kind === "sale"
        ? await simpleSaleRecord.prepare(fixture.ctx, sale)
        : await simpleMoneyInRecord.prepare(fixture.ctx, moneyIn)
    expect(prepared).toMatchObject({
      moneyAccountId: account.id,
      accountName: account.name,
      createAccount: false,
    })
    const target =
      prepared.action === "sale_record"
        ? await simpleSaleRecord.validate(fixture.ctx, prepared, true)
        : await simpleMoneyInRecord.validate(fixture.ctx, prepared, true)
    expect(target.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(fixture.unexpected).toEqual([])
  }
})

test("completed canonical proposal receipt replay bypasses changed account validation and execution", async () => {
  for (const payload of [{ ...sale, description: undefined }, moneyIn]) {
    const fixture = context(() => [account])
    const receipt = {
      kind: payload.action === "sale_record" ? "order" : "finance_movement",
      recordId: "original-record",
      bookId: "book",
      title: "Original receipt",
      detail: "Already recorded once.",
    } satisfies GeneralReceipt
    fixture.ctx.db = {
      assistantActionProposal: {
        findFirst: async () => ({
          id: "completed-proposal",
          revision: 1,
          status: "COMPLETED",
          expiresAt: new Date("2026-01-01"),
          payload,
          executedResult: receipt,
        }),
      },
    } as unknown as GeneralTransactionContext["db"]
    const result = await decideGeneralProposalInTransaction(fixture.ctx, {
      proposalId: "completed-proposal",
      revision: 1,
      decision: "confirm",
    })
    expect(result.status).toBe("COMPLETED")
    expect(result.receipt).toEqual(receipt)
    expect(fixture.reads()).toBe(0)
    expect(fixture.unexpected).toEqual([])
  }
})

test("reviewed new Books preserve only exact same-transaction default cash/bank accounts", async () => {
  const fixture = context(() => [])
  const locks: string[] = []
  let created = 0
  const defaults = [
    {
      id: "cash",
      bookId: "created-book",
      code: "1000",
      name: "Shop cash",
      kind: "ASSET",
      purpose: "CASH",
      archivedAt: null,
    },
    {
      id: "bank",
      bookId: "created-book",
      code: "1100",
      name: "Bank account",
      kind: "ASSET",
      purpose: "BANK",
      archivedAt: null,
    },
    {
      id: "clearing",
      bookId: "created-book",
      code: "1150",
      name: "Payments awaiting settlement",
      kind: "ASSET",
      purpose: "CLEARING",
      archivedAt: null,
    },
  ]
  fixture.ctx.db = {
    $queryRaw: async (query: TemplateStringsArray) => {
      locks.push(query.join("?"))
      return []
    },
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      }),
    },
    financeBook: {
      findUnique: async () => null,
      create: async ({
        data,
      }: {
        data: {
          accounts: {
            create: Array<{ code: string; name: string; purpose: string }>
          }
        }
      }) => {
        expect(data.accounts.create).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "1000",
              name: "Shop cash",
              purpose: "CASH",
            }),
            expect.objectContaining({
              code: "1100",
              name: "Bank account",
              purpose: "BANK",
            }),
          ]),
        )
        created++
        return { id: "created-book" }
      },
    },
    financeAccount: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        defaults.find((row) =>
          Object.entries(where).every(
            ([key, value]) => Reflect.get(row, key) === value,
          ),
        ) ?? null,
    },
  } as unknown as GeneralTransactionContext["db"]
  expect(
    await createReviewedNewBook(
      fixture.ctx,
      { tenantId: "tenant", actorUserId: "user" },
      new Date("2026-01-01"),
    ),
  ).toEqual({ id: "created-book" })
  expect(created).toBe(1)
  expect(locks[0]).toContain('"Tenant"')
  for (const [accountId, purpose] of [
    ["cash", "CASH"],
    ["bank", "BANK"],
  ] as const)
    expect(
      await isReviewedNewBookDefault(fixture.ctx, {
        bookId: "created-book",
        accountId,
        purpose,
      }),
    ).toBe(true)
  for (const input of [
    { bookId: "created-book", accountId: "clearing", purpose: "BANK" as const },
    { bookId: "other-book", accountId: "cash", purpose: "CASH" as const },
    { bookId: "created-book", accountId: "bank", purpose: "CASH" as const },
  ])
    expect(await isReviewedNewBookDefault(fixture.ctx, input)).toBe(false)
  const cash = defaults[0]
  if (!cash) throw Error("Expected canonical default cash fixture")
  cash.name = "Renamed cash"
  expect(
    await isReviewedNewBookDefault(fixture.ctx, {
      bookId: "created-book",
      accountId: "cash",
      purpose: "CASH",
    }),
  ).toBe(false)
})

test("a Book that appears before the new-Book lock requires a fresh review", async () => {
  const fixture = context(() => [account])
  fixture.ctx.db.$queryRaw = (async () => []) as never
  await expect(
    createReviewedNewBook(
      fixture.ctx,
      { tenantId: "tenant", actorUserId: "user" },
      new Date("2026-01-01"),
    ),
  ).rejects.toThrow("The Finance Book now exists. Review the account again.")
  expect(fixture.unexpected).toEqual([])
})
