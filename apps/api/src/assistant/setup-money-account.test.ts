import { describe, expect, mock, test } from "bun:test"
import {
  type SetupMoneyAccountPayload,
  setupMoneyAccountPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import { FinanceError } from "@ewatrade/db/queries"
import {
  MONEY_ACCOUNT_NEEDS_FINANCE,
  MONEY_ACCOUNT_SHOP_CASH,
  OPENING_BALANCE_FAILED,
  OPENING_BALANCE_NEEDS_FINANCE,
} from "./setup-commit-codes"
import {
  type SetupMoneyAccountDeps,
  commitSetupMoneyAccount,
  defaultCashEntityId,
  setupMoneyAccountCode,
  setupMoneyAccountName,
} from "./setup-money-account"

const scope = { tenantId: "tenant_1", storeId: "store_1", userId: "user_1" }
const db = {} as never
const startsAt = new Date("2026-10-01T00:00:00.000Z")

const book = {
  id: "book_1",
  currencyCode: "NGN",
  startsAt,
  accounts: [
    { id: "acct_cash", code: "1000", purpose: "CASH", archivedAt: null },
    { id: "acct_bank", code: "1100", purpose: "BANK", archivedAt: null },
  ],
}

function deps(overrides: Partial<SetupMoneyAccountDeps> = {}) {
  return {
    getFinanceBook: mock(async () => book) as never,
    createFinanceMoneyAccount: mock(async () => ({ id: "acct_new" })) as never,
    recordFinanceMoneyMovement: mock(async () => ({
      id: "journal_1",
    })) as never,
    ...overrides,
  } satisfies SetupMoneyAccountDeps
}

const bank: SetupMoneyAccountPayload = {
  kind: "money_account",
  name: "Current account",
  purpose: "BANK",
  bankName: "GTBank",
  openingBalanceMinor: 25_000_000,
}
const cash: SetupMoneyAccountPayload = {
  kind: "money_account",
  name: "Cash at hand",
  purpose: "CASH",
  openingBalanceMinor: 5_000_000,
}
const entity = (id: string, committedRecordId: string | null = null) => ({
  id,
  committedRecordId,
})

describe("setup money accounts", () => {
  test("payload shape is strict and amounts are whole minor units", () => {
    expect(setupMoneyAccountPayloadSchema.safeParse(bank).success).toBe(true)
    expect(
      setupMoneyAccountPayloadSchema.safeParse({ ...bank, purpose: "CLEARING" })
        .success,
    ).toBe(false)
    expect(
      setupMoneyAccountPayloadSchema.safeParse({
        ...bank,
        openingBalanceMinor: 10.5,
      }).success,
    ).toBe(false)
    expect(
      setupMoneyAccountPayloadSchema.safeParse({ ...bank, asOf: "2026-10-01" })
        .success,
    ).toBe(false)
  })

  test("account codes are stable per record and valid Finance codes", () => {
    const code = setupMoneyAccountCode("ent_bank")
    expect(code).toBe(setupMoneyAccountCode("ent_bank"))
    expect(code).not.toBe(setupMoneyAccountCode("ent_other"))
    expect(code).toMatch(/^[A-Z0-9_-]{1,32}$/)
  })

  test("names include the bank once", () => {
    expect(setupMoneyAccountName(bank)).toBe("GTBank Current account")
    expect(setupMoneyAccountName({ ...bank, name: "GTBank savings" })).toBe(
      "GTBank savings",
    )
    expect(setupMoneyAccountName(cash)).toBe("Cash at hand")
  })

  test("only the first cash pocket in the list uses the default cash account", () => {
    expect(
      defaultCashEntityId([
        { id: "ent_product", payload: { kind: "product", name: "Eggs" } },
        { id: "ent_bank", payload: bank },
        { id: "ent_cash", payload: cash },
        { id: "ent_safe", payload: { ...cash, name: "Home safe" } },
      ]),
    ).toBe("ent_cash")
    expect(defaultCashEntityId([{ id: "ent_bank", payload: bank }])).toBe(
      undefined,
    )
  })

  test("a bank account is created and its balance posted at the book start", async () => {
    const d = deps()
    const outcome = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_bank"),
      bank,
      { useDefaultCash: false },
      d,
    )
    expect(outcome).toEqual({
      state: "COMMITTED",
      recordId: "acct_new",
      errorCode: null,
    })
    expect(d.createFinanceMoneyAccount).toHaveBeenCalledWith(db, {
      tenantId: "tenant_1",
      actorUserId: "user_1",
      bookId: "book_1",
      code: setupMoneyAccountCode("ent_bank"),
      name: "GTBank Current account",
      purpose: "BANK",
    })
    expect(d.recordFinanceMoneyMovement).toHaveBeenCalledWith(db, {
      tenantId: "tenant_1",
      actorUserId: "user_1",
      bookId: "book_1",
      kind: "OPENING_BALANCE",
      clientCommandId: "setup-money-opening-ent_bank",
      accountId: "acct_new",
      amountMinor: "25000000",
      description: "Opening balance from business setup",
      effectiveAt: startsAt,
    })
  })

  test("the first cash pocket reuses the book's cash account", async () => {
    const d = deps()
    const outcome = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_cash"),
      cash,
      { useDefaultCash: true },
      d,
    )
    expect(outcome).toEqual({
      state: "COMMITTED",
      recordId: "acct_cash",
      errorCode: MONEY_ACCOUNT_SHOP_CASH,
    })
    expect(d.createFinanceMoneyAccount).not.toHaveBeenCalled()
    expect(d.recordFinanceMoneyMovement).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        accountId: "acct_cash",
        amountMinor: "5000000",
      }),
    )
  })

  test("a retried Shop cash pocket keeps its note; a named cash account has none", async () => {
    const retry = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_cash", "acct_cash"),
      cash,
      { useDefaultCash: true },
      deps(),
    )
    expect(retry).toMatchObject({ errorCode: MONEY_ACCOUNT_SHOP_CASH })
    const second = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_safe"),
      { ...cash, name: "Home safe" },
      { useDefaultCash: false },
      deps(),
    )
    expect(second).toEqual({
      state: "COMMITTED",
      recordId: "acct_new",
      errorCode: null,
    })
  })

  test("no balance creates the account only", async () => {
    const d = deps()
    for (const openingBalanceMinor of [undefined, 0]) {
      const outcome = await commitSetupMoneyAccount(
        db,
        scope,
        entity("ent_bank"),
        { ...bank, openingBalanceMinor },
        { useDefaultCash: false },
        d,
      )
      expect(outcome).toEqual({
        state: "COMMITTED",
        recordId: "acct_new",
        errorCode: null,
      })
    }
    expect(d.recordFinanceMoneyMovement).not.toHaveBeenCalled()
  })

  test("without a Finance book nothing is created and the record waits", async () => {
    const d = deps({ getFinanceBook: mock(async () => null) as never })
    const outcome = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_bank"),
      bank,
      { useDefaultCash: false },
      d,
    )
    expect(outcome).toMatchObject({
      state: "FAILED",
      errorCode: MONEY_ACCOUNT_NEEDS_FINANCE,
    })
    expect(d.createFinanceMoneyAccount).not.toHaveBeenCalled()
    const committed = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_bank", "acct_new"),
      bank,
      { useDefaultCash: false },
      d,
    )
    expect(committed).toMatchObject({
      state: "COMMITTED",
      recordId: "acct_new",
      errorCode: OPENING_BALANCE_NEEDS_FINANCE,
    })
  })

  test("a refused balance keeps the account and stays pending; retry reuses it", async () => {
    const d = deps({
      recordFinanceMoneyMovement: mock(async () => {
        throw new FinanceError("CLOSED_PERIOD", "The period is closed.")
      }) as never,
    })
    const outcome = await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_bank"),
      bank,
      { useDefaultCash: false },
      d,
    )
    expect(outcome).toMatchObject({
      state: "COMMITTED",
      recordId: "acct_new",
      errorCode: OPENING_BALANCE_FAILED,
    })
    const retry = deps()
    await commitSetupMoneyAccount(
      db,
      scope,
      entity("ent_bank", "acct_new"),
      bank,
      { useDefaultCash: false },
      retry,
    )
    expect(retry.createFinanceMoneyAccount).not.toHaveBeenCalled()
    expect(retry.recordFinanceMoneyMovement).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        accountId: "acct_new",
        clientCommandId: "setup-money-opening-ent_bank",
      }),
    )
  })

  test("refusals while creating the account and unexpected errors propagate", async () => {
    const conflict = deps({
      createFinanceMoneyAccount: mock(async () => {
        throw new FinanceError(
          "CONFLICT",
          "That account code is already in use.",
        )
      }) as never,
    })
    await expect(
      commitSetupMoneyAccount(
        db,
        scope,
        entity("ent_bank"),
        bank,
        { useDefaultCash: false },
        conflict,
      ),
    ).rejects.toBeInstanceOf(FinanceError)
    const broken = deps({
      recordFinanceMoneyMovement: mock(async () => {
        throw new Error("Connection terminated unexpectedly")
      }) as never,
    })
    await expect(
      commitSetupMoneyAccount(
        db,
        scope,
        entity("ent_bank"),
        bank,
        { useDefaultCash: false },
        broken,
      ),
    ).rejects.toThrow("Connection terminated")
  })
})
