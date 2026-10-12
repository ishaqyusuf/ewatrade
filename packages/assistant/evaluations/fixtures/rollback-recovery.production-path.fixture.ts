import { beforeEach, expect, mock, test } from "bun:test"

// Isolated production-path acceptance fixture. Run this file explicitly and alone: module mocks
// replace workspace/age database loaders, while session/privacy/scope/role checks,
// rollout policy, proposal decision branches and DTO projection remain real.
// No real database, provider, manifest edit or running API is used.
const canonicalQueries = await import("@ewatrade/db/queries")
function tenant(role = "OWNER") {
  return {
    tenant: {
      id: "qa-tenant",
      dataClassification: "QA",
      retailOpsPlanId: "pro",
      currencyCode: "NGN",
    },
    membership: { id: "qa-membership", role },
    activeStore: { id: "qa-store", currencyCode: "NGN" },
    stores: [{ id: "qa-store" }],
    staffAccess: {
      businessRole: role,
      status: "ACTIVE",
      mode: "LEGACY",
      catalogEditor: false,
      assignments: [],
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
const { capabilityForAction } = await import(
  "@ewatrade/assistant/capabilities/manifest"
)
const { generalCapabilityEnabled } = await import(
  "../../../../apps/api/src/assistant/general-rollout"
)

const payload = {
  action: "held_credit_refund",
  bookId: "qa-book",
  accountId: "qa-account",
  creditEntryId: "qa-credit",
  moneyAccountId: "qa-cash",
  amountMinor: "250",
  method: "CASH",
  effectiveAt: "2026-10-12T12:00:00Z",
  reason: "QA saved refund",
  moneyAlreadyReturned: true,
} as const
const receipt = {
  kind: "customer",
  recordId: "qa-customer",
  title: "Saved refund receipt",
  detail: "Already completed; never refund twice.",
}
const rowFor = (status: "PENDING" | "COMPLETED" | "CANCELLED") => ({
  id: "qa-proposal",
  tenantId: "qa-tenant",
  storeId: "qa-store",
  actorUserId: "qa-actor",
  conversationId: "qa-chat",
  revision: 1,
  action: payload.action,
  actionVersion: 1,
  payload,
  payloadHash: "not-needed-for-replay-or-cancel",
  status,
  expiresAt: new Date(Date.now() + 60_000),
  executedResult: status === "COMPLETED" ? receipt : null,
  targetRevision: null,
  idempotencyKey: "qa-operation",
  approvalTokenHash: "not-a-live-approval",
})
function fixture(status: "PENDING" | "COMPLETED" | "CANCELLED") {
  let row = rowFor(status)
  const observed = {
    locks: 0,
    reads: 0,
    writes: 0,
    sessionActive: true,
    privacyBlocked: false,
  }
  const tx = {
    $queryRaw: async () => {
      observed.locks++
      return []
    },
    session: {
      findFirst: async () =>
        observed.sessionActive ? { id: "qa-session" } : null,
    },
    accountPrivacyRequest: {
      findUnique: async () =>
        observed.privacyBlocked ? { status: "PROCESSING" } : null,
    },
    assistantActionProposal: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        observed.reads++
        if (
          where.id !== row.id ||
          where.tenantId !== row.tenantId ||
          where.storeId !== row.storeId ||
          where.actorUserId !== row.actorUserId
        )
          return null
        return row
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; revision: number; status: string }
        data: { status: "CANCELLED" }
      }) => {
        expect(where).toEqual({
          id: row.id,
          revision: row.revision,
          status: "PENDING",
        })
        expect(data.status).toBe("CANCELLED")
        observed.writes++
        if (row.status !== "PENDING") return { count: 0 }
        row = { ...row, status: data.status }
        return { count: 1 }
      },
      update: async () => {
        throw Error("Unexpected business execution/completion")
      },
    },
  }
  const db = {
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
  }
  const ctx = {
    db,
    session: { user: { id: "qa-actor" }, session: { id: "qa-session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: tenant(),
    tenantSlug: "qa-tenant",
  }
  const decide = (decision: "confirm" | "cancel") =>
    decideGeneralProposal(ctx as never, {
      proposalId: row.id,
      revision: row.revision,
      decision,
    })
  return { observed, decide }
}
beforeEach(() => {
  freshTenant = tenant()
})

test("a planned capability returns the completed receipt repeatedly with no write", async () => {
  expect(generalCapabilityEnabled(capabilityForAction(payload.action))).toBe(
    false,
  )
  const f = fixture("COMPLETED")
  const first = await f.decide("confirm")
  expect(first.status).toBe("COMPLETED")
  expect(first.receipt).toEqual(receipt)
  expect(first.approvalToken).toBeUndefined()
  expect(await f.decide("confirm")).toEqual(first)
  expect(f.observed.writes).toBe(0)
  expect(f.observed.locks).toBe(4)
})
test("a planned pending draft cancels once and replay never writes twice", async () => {
  const f = fixture("PENDING")
  const cancelled = await f.decide("cancel")
  expect(cancelled.status).toBe("CANCELLED")
  expect(cancelled.approvalToken).toBeUndefined()
  expect(await f.decide("cancel")).toEqual(cancelled)
  expect(f.observed.writes).toBe(1)
})
test("pending confirm stays refused by rollout before any effect", async () => {
  const f = fixture("PENDING")
  await expect(f.decide("confirm")).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "The assistant can't do this yet.",
  })
  expect(f.observed.writes).toBe(0)
})
test("completed replay rereads role instead of trusting the stale Owner context", async () => {
  const f = fixture("COMPLETED")
  freshTenant = tenant("CASHIER")
  await expect(f.decide("confirm")).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.observed.writes).toBe(0)
})
test("expired session refuses replay before reading a saved proposal", async () => {
  const f = fixture("COMPLETED")
  f.observed.sessionActive = false
  await expect(f.decide("confirm")).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
  expect(f.observed.reads).toBe(0)
  expect(f.observed.writes).toBe(0)
})
test("privacy access block refuses cancellation before reading the draft", async () => {
  const f = fixture("PENDING")
  f.observed.privacyBlocked = true
  await expect(f.decide("cancel")).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.observed.reads).toBe(0)
  expect(f.observed.writes).toBe(0)
})
test("fresh Store change refuses completed replay instead of cross-scope recovery", async () => {
  const f = fixture("COMPLETED")
  freshTenant.activeStore = {
    ...freshTenant.activeStore,
    id: "different-store",
  }
  await expect(f.decide("confirm")).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.observed.reads).toBe(0)
  expect(f.observed.writes).toBe(0)
})
test("revoked scoped Manager access refuses cancellation without a draft read", async () => {
  const f = fixture("PENDING")
  freshTenant = tenant("MANAGER")
  freshTenant.staffAccess.mode = "SCOPED"
  await expect(f.decide("cancel")).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.observed.reads).toBe(0)
  expect(f.observed.writes).toBe(0)
})
