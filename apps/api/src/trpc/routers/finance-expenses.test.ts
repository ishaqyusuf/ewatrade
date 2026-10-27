import { expect, test } from "bun:test"
import { FinanceError } from "@ewatrade/db/queries"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const createCaller = createCallerFactory(financeRouter)
const sentinel = "Expense database reached"

/** Every property and call on the fake database counts as database access. */
function guardedCaller(role: string) {
  let effects = 0
  const reach = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) => (key === "then" ? undefined : reach()),
      apply: () => {
        effects += 1
        throw new FinanceError("CONFLICT", sentinel)
      },
    })
  const caller = createCaller({
    db: reach(),
    requestHeaders: new Headers(),
    requestId: "finance-expenses-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "session-actor" },
    },
    tenantContext: {
      tenant: { id: "session-tenant", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  } as never)
  return { caller, effects: () => effects }
}

type Caller = ReturnType<typeof guardedCaller>["caller"]
const effectiveAt = "2026-10-01T10:00:00.000Z"
const procedures: Array<[string, (caller: Caller) => Promise<unknown>]> = [
  [
    "createExpenseCategory",
    (caller) =>
      caller.createExpenseCategory({
        bookId: "book-1",
        code: "6100",
        name: "Rent",
      }),
  ],
  [
    "recordExpense",
    (caller) =>
      caller.recordExpense({
        bookId: "book-1",
        clientCommandId: "expense-1",
        payeeName: "Landlord",
        description: "October rent",
        incurredAt: effectiveAt,
        lines: [
          { accountId: "expense-1", description: "Rent", amountMinor: "5000" },
        ],
        payment: { accountId: "cash-1", amountMinor: "5000", effectiveAt },
      }),
  ],
  [
    "payBill",
    (caller) =>
      caller.payBill({
        bookId: "book-1",
        clientCommandId: "pay-1",
        billId: "bill-1",
        accountId: "cash-1",
        amountMinor: "1000",
        effectiveAt,
      }),
  ],
  [
    "payBill (owner capital)",
    (caller) =>
      caller.payBill({
        bookId: "book-1",
        clientCommandId: "pay-owner-1",
        billId: "bill-1",
        funding: "OWNER_CAPITAL",
        amountMinor: "1000",
        effectiveAt,
      }),
  ],
  [
    "voidExpense",
    (caller) =>
      caller.voidExpense({
        bookId: "book-1",
        clientCommandId: "void-1",
        billId: "bill-1",
        reason: "Entered twice",
        effectiveAt,
      }),
  ],
  [
    "reverseBillPayment",
    (caller) =>
      caller.reverseBillPayment({
        bookId: "book-1",
        clientCommandId: "reverse-1",
        paymentId: "payment-1",
        reason: "Wrong account",
        effectiveAt,
      }),
  ],
  ["bill", (caller) => caller.bill({ bookId: "book-1", billId: "bill-1" })],
  ["bills", (caller) => caller.bills({ bookId: "book-1" })],
  [
    "expenseCategories",
    (caller) => caller.expenseCategories({ bookId: "book-1" }),
  ],
]

test("expense procedures deny Manager, Cashier and Operator before database access", async () => {
  for (const role of ["MANAGER", "CASHIER", "OPERATOR"]) {
    const { caller, effects } = guardedCaller(role)
    for (const [name, call] of procedures) {
      await expect(call(caller), `${role} ${name}`).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
    }
    expect(effects()).toBe(0)
  }
})

test("expense procedures let Owner and Admin through to the finance repository", async () => {
  for (const role of ["OWNER", "ADMIN", "admin"]) {
    for (const [name, call] of procedures) {
      const { caller, effects } = guardedCaller(role)
      await expect(call(caller), `${role} ${name}`).rejects.toMatchObject({
        code: "CONFLICT",
        message: sentinel,
      })
      expect(effects()).toBeGreaterThan(0)
    }
  }
})

test("expense commands reject a supplied tenant or actor before database access", async () => {
  const { caller, effects } = guardedCaller("OWNER")
  await expect(
    caller.voidExpense({
      bookId: "book-1",
      clientCommandId: "void-1",
      billId: "bill-1",
      reason: "Entered twice",
      effectiveAt,
      tenantId: "foreign-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.payBill({
      bookId: "book-1",
      clientCommandId: "pay-1",
      billId: "bill-1",
      accountId: "cash-1",
      amountMinor: "1000",
      effectiveAt,
      actorUserId: "foreign-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(effects()).toBe(0)
})
