import { describe, expect, mock, test } from "bun:test"
import { CatalogError } from "@ewatrade/db/queries"
import {
  MONEY_ACCOUNT_NEEDS_FINANCE,
  OPENING_BALANCE_NEEDS_FINANCE,
  OPENING_BALANCE_PENDING,
  type SetupCommitDeps,
  commitSetupDraft,
} from "./setup-commit"
import { setupMoneyAccountCode } from "./setup-money-account"

const scope = { tenantId: "tenant_1", storeId: "store_1", userId: "user_1" }

type Entity = {
  id: string
  key: string
  kind: "PRODUCT" | "SERVICE" | "CUSTOMER" | "MONEY_ACCOUNT"
  state: string
  payload: unknown
  errorCode: string | null
  committedRecordId: string | null
}

const product = (key: string): Entity => ({
  id: `ent_${key}`,
  key,
  kind: "PRODUCT",
  state: "CONFIRMED",
  payload: {
    kind: "product",
    name: key,
    unitName: "Crate",
    priceMinor: 450_000,
  },
  errorCode: null,
  committedRecordId: null,
})

const customer: Entity = {
  id: "ent_mama",
  key: "customer:mama-ade",
  kind: "CUSTOMER",
  state: "CONFIRMED",
  payload: {
    kind: "customer",
    name: "Mama Ade",
    opening: { direction: "owes_business", amountMinor: 1_500_000 },
  },
  errorCode: null,
  committedRecordId: null,
}

const money = (
  key: string,
  purpose: "CASH" | "BANK",
  openingBalanceMinor?: number,
): Entity => ({
  id: `ent_${key}`,
  key: `money:${key}`,
  kind: "MONEY_ACCOUNT",
  state: "CONFIRMED",
  payload: { kind: "money_account", name: key, purpose, openingBalanceMinor },
  errorCode: null,
  committedRecordId: null,
})

const db = {
  $transaction: (fn: (tx: unknown) => unknown) => fn({ tx: true }),
} as never

function harness(entities: Entity[], overrides: Partial<SetupCommitDeps> = {}) {
  const outcomes: Array<{ key: string; outcome: unknown; inTx: boolean }> = []
  const deps: SetupCommitDeps = {
    readSetupDraft: mock(async () => ({
      id: "draft",
      revision: 1,
      entities,
    })) as never,
    recordOutcome: mock(
      async (client: unknown, input: { key: string; outcome: unknown }) => {
        outcomes.push({
          key: input.key,
          outcome: input.outcome,
          inTx: (client as { tx?: boolean }).tx === true,
        })
        return 1
      },
    ) as never,
    createCatalogItem: mock(async (_db: unknown, input: { name: string }) => ({
      id: `item_${input.name}`,
    })) as never,
    createCustomer: mock(async () => ({ id: "cust_1" })) as never,
    getFinanceBook: mock(async () => ({
      id: "book_1",
      currencyCode: "NGN",
      startsAt: new Date("2026-10-01T00:00:00.000Z"),
      accounts: [
        { id: "acct_cash", code: "1000", purpose: "CASH", archivedAt: null },
      ],
    })) as never,
    ensureCustomerLedgerAccount: mock(async () => ({ id: "acct_1" })) as never,
    recordCustomerLedgerOpening: mock(async () => ({ id: "entry_1" })) as never,
    createFinanceMoneyAccount: mock(
      async (_db: unknown, input: { code: string }) => ({
        id: `acct_${input.code}`,
      }),
    ) as never,
    recordFinanceMoneyMovement: mock(async () => ({
      id: "journal_1",
    })) as never,
    prepareProductPhoto: mock(async () => ({ assetId: "asset_1" })) as never,
    enqueuePhotoReview: mock(async () => undefined),
    now: () => 0,
    ...overrides,
  }
  return { deps, outcomes }
}

const withPhoto = (key: string): Entity => ({
  ...product(key),
  payload: {
    kind: "product",
    name: key,
    unitName: "Crate",
    priceMinor: 450_000,
    photoAttachmentId: "att_photo",
  },
})

describe("product photos sent in the setup chat", () => {
  test("are attached inside item creation and queued for review", async () => {
    const { deps } = harness([withPhoto("eggs")])
    const result = await commitSetupDraft(
      db,
      { ...scope, conversationId: "conv_1", dataClassification: "LIVE" },
      "draft",
      deps,
    )
    expect(result.results[0]).toMatchObject({ state: "COMMITTED" })
    expect(deps.prepareProductPhoto).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ dataClassification: "LIVE" }),
      {
        entityId: "ent_eggs",
        conversationId: "conv_1",
        attachmentId: "att_photo",
      },
    )
    expect(deps.createCatalogItem).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ photoAssetIds: ["asset_1"] }),
    )
    expect(deps.enqueuePhotoReview).toHaveBeenCalledWith("asset_1")
  })

  test("a photo that cannot be added never blocks the product", async () => {
    const { deps, outcomes } = harness([withPhoto("eggs")], {
      prepareProductPhoto: mock(async () => ({
        skipped: "PHOTO_NOT_ADDED" as const,
      })) as never,
    })
    const result = await commitSetupDraft(
      db,
      { ...scope, conversationId: "conv_1", dataClassification: "QA" },
      "draft",
      deps,
    )
    expect(result.results[0]).toMatchObject({ state: "COMMITTED" })
    expect(deps.createCatalogItem).toHaveBeenCalledWith(
      db,
      expect.not.objectContaining({ photoAssetIds: expect.anything() }),
    )
    expect(deps.enqueuePhotoReview).not.toHaveBeenCalled()
    expect(outcomes.at(-1)).toMatchObject({
      outcome: { state: "COMMITTED", errorCode: "PHOTO_NOT_ADDED" },
    })
  })
})

describe("setup commit flow", () => {
  test("commits products and a customer with a stable ledger command", async () => {
    const { deps, outcomes } = harness([product("eggs"), customer])
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result).toMatchObject({ remaining: 0, interrupted: false })
    expect(result.results.map((r) => r.state)).toEqual([
      "COMMITTED",
      "COMMITTED",
    ])
    expect(deps.recordCustomerLedgerOpening).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        clientCommandId: "setup-opening-ent_mama",
        direction: "DEBT",
        amountMinor: "1500000",
      }),
    )
    // Customer creation and its pending marker share the creation transaction.
    expect(outcomes[1]).toMatchObject({
      key: "customer:mama-ade",
      inTx: true,
      outcome: { errorCode: OPENING_BALANCE_PENDING },
    })
    expect(outcomes.at(-1)).toMatchObject({
      key: "customer:mama-ade",
      outcome: { state: "COMMITTED", errorCode: null },
    })
  })

  test("a failed bookkeeping write pauses the batch instead of throwing; retry replays safely", async () => {
    let fail = true
    const { deps } = harness([product("eggs"), product("broiler")], {
      recordOutcome: mock(async () => {
        if (fail)
          throw new Error(
            "Transaction API error: Unable to start a transaction",
          )
        return 1
      }) as never,
    })
    const first = await commitSetupDraft(db, scope, "draft", deps)
    expect(first).toMatchObject({
      interrupted: true,
      remaining: 2,
      results: [],
    })
    expect(deps.createCatalogItem).toHaveBeenCalledTimes(1)
    const firstOperation = (deps.createCatalogItem as ReturnType<typeof mock>)
      .mock.calls[0]?.[1] as { clientOperationId: string }

    fail = false
    const retry = await commitSetupDraft(db, scope, "draft", deps)
    expect(retry).toMatchObject({ interrupted: false, remaining: 0 })
    const retryOperation = (deps.createCatalogItem as ReturnType<typeof mock>)
      .mock.calls[1]?.[1] as { clientOperationId: string }
    expect(retryOperation.clientOperationId).toBe(
      firstOperation.clientOperationId,
    )
  })

  test("unexpected errors leave the record queued, not failed", async () => {
    const { deps, outcomes } = harness([product("eggs"), product("broiler")], {
      createCatalogItem: mock(async () => {
        throw new Error("Connection terminated unexpectedly")
      }) as never,
    })
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result).toMatchObject({ interrupted: true, remaining: 2 })
    expect(outcomes).toEqual([])
  })

  test("domain refusals mark only that record failed and the batch continues", async () => {
    const { deps, outcomes } = harness([product("eggs"), product("broiler")], {
      createCatalogItem: mock(async (_db: unknown, input: { name: string }) => {
        if (input.name === "eggs")
          throw new CatalogError(
            "DUPLICATE_CATALOG_KEY",
            "Already in the catalog.",
          )
        return { id: "item_broiler" }
      }) as never,
    })
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result.interrupted).toBe(false)
    expect(result.results.map((r) => [r.key, r.state, r.errorCode])).toEqual([
      ["eggs", "FAILED", "DUPLICATE_CATALOG_KEY"],
      ["broiler", "COMMITTED", undefined],
    ])
    expect(outcomes[0]).toMatchObject({
      outcome: { state: "FAILED", errorCode: "DUPLICATE_CATALOG_KEY" },
    })
  })

  test("without a Finance book the customer is added and the balance waits", async () => {
    const { deps } = harness([customer], {
      getFinanceBook: mock(async () => null) as never,
    })
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result.results[0]).toMatchObject({
      state: "COMMITTED",
      errorCode: OPENING_BALANCE_NEEDS_FINANCE,
    })
    expect(deps.recordCustomerLedgerOpening).not.toHaveBeenCalled()
  })

  test("cash and bank accounts are added with balances; the first cash pocket reuses Shop cash", async () => {
    const { deps, outcomes } = harness([
      product("eggs"),
      money("Cash at hand", "CASH", 5_000_000),
      money("GTBank", "BANK", 25_000_000),
      money("Home safe", "CASH"),
    ])
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result).toMatchObject({ remaining: 0, interrupted: false })
    expect(result.results.map((r) => [r.name, r.state, r.recordId])).toEqual([
      ["eggs", "COMMITTED", "item_eggs"],
      ["Cash at hand", "COMMITTED", "acct_cash"],
      ["GTBank", "COMMITTED", `acct_${setupMoneyAccountCode("ent_GTBank")}`],
      [
        "Home safe",
        "COMMITTED",
        `acct_${setupMoneyAccountCode("ent_Home safe")}`,
      ],
    ])
    expect(deps.createFinanceMoneyAccount).toHaveBeenCalledTimes(2)
    // Only the two pockets with a balance post an opening entry.
    expect(deps.recordFinanceMoneyMovement).toHaveBeenCalledTimes(2)
    expect(outcomes.at(-1)).toMatchObject({
      key: "money:Home safe",
      outcome: { state: "COMMITTED", errorCode: null },
    })
  })

  test("without a Finance book cash and bank accounts fail with a Finance prompt", async () => {
    const { deps } = harness([money("GTBank", "BANK", 25_000_000)], {
      getFinanceBook: mock(async () => null) as never,
    })
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result.results[0]).toMatchObject({
      state: "FAILED",
      errorCode: MONEY_ACCOUNT_NEEDS_FINANCE,
    })
    expect(deps.createFinanceMoneyAccount).not.toHaveBeenCalled()
  })

  test("the time budget stops starting new records", async () => {
    let clock = 0
    const { deps } = harness([product("a"), product("b"), product("c")], {
      now: () => clock,
      createCatalogItem: mock(async (_db: unknown, input: { name: string }) => {
        clock += 6_000
        return { id: `item_${input.name}` }
      }) as never,
    })
    const result = await commitSetupDraft(db, scope, "draft", deps)
    expect(result).toMatchObject({ remaining: 2, interrupted: false })
    expect(result.results).toHaveLength(1)
  })
})
