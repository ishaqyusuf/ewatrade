import { describe, expect, mock, test } from "bun:test"
import { CatalogError } from "@ewatrade/db/queries"
import {
  OPENING_BALANCE_NEEDS_FINANCE,
  OPENING_BALANCE_PENDING,
  type SetupCommitDeps,
  commitSetupDraft,
} from "./setup-commit"

const scope = { tenantId: "tenant_1", storeId: "store_1", userId: "user_1" }

type Entity = {
  id: string
  key: string
  kind: "PRODUCT" | "SERVICE" | "CUSTOMER"
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
    })) as never,
    ensureCustomerLedgerAccount: mock(async () => ({ id: "acct_1" })) as never,
    recordCustomerLedgerOpening: mock(async () => ({ id: "entry_1" })) as never,
    now: () => 0,
    ...overrides,
  }
  return { deps, outcomes }
}

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
