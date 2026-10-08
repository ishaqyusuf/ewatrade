import { expect, test } from "bun:test"
import { financeExpenseReceiptListSchema } from "../../schemas/finance-expense-receipts"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const input = {
  bookId: "book-1",
  billId: "expense-1",
  clientCommandId: "receipt-command-1",
  originalFileName: "receipt.pdf",
  contentDigest: "a".repeat(64),
  contentType: "application/pdf" as const,
  sizeBytes: 16,
}

function caller(db: unknown, role = "OWNER") {
  return createCallerFactory(financeRouter)({
    db,
    requestHeaders: new Headers(),
    requestId: "expense-receipt-api-test",
    session: {
      session: { id: "session-1", token: "private-session-token" },
      user: { id: "session-actor" },
    },
    tenantContext: {
      tenant: { id: "tenant-from-session", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  } as never).expenseReceipts
}

function fixture() {
  const queries: { target: string; input: unknown }[] = []
  const locks: unknown[][] = []
  const transactions: unknown[] = []
  const tenant = {
    id: "tenant-from-session",
    isActive: true,
    qaPurgeStartedAt: null as Date | null,
  }
  const membership = {
    tenantId: tenant.id,
    userId: "session-actor",
    status: "ACTIVE",
    role: "OWNER",
    tenant,
  }
  const expense = {
    id: input.billId,
    bookId: input.bookId,
    kind: "EXPENSE",
    voidedAt: null,
  }
  const asset = {
    id: "asset-1",
    tenantId: tenant.id,
    ...input,
    actorUserId: "session-actor",
    payloadHash: "",
    storagePath: "server-only-private-path",
    storageStoreId: "store_private",
    uploadClaimId: "secret-upload-claim",
    safetyAttestation: { privateProviderEvidence: true },
    uploadState: "PENDING",
    safetyState: "QUARANTINED",
    attachmentState: "UNATTACHED",
    createdAt: new Date("2026-10-02T00:00:00Z"),
    expiresAt: new Date("2026-10-03T00:00:00Z"),
    verifiedAt: null,
    attachedAt: null,
    withdrawnAt: null,
    bytesDeletedAt: null,
    retentionHold: false,
  }
  const record = (target: string, value: unknown) =>
    queries.push({ target, input: value })
  let previous: unknown = null
  const tx = {
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(values)
      return [{ id: input.bookId }]
    },
    membership: {
      findFirst: async () => membership,
    },
    tenant: {
      findUnique: async () => tenant,
    },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: input.bookId,
        tenantId: tenant.id,
      }),
    },
    financeBill: {
      findFirst: async (value: unknown) => {
        record("expense", value)
        return expense
      },
    },
    financeExpenseReceiptAsset: {
      findFirst: async (value: unknown) => {
        record("asset", value)
        return asset
      },
      findMany: async (value: unknown) => {
        record("page", value)
        return [asset]
      },
      count: async () => 0,
      create: async (value: {
        data: Partial<typeof asset> & { id: string }
      }) => {
        record("create", value)
        Object.assign(asset, value.data)
        return asset
      },
    },
    financeExpenseReceiptAuditEvent: {
      create: async (value: unknown) => record("audit", value),
    },
    financeCommand: {
      findUnique: async () => previous,
      create: async (value: { data: unknown }) => {
        previous = value.data
        record("command", value)
      },
    },
  }
  const db = {
    $transaction: async (
      execute: (value: typeof tx) => unknown,
      options: unknown,
    ) => {
      transactions.push(options)
      return execute(tx)
    },
  }
  return {
    db,
    queries,
    locks,
    transactions,
    tenant,
    membership,
    expense,
    asset,
  }
}

test("receipt intent and metadata reject staff before any database access", async () => {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get: () => {
        effects++
        throw new Error("No database access")
      },
    },
  )
  for (const role of ["MANAGER", "CASHIER", "OPERATOR", "SUPPORT", "MEMBER"]) {
    const api = caller(db, role)
    for (const operation of [
      () => api.createIntent(input),
      () =>
        api.get({
          bookId: input.bookId,
          billId: input.billId,
          assetId: "asset-1",
        }),
      () => api.list({ bookId: input.bookId, billId: input.billId }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  expect(effects).toBe(0)
})

test("API rejects actor, source, provider and verdict injection", async () => {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get: () => {
        effects++
        throw new Error("No database access")
      },
    },
  )
  const api = caller(db)
  for (const injected of [
    { tenantId: "foreign-tenant" },
    { actorUserId: "foreign-owner" },
    { storagePath: "foreign-path" },
    { storageStoreId: "store_foreign" },
    { safetyState: "SAFE" },
    { uploadState: "VERIFIED" },
    { sizeBytes: 10_000_001 },
    { originalFileName: "../receipt.pdf" },
  ]) {
    await expect(
      api.createIntent({ ...input, ...injected } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  await expect(
    api.list({
      bookId: input.bookId,
      billId: input.billId,
      actorUserId: "foreign-owner",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    api.get({
      bookId: input.bookId,
      billId: input.billId,
      assetId: "asset-1",
      tenantId: "foreign-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(effects).toBe(0)
})

test("metadata uses the authenticated actor, exact Expense and bounded transactions without private internals", async () => {
  const f = fixture()
  const api = caller(f.db)
  const detail = await api.get({
    bookId: input.bookId,
    billId: input.billId,
    assetId: f.asset.id,
  })
  const page = await api.list({ bookId: input.bookId, billId: input.billId })
  expect(page.items).toEqual([detail])
  expect(page.nextCursor).toBeNull()
  expect(f.locks).toContainEqual(["tenant-from-session", "session-actor"])
  expect(f.queries.find((q) => q.target === "asset")?.input).toMatchObject({
    where: {
      id: f.asset.id,
      tenantId: f.tenant.id,
      bookId: input.bookId,
      billId: input.billId,
    },
  })
  expect(f.queries.find((q) => q.target === "page")?.input).toMatchObject({
    where: {
      tenantId: f.tenant.id,
      bookId: input.bookId,
      billId: input.billId,
    },
    take: 31,
  })
  expect(f.transactions).toEqual([
    { maxWait: 10_000, timeout: 30_000 },
    { maxWait: 10_000, timeout: 30_000 },
  ])
  for (const key of [
    "storagePath",
    "storageStoreId",
    "uploadClaimId",
    "safetyAttestation",
    "contentDigest",
    "payloadHash",
    "actorUserId",
  ])
    expect(detail).not.toHaveProperty(key)
})

test("current repository revocation and purge refuse a stale authorized API context", async () => {
  const f = fixture()
  const api = caller(f.db)
  f.membership.status = "INACTIVE"
  await expect(
    api.list({ bookId: input.bookId, billId: input.billId }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  f.membership.status = "ACTIVE"
  f.tenant.qaPurgeStartedAt = new Date()
  await expect(api.createIntent(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(
    f.queries.some((q) => ["create", "audit", "command"].includes(q.target)),
  ).toBe(false)
})

test("a Purchase source cannot masquerade as an Expense", async () => {
  const f = fixture()
  f.expense.kind = "PURCHASE"
  await expect(
    caller(f.db).get({
      bookId: input.bookId,
      billId: input.billId,
      assetId: f.asset.id,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(f.queries.some((q) => q.target === "asset")).toBe(false)
})

test("intent creation persists the protected actor and leaves uploads quarantined", async () => {
  const f = fixture()
  const result = await caller(f.db).createIntent(input)
  expect(f.queries.find((q) => q.target === "create")?.input).toMatchObject({
    data: {
      tenantId: f.tenant.id,
      bookId: input.bookId,
      billId: input.billId,
      actorUserId: "session-actor",
      contentDigest: input.contentDigest,
    },
  })
  expect(f.queries.find((q) => q.target === "command")?.input).toMatchObject({
    data: { actorUserId: "session-actor", kind: "EXPENSE_RECEIPT_INTENT" },
  })
  expect(result.uploadState).toBe("PENDING")
  expect(result.safetyState).toBe("QUARANTINED")
  expect(result.attachmentState).toBe("UNATTACHED")
  expect(result).not.toHaveProperty("storagePath")
})

test("saved command retry is read-only and changed original identity maps to CONFLICT", async () => {
  const f = fixture()
  await caller(f.db).createIntent(input)
  f.queries.length = 0
  await caller(f.db).createIntent(input)
  expect(
    f.queries.some((q) => ["create", "audit", "command"].includes(q.target)),
  ).toBe(false)
  await expect(
    caller(f.db).createIntent({ ...input, originalFileName: "changed.pdf" }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("receipt list input accepts infinite-query page direction and stays strict", () => {
  // tRPC infinite queries send `direction` with every page.
  const list = { bookId: "book-1", billId: "expense-1", limit: 20 }
  for (const direction of ["forward", "backward"] as const)
    expect(
      financeExpenseReceiptListSchema.safeParse({ ...list, direction }).success,
    ).toBe(true)
  expect(
    financeExpenseReceiptListSchema.safeParse({ ...list, direction: "up" })
      .success,
  ).toBe(false)
  expect(
    financeExpenseReceiptListSchema.safeParse({ ...list, tenantId: "other" })
      .success,
  ).toBe(false)
})
