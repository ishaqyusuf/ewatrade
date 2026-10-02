import { expect, test } from "bun:test"
import { createQaPrivateMediaSafetyAttestation } from "@ewatrade/service-commerce"
import { financeExpenseReceiptStoragePath } from "../../../../../packages/db/src/queries/finance/expense-receipt-rules"
import { createCallerFactory } from "../init"
import { financeExpenseReceiptsRouter } from "./finance-expense-receipts"

const scope = {
  bookId: "book_actions",
  billId: "expense_actions",
  assetId: "asset_actions",
}
const command = { ...scope, clientCommandId: "attach-command-1" }

function caller(db: unknown, role = "OWNER", actorUserId = "owner_actions") {
  return createCallerFactory(financeExpenseReceiptsRouter)({
    db,
    requestHeaders: new Headers(),
    requestId: "receipt-actions-test",
    session: {
      session: { id: "session_actions", token: "synthetic-private-token" },
      user: { id: actorUserId },
    },
    tenantContext: {
      tenant: { id: "tenant_actions", qaPurgeStartedAt: null },
      membership: { id: "membership_actions", role },
    },
  } as never)
}

function fixture() {
  const now = Date.now()
  const tenant = {
    id: "tenant_actions",
    isActive: true,
    qaPurgeStartedAt: null as Date | null,
    dataClassification: "QA",
  }
  const membership = {
    userId: "owner_actions",
    tenantId: tenant.id,
    status: "ACTIVE",
    role: "OWNER",
    tenant,
  }
  const book = {
    id: scope.bookId,
    tenantId: tenant.id,
    lastSequence: 12n,
    closedThrough: new Date(now - 1000),
  }
  const expense = {
    id: scope.billId,
    bookId: book.id,
    kind: "EXPENSE",
    voidedAt: null as Date | null,
    totalMinor: 1250n,
    incurredAt: new Date(now - 60_000),
  }
  const contentDigest = "a".repeat(64)
  const asset = {
    id: scope.assetId,
    tenantId: tenant.id,
    bookId: book.id,
    billId: expense.id,
    actorUserId: membership.userId,
    clientCommandId: "intent-command-1",
    payloadHash: "b".repeat(64),
    originalFileName: "synthetic-original.pdf",
    contentDigest,
    contentType: "application/pdf" as const,
    sizeBytes: 128,
    storageProvider: "vercel_blob_private",
    storageStoreId: "store_receiptactions",
    storagePath: financeExpenseReceiptStoragePath({
      ...scope,
      tenantId: tenant.id,
      contentDigest,
      contentType: "application/pdf",
    }),
    uploadState: "VERIFIED",
    safetyState: "SAFE",
    attachmentState: "UNATTACHED",
    version: 3,
    createdAt: new Date(now - 10_000),
    expiresAt: new Date(now + 60_000),
    uploadClaimId: null,
    uploadClaimedAt: new Date(now - 9_000),
    uploadLeaseUntil: null,
    verifiedClaimId: "synthetic-claim",
    verifiedClaimVersion: 1,
    verifiedAt: new Date(now - 8_000),
    safetyReviewedAt: new Date(now - 7_000),
    safetyAttestation: {
      purpose: "finance-expense-receipt-original-safety",
      version: 1,
      runtime: "qa_fixture",
      attestation: createQaPrivateMediaSafetyAttestation({
        byteSize: 128,
        contentDigest,
        mimeType: "application/pdf",
        mediaAssetId: scope.assetId,
        storageReference: "isolated API fixture; no provider call",
      }),
    },
    attachedAt: null as Date | null,
    attachedById: null as string | null,
    withdrawnAt: null as Date | null,
    withdrawnById: null as string | null,
    retentionHold: true,
    retentionHoldReason: "Synthetic retained evidence",
    cleanupClaimId: null,
    cleanupLeaseUntil: null,
    bytesDeletedAt: null,
  }
  const effects: { kind: string; input: unknown }[] = []
  const transactions: unknown[] = []
  const locks: unknown[][] = []
  const commands = new Map<
    string,
    {
      kind: string
      payloadHash: string
      result: { id: string }
      actorUserId: string
    }
  >()
  const tx = {
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(values)
      return [{ id: book.id }]
    },
    tenant: { findUnique: async () => tenant },
    membership: { findFirst: async () => membership },
    financeBook: { findUniqueOrThrow: async () => book },
    financeBill: {
      findFirst: async ({
        where,
      }: { where: { id: string; bookId: string } }) =>
        where.id === expense.id && where.bookId === book.id ? expense : null,
    },
    financeExpenseReceiptAsset: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string; bookId: string; billId: string }
      }) =>
        where.id === asset.id &&
        where.tenantId === asset.tenantId &&
        where.bookId === asset.bookId &&
        where.billId === asset.billId
          ? asset
          : null,
      count: async () => (asset.attachedAt ? 1 : 0),
      update: async (input: {
        where: { id: string }
        data: Partial<typeof asset>
      }) => {
        effects.push({ kind: "asset", input })
        Object.assign(asset, input.data)
        return asset
      },
    },
    financeCommand: {
      findUnique: async ({
        where,
      }: { where: { bookId_clientCommandId: { clientCommandId: string } } }) =>
        commands.get(where.bookId_clientCommandId.clientCommandId) ?? null,
      create: async ({
        data,
      }: {
        data: {
          clientCommandId: string
          kind: string
          payloadHash: string
          result: { id: string }
          actorUserId: string
        }
      }) => {
        effects.push({ kind: "command", input: data })
        commands.set(data.clientCommandId, data)
      },
    },
    financeExpenseReceiptAuditEvent: {
      create: async (input: unknown) => {
        effects.push({ kind: "audit", input })
      },
    },
    financeExpenseReceiptDownloadGrant: {
      updateMany: async (input: unknown) => {
        effects.push({ kind: "revoke", input })
        return { count: 1 }
      },
    },
  }
  const db = {
    $transaction: async (
      run: (value: typeof tx) => unknown,
      options: unknown,
    ) => {
      transactions.push(options)
      return run(tx)
    },
  }
  return {
    db,
    tenant,
    membership,
    book,
    expense,
    asset,
    effects,
    transactions,
    locks,
    commands,
  }
}

test("receipt actions reject staff and injected authority before database access", async () => {
  let access = 0
  const db = new Proxy(
    {},
    {
      get: () => {
        access++
        throw new Error("Unexpected database access")
      },
    },
  )
  for (const role of ["MANAGER", "CASHIER", "OPERATOR", "SUPPORT", "MEMBER"]) {
    const api = caller(db, role)
    await expect(api.attach(command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(api.withdraw(command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  }
  const api = caller(db)
  for (const injected of [
    { tenantId: "foreign" },
    { actorUserId: "foreign" },
    { safetyState: "SAFE" },
    { safetyAttestation: {} },
    { storagePath: "foreign" },
    { attachedAt: new Date() },
    { contentDigest: "c".repeat(64) },
  ]) {
    await expect(
      api.attach({ ...command, ...injected } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      api.withdraw({ ...command, ...injected } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  expect(access).toBe(0)
})

test("attachment uses protected actor and exact source, preserves money and returns only safe metadata", async () => {
  const f = fixture()
  const before = structuredClone({ book: f.book, expense: f.expense })
  const result = await caller(f.db).attach(command)
  expect(result.attachmentState).toBe("ATTACHED")
  expect(result.attachedAt).toBeInstanceOf(Date)
  expect(f.asset.attachedById).toBe("owner_actions")
  expect(f.commands.get(command.clientCommandId)).toMatchObject({
    kind: "EXPENSE_RECEIPT_ATTACH",
    actorUserId: "owner_actions",
  })
  expect(f.effects.filter((e) => e.kind === "audit")).toHaveLength(1)
  expect(f.locks).toContainEqual([
    f.asset.id,
    f.tenant.id,
    f.book.id,
    f.expense.id,
  ])
  expect(f.transactions).toEqual([{ maxWait: 10_000, timeout: 30_000 }])
  expect({ book: f.book, expense: f.expense }).toEqual(before)
  for (const key of [
    "actorUserId",
    "storagePath",
    "storageStoreId",
    "contentDigest",
    "payloadHash",
    "safetyAttestation",
    "verifiedClaimId",
  ])
    expect(result).not.toHaveProperty(key)
})

test("withdrawal by another current Admin revokes scoped unused grants and preserves original evidence", async () => {
  const f = fixture()
  await caller(f.db).attach(command)
  const original = structuredClone(f.asset)
  f.membership.userId = "admin_actions"
  f.membership.role = "ADMIN"
  f.expense.voidedAt = new Date()
  f.effects.length = 0
  const result = await caller(f.db, "ADMIN", "admin_actions").withdraw({
    ...command,
    clientCommandId: "withdraw-command-1",
  })
  expect(result.attachmentState).toBe("WITHDRAWN")
  expect(f.asset.withdrawnById).toBe("admin_actions")
  expect(f.asset).toMatchObject({
    attachedAt: original.attachedAt,
    attachedById: original.attachedById,
    storagePath: original.storagePath,
    contentDigest: original.contentDigest,
    retentionHold: true,
    retentionHoldReason: original.retentionHoldReason,
    bytesDeletedAt: null,
  })
  expect(f.effects.find((e) => e.kind === "revoke")?.input).toMatchObject({
    where: {
      tenantId: f.tenant.id,
      bookId: f.book.id,
      billId: f.expense.id,
      assetId: f.asset.id,
      consumedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: f.asset.withdrawnAt },
  })
  expect(f.commands.get("withdraw-command-1")).toMatchObject({
    kind: "EXPENSE_RECEIPT_WITHDRAW",
    actorUserId: "admin_actions",
  })
  expect(f.effects.filter((e) => e.kind === "audit")).toHaveLength(1)
})

test("exact retries are read-only after withdrawal, and conflicting commands cannot reattach", async () => {
  const f = fixture()
  const api = caller(f.db)
  await api.attach(command)
  const withdrawal = { ...command, clientCommandId: "withdraw-command-1" }
  await api.withdraw(withdrawal)
  f.asset.expiresAt = new Date(0)
  f.expense.voidedAt = new Date()
  f.effects.length = 0
  const version = f.asset.version
  expect((await api.attach(command)).attachmentState).toBe("WITHDRAWN")
  expect((await api.withdraw(withdrawal)).attachmentState).toBe("WITHDRAWN")
  expect(f.effects).toHaveLength(0)
  expect(f.asset.version).toBe(version)
  await expect(api.withdraw(command)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  await expect(
    api.attach({ ...command, clientCommandId: "new-attach-command" }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.effects).toHaveLength(0)
})

test("fresh revocation, purge and crossed sources refuse a stale authorized context", async () => {
  for (const action of ["attach", "withdraw"] as const) {
    for (const block of ["revocation", "purge", "foreign"] as const) {
      const f = fixture()
      if (block === "revocation") f.membership.status = "SUSPENDED"
      if (block === "purge") f.tenant.qaPurgeStartedAt = new Date()
      const input =
        block === "foreign"
          ? { ...command, billId: "foreign_expense" }
          : command
      await expect(caller(f.db)[action](input)).rejects.toMatchObject({
        code: block === "foreign" ? "NOT_FOUND" : "FORBIDDEN",
      })
      expect(f.effects).toHaveLength(0)
    }
  }
})

test("new attachment cannot promote quarantine, bypass live safety or impersonate the original creator", async () => {
  for (const condition of ["quarantine", "live", "creator", "cancelled"]) {
    const f = fixture()
    if (condition === "quarantine") f.asset.safetyState = "QUARANTINED"
    if (condition === "live") f.tenant.dataClassification = "LIVE"
    if (condition === "creator") f.asset.actorUserId = "former_creator"
    if (condition === "cancelled") f.expense.voidedAt = new Date()
    await expect(caller(f.db).attach(command)).rejects.toMatchObject({
      code: condition === "cancelled" ? "CONFLICT" : "FORBIDDEN",
    })
    expect(f.effects).toHaveLength(0)
    expect(f.asset.attachmentState).toBe("UNATTACHED")
  }
})
