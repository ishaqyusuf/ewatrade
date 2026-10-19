import { describe, expect, mock, test } from "bun:test"
import { deriveSetupEntityState } from "@ewatrade/assistant/setup/contracts"
import {
  readSetupDraft,
  recordSetupDraftCommitOutcomeInTransaction,
  setSetupDraftEntityStatesInTransaction,
  upsertSetupDraftEntitiesInTransaction,
} from "@ewatrade/db/assistant"
import { CatalogError } from "@ewatrade/db/queries"
import {
  MONEY_ACCOUNT_NEEDS_FINANCE,
  OPENING_BALANCE_NEEDS_FINANCE,
  OPENING_BALANCE_PENDING,
  type SetupCommitDeps,
  commitSetupDraft,
  defaultSetupCommitDependencies,
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
  const record = mock(
    async (client: unknown, input: { key: string; outcome: unknown }) => {
      outcomes.push({
        key: input.key,
        outcome: input.outcome,
        inTx: (client as { tx?: boolean }).tx === true,
      })
      return 1
    },
  )
  const deps: SetupCommitDeps = {
    lockCustomerForCommit: mock(
      async (_tx, _scope, input) =>
        entities.find(
          (entity) => entity.id === input.entityId && entity.key === input.key,
        ) ?? null,
    ) as never,
    readSetupDraft: mock(async () => ({
      id: "draft",
      revision: 1,
      entities,
    })) as never,
    recordOutcome: record as never,
    recordOutcomeInTransaction: record as never,
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

const illustrated = (key: string, photo?: string): Entity => ({
  ...product(key),
  payload: {
    kind: "product",
    name: key,
    unitName: "Crate",
    priceMinor: 450_000,
    illustrationId: "ill-egg",
    ...(photo ? { photoAttachmentId: photo } : {}),
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

describe("recommended illustrations", () => {
  test("are attached when the owner sent no photo", async () => {
    const { deps } = harness([illustrated("eggs")])
    await commitSetupDraft(db, scope, "draft", deps)
    expect(deps.createCatalogItem).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ illustrationId: "ill-egg" }),
    )
  })

  test("give way to a photo the owner sent", async () => {
    const { deps } = harness([illustrated("eggs", "att_photo")])
    await commitSetupDraft(
      db,
      { ...scope, conversationId: "conv_1", dataClassification: "LIVE" },
      "draft",
      deps,
    )
    expect(deps.createCatalogItem).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ photoAssetIds: ["asset_1"] }),
    )
    expect(deps.createCatalogItem).toHaveBeenCalledWith(
      db,
      expect.not.objectContaining({ illustrationId: expect.anything() }),
    )
  })

  test("stay when the photo could not be added", async () => {
    const { deps } = harness([illustrated("eggs", "att_photo")], {
      prepareProductPhoto: mock(async () => ({
        skipped: "PHOTO_NOT_ADDED" as const,
      })) as never,
    })
    await commitSetupDraft(
      db,
      { ...scope, conversationId: "conv_1", dataClassification: "QA" },
      "draft",
      deps,
    )
    expect(deps.createCatalogItem).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ illustrationId: "ill-egg" }),
    )
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
    expect(
      outcomes.find((entry) => entry.key === "money:Cash at hand"),
    ).toMatchObject({
      outcome: { state: "COMMITTED", errorCode: "MONEY_ACCOUNT_SHOP_CASH" },
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

  test("an add from the chat commits only the named records", async () => {
    const { deps } = harness([product("eggs"), product("broiler"), customer])
    const result = await commitSetupDraft(db, scope, "draft", deps, {
      keys: ["broiler"],
    })
    expect(result).toMatchObject({ remaining: 0, interrupted: false })
    expect(result.results.map((r) => r.key)).toEqual(["broiler"])
    expect(deps.createCatalogItem).toHaveBeenCalledTimes(1)
    expect(deps.createCustomer).not.toHaveBeenCalled()
  })

  test("a new customer's outcome is written in its transaction without nesting another (P2028)", async () => {
    const nested = mock(() => {
      throw new Error("A nested $transaction must never start here.")
    })
    const tx = {
      $transaction: nested,
      setupDraftEntity: { updateMany: mock(async () => ({ count: 1 })) },
      setupDraft: { update: mock(async () => ({ revision: 2 })) },
    }
    const txDb = {
      $transaction: (fn: (client: unknown) => unknown) => fn(tx),
    } as never
    const { deps } = harness([customer], {
      recordOutcomeInTransaction: recordSetupDraftCommitOutcomeInTransaction,
    })
    const result = await commitSetupDraft(txDb, scope, "draft", deps)
    expect(result.interrupted).toBe(false)
    expect(result.results[0]).toMatchObject({ state: "COMMITTED" })
    expect(nested).not.toHaveBeenCalled()
    expect(tx.setupDraftEntity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "COMMITTED",
          errorCode: OPENING_BALANCE_PENDING,
        }),
      }),
    )
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

test("adding selected setup keys leaves other confirmed records untouched", async () => {
  const { deps, outcomes } = harness([product("first"), product("second")])
  const result = await commitSetupDraft(db, scope, "draft", deps, {
    keys: ["second"],
  })
  expect(result.results.map((item) => item.key)).toEqual(["second"])
  expect(outcomes.map((item) => item.key)).toEqual(["second"])
  expect(result.remaining).toBe(0)
})

test("a stale browser customer snapshot reuses the record committed by another channel", async () => {
  const namedCustomer: Entity = {
    ...customer,
    payload: { kind: "customer", name: "Mama Ade" },
  }
  const { deps, outcomes } = harness([namedCustomer], {
    lockCustomerForCommit: mock(async () => ({
      ...namedCustomer,
      state: "COMMITTED",
      committedRecordId: "customer_saved_by_whatsapp",
    })) as never,
  })
  const result = await commitSetupDraft(db, scope, "draft", deps)
  expect(deps.lockCustomerForCommit).toHaveBeenCalledTimes(1)
  expect(deps.createCustomer).not.toHaveBeenCalled()
  expect(result.results[0]).toMatchObject({
    state: "COMMITTED",
    recordId: "customer_saved_by_whatsapp",
  })
  expect(outcomes).toEqual([
    {
      key: namedCustomer.key,
      outcome: {
        state: "COMMITTED",
        recordId: "customer_saved_by_whatsapp",
        errorCode: null,
      },
      inTx: false,
    },
  ])
})

test("a customer edited after the batch read cannot create or overwrite its fresh draft outcome", async () => {
  const { deps, outcomes } = harness([customer], {
    lockCustomerForCommit: mock(async () => ({
      ...customer,
      payload: { kind: "customer", name: "Updated name" },
    })) as never,
  })
  const result = await commitSetupDraft(db, scope, "draft", deps)
  expect(result.interrupted).toBe(true)
  expect(result.results).toEqual([])
  expect(deps.createCustomer).not.toHaveBeenCalled()
  expect(outcomes).toEqual([])
})

test("canonical customer locks precede the fresh draft read and preserve shared Store owner/admin access", async () => {
  const order: string[] = []
  const saved = {
    ...customer,
    state: "COMMITTED" as const,
    committedRecordId: "existing_customer",
  }
  const tx = {
    $queryRaw: mock(async (query: TemplateStringsArray) => {
      order.push(
        query.join("").includes("AssistantConversation")
          ? "conversation"
          : "draft",
      )
      return [{ id: "setup_of_another_owner" }]
    }),
    membership: {
      findFirst: mock(async () => {
        order.push("membership")
        return { id: "active_admin" }
      }),
    },
    setupDraftEntity: {
      findFirst: mock(async () => {
        order.push("entity")
        return saved
      }),
    },
  }
  const lock = defaultSetupCommitDependencies().lockCustomerForCommit
  if (!lock) throw Error("Canonical customer locking is required")
  expect(
    await lock(tx as never, scope, {
      draftId: "draft",
      entityId: customer.id,
      key: customer.key,
    }),
  ).toBe(saved)
  expect(order).toEqual(["conversation", "draft", "membership", "entity"])
  expect(tx.membership.findFirst).toHaveBeenCalledWith({
    where: {
      tenantId: scope.tenantId,
      userId: scope.userId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      tenant: { isActive: true },
    },
    select: { id: true },
  })
  expect(tx.setupDraftEntity.findFirst).toHaveBeenCalledWith({
    where: { id: customer.id, draftId: "draft", key: customer.key },
    select: {
      id: true,
      key: true,
      kind: true,
      state: true,
      payload: true,
      committedRecordId: true,
    },
  })
})
test("a missing selected key does not add a different confirmed record", async () => {
  const { deps, outcomes } = harness([product("first")])
  const result = await commitSetupDraft(db, scope, "draft", deps, {
    keys: ["removed"],
  })
  expect(result.results).toEqual([])
  expect(outcomes).toEqual([])
})

test("ordinary Setup partial success corrects and reconfirms only the failed record while skipped and committed records stay unchanged", async () => {
  // Stateful storage only: the real read/upsert/state/outcome queries and commit
  // orchestration below decide readiness, mutability, selection and retry identity.
  type Row = Entity & {
    source: { messageId: string; quote: string }
    openQuestions: unknown
    sortOrder: number
    updatedAt: Date
  }
  const rows = [
    product("first"),
    product("blocked"),
    {
      ...product("later"),
      state: "PROPOSED",
    },
  ].map(
    (entity, sortOrder): Row => ({
      ...entity,
      source: { messageId: "ordinary-app-input", quote: entity.key },
      openQuestions: [],
      sortOrder,
      updatedAt: new Date("2026-10-15T00:00:00.000Z"),
    }),
  )
  let revision = 1
  type StateWhere = { in?: string[]; notIn?: string[]; not?: string }
  const storage = {
    setupDraft: {
      findUniqueOrThrow: async (input: { where: { id: string } }) => {
        expect(input.where.id).toBe("draft")
        return structuredClone({
          id: "draft",
          revision,
          areas: null,
          entities: rows,
        })
      },
      update: async (input: {
        where: { id: string }
        data: { revision: { increment: number } }
      }) => {
        expect(input.where.id).toBe("draft")
        revision += input.data.revision.increment
        return { revision, _count: { entities: rows.length } }
      },
    },
    setupDraftEntity: {
      findMany: async (input: {
        where: { draftId: string; key: { in: string[] } }
      }) => {
        expect(input.where.draftId).toBe("draft")
        return structuredClone(
          rows.filter((row) => input.where.key.in.includes(row.key)),
        )
      },
      upsert: async (input: {
        where: { draftId_key: { draftId: string; key: string } }
        update: Partial<Row>
      }) => {
        expect(input.where.draftId_key.draftId).toBe("draft")
        const row = rows.find(
          (candidate) => candidate.key === input.where.draftId_key.key,
        )
        if (!row)
          throw Error("This recovery journey edits only existing draft records")
        Object.assign(row, structuredClone(input.update))
        return structuredClone(row)
      },
      updateMany: async (input: {
        where: {
          draftId: string
          key: string | { in: string[] }
          state?: StateWhere
        }
        data: {
          state?: string
          committedRecordId?: string
          errorCode?: string | null
        }
      }) => {
        expect(input.where.draftId).toBe("draft")
        const key = input.where.key
        const condition = input.where.state
        const matched = rows.filter(
          (row) =>
            (typeof key === "string"
              ? row.key === key
              : key.in.includes(row.key)) &&
            (!condition?.in || condition.in.includes(row.state)) &&
            (!condition?.notIn || !condition.notIn.includes(row.state)) &&
            (!condition?.not || condition.not !== row.state),
        )
        for (const row of matched) Object.assign(row, input.data)
        return { count: matched.length }
      },
    },
  }
  // The only simulated domain boundary records canonical catalog commands by
  // their actual operation identity; it refuses one supplied name, then accepts its correction.
  const saved = new Map<string, { id: string; name: string }>()
  const attempts: Array<{ name: string; clientOperationId: string }> = []
  const { deps } = harness(rows, {
    readSetupDraft,
    recordOutcome: async (_client, input) =>
      recordSetupDraftCommitOutcomeInTransaction(storage as never, input),
    createCatalogItem: mock(
      async (
        _client: unknown,
        input: { name: string; clientOperationId: string },
      ) => {
        attempts.push({
          name: input.name,
          clientOperationId: input.clientOperationId,
        })
        if (input.name === "blocked")
          throw new CatalogError(
            "DUPLICATE_CATALOG_KEY",
            "Correct the duplicate name.",
          )
        const existing = saved.get(input.clientOperationId)
        if (existing) {
          expect(existing.name).toBe(input.name)
          return existing
        }
        const record = { id: `saved_${input.name}`, name: input.name }
        saved.set(input.clientOperationId, record)
        return record
      },
    ) as never,
  })
  const client = storage as never
  const first = await commitSetupDraft(client, scope, "draft", deps)
  expect(first).toMatchObject({ interrupted: false, remaining: 0 })
  expect(first.results.map((row) => [row.key, row.state])).toEqual([
    ["first", "COMMITTED"],
    ["blocked", "FAILED"],
  ])
  expect(saved.size).toBe(1)
  const before = structuredClone(rows.find((row) => row.key === "first"))
  const correctedPayload = {
    kind: "product" as const,
    name: "corrected",
    unitName: "Crate",
    priceMinor: 450_000,
  }
  const readiness = deriveSetupEntityState(correctedPayload, [])
  expect(readiness.state).toBe("PROPOSED")
  const corrected = await upsertSetupDraftEntitiesInTransaction(client, {
    draftId: "draft",
    entities: [
      {
        key: "blocked",
        kind: "PRODUCT",
        payload: correctedPayload,
        state: readiness.state,
        source: { messageId: "ordinary-app-input", quote: "blocked" },
        openQuestions: readiness.questions,
      },
      {
        key: "first",
        kind: "PRODUCT",
        payload: { ...correctedPayload, name: "must not overwrite" },
        state: "PROPOSED",
      },
    ],
  })
  expect(corrected.changed).toEqual(["blocked"])
  expect(corrected.rejected).toEqual(["first"])
  expect(rows.find((row) => row.key === "first")).toEqual(before)
  expect(rows.find((row) => row.key === "blocked")).toMatchObject({
    state: "PROPOSED",
    errorCode: null,
    payload: { name: "corrected" },
  })
  // An edit alone cannot write. This fresh read must ignore its reopened proposal.
  expect(
    (await commitSetupDraft(client, scope, "draft", deps)).results,
  ).toEqual([])
  expect(saved.size).toBe(1)
  expect(
    await setSetupDraftEntityStatesInTransaction(client, {
      draftId: "draft",
      keys: ["later"],
      state: "SKIPPED",
    }),
  ).toMatchObject({ updated: 1 })
  expect(
    await setSetupDraftEntityStatesInTransaction(client, {
      draftId: "draft",
      keys: ["first", "blocked", "later"],
      state: "CONFIRMED",
    }),
  ).toMatchObject({ updated: 1 })
  const retried = await commitSetupDraft(client, scope, "draft", deps)
  expect(retried).toMatchObject({ interrupted: false, remaining: 0 })
  expect(retried.results).toHaveLength(1)
  expect(retried.results[0]).toMatchObject({
    key: "blocked",
    state: "COMMITTED",
    recordId: "saved_corrected",
  })
  expect(rows.find((row) => row.key === "first")).toEqual(before)
  expect(rows.find((row) => row.key === "later")).toMatchObject({
    state: "SKIPPED",
    committedRecordId: null,
  })
  expect(attempts.map((attempt) => attempt.name)).toEqual([
    "first",
    "blocked",
    "corrected",
  ])
  expect(attempts[2]?.clientOperationId).not.toBe(
    attempts[1]?.clientOperationId,
  )
  expect(saved.size).toBe(2)
  const receipts = structuredClone(rows)
  expect(
    (await commitSetupDraft(client, scope, "draft", deps)).results,
  ).toEqual([])
  expect(rows).toEqual(receipts)
  expect(saved.size).toBe(2)
  expect(attempts).toHaveLength(3)
})
