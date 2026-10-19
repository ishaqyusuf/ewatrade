import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test"
import type {
  GeneralAction,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"

// Run alone: only membership/age loaders are mocked. Actual proposal decisions,
// central policy and transfer authority run against an in-memory transaction.
// No database, provider, runtime configuration or business records are touched.
const canonicalQueries = await import("@ewatrade/db/queries")
const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "t".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})
const actions = [
  {
    action: "stock_transfer_dispatch",
    sourceBalanceSourceId: "balance-source",
    targetStoreId: "store-target",
    quantity: "4",
    reason: "Restock branch",
  },
  {
    action: "stock_transfer_receive",
    transferId: "transfer",
    quantity: "1",
    reason: "One arrived",
  },
  {
    action: "stock_transfer_cancel",
    transferId: "transfer",
    reason: "Return remaining stock",
  },
] as const satisfies readonly GeneralAction[]

function tenant(activeStoreId = "store-source") {
  return {
    tenant: { id: "tenant", dataClassification: "QA", retailOpsPlanId: "pro" },
    membership: { id: "membership", role: "MANAGER" },
    activeStore: { id: activeStoreId, currencyCode: "NGN" },
    stores: [{ id: "store-source" }, { id: "store-target" }],
    staffAccess: {
      businessRole: "MANAGER",
      status: "ACTIVE",
      mode: "SCOPED",
      catalogEditor: false,
      assignments: ["store-source", "store-target"].map((storeId) => ({
        storeId,
        status: "ACTIVE",
        role: "MANAGER",
      })),
    },
  }
}
let freshTenant = tenant()
mock.module("@ewatrade/db/queries", () => ({
  ...canonicalQueries,
  getActiveTenantForUser: async () => freshTenant,
  getCustomerAccountAgeStatus: async () => ({ eligible: true }),
}))
const { decideGeneralProposal } = await import(
  "../../../../apps/api/src/assistant/general-proposals"
)

function fixture(payload: (typeof actions)[number]) {
  const active =
    payload.action === "stock_transfer_receive"
      ? "store-target"
      : "store-source"
  freshTenant = tenant(active)
  const savedTenant = tenant(active)
  const receipt = {
    kind: "stock_transfer",
    recordId: "transfer",
    title: "Saved transfer result",
    detail: "Earlier confirmed movement; no new stock movement.",
  } satisfies GeneralReceipt
  const row = {
    id: "proposal",
    tenantId: "tenant",
    storeId: active,
    actorUserId: "actor",
    conversationId: "chat",
    revision: 1,
    action: payload.action,
    actionVersion: 1,
    payload,
    payloadHash: "saved-payload",
    status: "COMPLETED",
    expiresAt: new Date(0),
    executedResult: receipt,
    targetRevision: "old-stock-review",
    idempotencyKey: "completed-key",
    approvalTokenHash: "expired-approval",
  }
  const observed = {
    writes: 0,
    transferReads: [] as Array<unknown>,
    transferAvailable: true,
    sessionActive: true,
  }
  const transfer = {
    id: "transfer",
    tenantId: "tenant",
    sourceStoreId: "store-source",
    targetStoreId: "store-target",
    sourceBalanceSourceId: "balance-source",
    // A terminal transfer can have entirely different stock from its draft.
    status: "CANCELLED",
  }
  const unexpectedWrite = async () => {
    observed.writes++
    throw Error("Completed recovery must never execute a write")
  }
  const tx = {
    $queryRaw: async () => [],
    session: {
      findFirst: async () =>
        observed.sessionActive ? { id: "session" } : null,
    },
    accountPrivacyRequest: { findUnique: async () => null },
    assistantActionProposal: {
      findFirst: async () => row,
      update: unexpectedWrite,
      updateMany: unexpectedWrite,
    },
    stockTransfer: {
      findFirst: async (query: unknown) => {
        observed.transferReads.push(query)
        return observed.transferAvailable ? transfer : null
      },
      create: unexpectedWrite,
      update: unexpectedWrite,
    },
  }
  const ctx = {
    db: {
      $transaction: async (run: (db: typeof tx) => Promise<unknown>) => run(tx),
    },
    session: { user: { id: "actor" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: savedTenant,
    tenantSlug: "tenant",
  }
  return {
    observed,
    transfer,
    receipt,
    decide: () =>
      decideGeneralProposal(ctx as never, {
        proposalId: row.id,
        revision: 1,
        decision: "confirm",
      }),
  }
}
beforeEach(() => {
  freshTenant = tenant()
})

for (const action of actions) {
  test(`${action.action}: completed recovery returns the same original receipt without re-execution`, async () => {
    const f = fixture(action)
    const first = await f.decide()
    expect(first.receipt).toEqual(f.receipt)
    expect(first.approvalToken).toBeUndefined()
    expect(await f.decide()).toEqual(first)
    expect(f.observed.writes).toBe(0)
  })

  test(`${action.action}: losing the other Store refuses completed recovery`, async () => {
    const f = fixture(action)
    const current = freshTenant.activeStore.id
    freshTenant.stores = freshTenant.stores.filter(
      (store) => store.id === current,
    )
    freshTenant.staffAccess.assignments =
      freshTenant.staffAccess.assignments.filter(
        (assignment) => assignment.storeId === current,
      )
    await expect(f.decide()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.observed.writes).toBe(0)
  })

  test(`${action.action}: downgrade at the other Store refuses even when it stays visible`, async () => {
    const f = fixture(action)
    const other = freshTenant.staffAccess.assignments.find(
      (assignment) => assignment.storeId !== freshTenant.activeStore.id,
    )
    if (!other) throw Error("Fixture must retain the other Store assignment")
    other.role = "CASHIER"
    await expect(f.decide()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.observed.writes).toBe(0)
  })

  test(`${action.action}: missing original cannot return an unverified saved receipt`, async () => {
    const f = fixture(action)
    f.observed.transferAvailable = false
    await expect(f.decide()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.observed.writes).toBe(0)
  })

  test(`${action.action}: an original from another Tenant cannot prove recovery`, async () => {
    const f = fixture(action)
    f.transfer.tenantId = "foreign-tenant"
    await expect(f.decide()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.observed.writes).toBe(0)
  })

  test(`${action.action}: a different original cannot prove the saved receipt`, async () => {
    const f = fixture(action)
    f.transfer.id = "another-transfer"
    await expect(f.decide()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.observed.writes).toBe(0)
  })
}

test("dispatch recovery stays bound to its original source balance and destination", async () => {
  for (const field of ["sourceBalanceSourceId", "targetStoreId"] as const) {
    const f = fixture(actions[0])
    f.transfer[field] = "different-source"
    await expect(f.decide()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.observed.writes).toBe(0)
  }
})

test("an expired Session refuses recovery before reading the transfer", async () => {
  const f = fixture(actions[0])
  f.observed.sessionActive = false
  await expect(f.decide()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  expect(f.observed.transferReads).toEqual([])
  expect(f.observed.writes).toBe(0)
})
