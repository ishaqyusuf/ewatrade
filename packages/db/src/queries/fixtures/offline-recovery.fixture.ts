import { beforeEach, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { CatalogError } from "../catalog-errors"
import type { CreateCommercialOrderInput } from "../commercial-orders"
import { FinanceError } from "../finance/rules"

// Isolated process: actual recovery/hash/marker, identity policy, device guard
// and lock helper. Only canonical Order creation is intercepted. The transaction
// stand-in snapshots writes and serializes requests; this is not SQL race proof.
const refuseNetwork = () => {
  throw Error("Network is forbidden in the offline recovery fixture")
}
globalThis.fetch = Object.assign(async () => refuseNetwork(), {
  preconnect: refuseNetwork,
})
const owners = new WeakMap<
  object,
  { canonical: (input: CreateCommercialOrderInput) => Promise<unknown> }
>()
mock.module(new URL("../catalog.ts", import.meta.url).pathname, () => ({
  CatalogError,
}))
mock.module(
  new URL("../commercial-orders.ts", import.meta.url).pathname,
  () => ({
    createCommercialOrderInTransaction: (
      tx: Prisma.TransactionClient,
      input: CreateCommercialOrderInput,
    ) => {
      const owner = owners.get(tx)
      if (!owner)
        throw Error("Canonical command escaped the owning transaction")
      return owner.canonical(input)
    },
  }),
)
const { recoverSuspendedOfflineCommands, decideSuspendedOfflineCommand } =
  await import("../offline-recovery")
const { offlineCommandEnvelopeHash, replayOfflineCommands } = await import(
  "../offline-commands"
)
const { readOfflineRecoveryRecord } = await import("../offline-recovery-record")
const { RetailOpsOfflineDeviceError } = await import(
  "../retail-ops-subscriptions"
)
const scope = {
  actorUserId: "rep-a",
  tenantId: "tenant-a",
  storeId: "store-a",
  deviceId: "device-a",
}
const envelope = {
  clientCommandId: "command-original",
  createdAtClient: new Date("2026-10-17T06:00:00.000Z"),
  dependencyClientIds: [] as string[],
  eventVersion: 1,
  payload: {
    kind: "commercial_order" as const,
    customerName: "Original customer",
    fulfillNow: true,
    lines: [
      {
        custom: "quick_sale" as const,
        description: "Original sale",
        amountMinor: 500,
      },
    ],
    initialPayment: {
      amountMinor: 500,
      clientPaymentId: "payment-original",
      moneyAccountId: "account-original",
      method: "cash" as const,
    },
  },
}
type Envelope = typeof envelope
type Command = {
  id: string
  tenantId: string
  storeId: string
  offlineDeviceId: string
  clientCommandId: string
  payloadHash: string
  payload: Record<string, unknown>
  createdAtClient: Date
  dependencyClientIds: string[]
  eventVersion: number
  status: string
  conflictCode: string | null
  result: unknown
  updatedAt: Date
  [key: string]: unknown
}
function fixture() {
  let state = {
    commands: {} as Record<string, Command>,
    audits: [] as unknown[],
    effects: 0,
    tenantActive: true,
    storeActive: true,
    currencyCode: "NGN",
    bookPresent: true,
    sessionPresent: true,
    privacyStatus: null as string | null,
    ageBand: "ADULT",
    userCreatedAt: new Date("2020-01-01"),
    revocation: false,
    metadataRevoked: false,
    devicePresent: true,
    device: {
      id: "device-row-a",
      tenantId: scope.tenantId,
      deviceId: scope.deviceId,
      storeId: scope.storeId as string | null,
      registeredByUserId: scope.actorUserId as string | null,
      status: "ACTIVE",
      registeredAt: new Date("2026-10-16"),
    },
    memberships: {
      "rep-a": {
        id: "membership-rep",
        role: "CASHIER",
        status: "SUSPENDED",
        staffAccessMode: "LEGACY",
        staffAccessRevision: 4,
        updatedAt: new Date("2026-10-17T07:00:00Z"),
      },
      "admin-a": {
        id: "membership-admin",
        role: "OWNER",
        status: "ACTIVE",
        staffAccessMode: "LEGACY",
        staffAccessRevision: 1,
        updatedAt: new Date("2026-01-01"),
      },
    } as Record<
      string,
      {
        id: string
        role: string
        status: string
        staffAccessMode: string
        staffAccessRevision: number
        updatedAt: Date
      }
    >,
    change: {
      id: "suspension-a",
      happenedAt: new Date("2026-10-17T07:00:00Z"),
    } as { id: string; happenedAt: Date } | null,
    dependencies: [] as { status: string }[],
  }
  const calls: Array<{ kind: string; args?: unknown }> = []
  const canonicalInputs: CreateCommercialOrderInput[] = []
  let canonicalFailure: Error | null = null
  let auditFailure: Error | null = null
  let afterRollback: (() => void) | undefined
  let afterPlanning: (() => void) | undefined
  let atCommandLock: (() => void) | undefined
  let commandLocked = false
  let afterNextSql: (() => void) | undefined
  let atTenantLock: (() => void) | undefined
  let transactions = 0
  let forbidUnlockedDeviceReads = false
  let atDeviceLock: (() => void) | undefined
  let tail: Promise<unknown> = Promise.resolve()
  function record(kind: string, args?: unknown) {
    calls.push({ kind, args })
  }
  function matchCommand(where: Prisma.OfflineCommandWhereInput | undefined) {
    return (
      Object.values(state.commands).find(
        (row) => row.id === where?.id && row.tenantId === where?.tenantId,
      ) ?? null
    )
  }
  function planned() {
    const callback = afterPlanning
    afterPlanning = undefined
    callback?.()
  }
  function tenantMetadata() {
    return state.metadataRevoked
      ? {
          retailOps: {
            revokedOfflineDevices: [
              {
                actorUserId: scope.actorUserId,
                deviceId: scope.deviceId,
                registeredAt: "2026-10-16T00:00:00Z",
                lastSeenAt: "2026-10-16T01:00:00Z",
                revokedAt: "2026-10-17T07:00:00Z",
                revokedByUserId: "admin-a",
                platform: "android",
                storeId: scope.storeId,
              },
            ],
          },
        }
      : null
  }
  function sqlProjection(sql: string, row: Record<string, unknown>) {
    const selection = sql.slice(0, sql.indexOf(" FROM "))
    return structuredClone(
      selection.includes("*")
        ? row
        : Object.fromEntries(
            Object.entries(row).filter(([key]) =>
              new RegExp(`(?:"${key}"|\\b${key}\\b)`).test(selection),
            ),
          ),
    )
  }
  const runSql = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim()
    record("sql", { sql, values })
    const callback = afterNextSql
    afterNextSql = undefined
    callback?.()
    if (sql.includes('FROM "Tenant"')) {
      const callback = atTenantLock
      atTenantLock = undefined
      callback?.()
      return state.tenantActive && values[0] === scope.tenantId
        ? [
            sqlProjection(sql, {
              id: scope.tenantId,
              metadata: tenantMetadata(),
            }),
          ]
        : []
    }
    if (sql.includes('FROM "Membership"'))
      return values[0] === scope.tenantId &&
        typeof values[1] === "string" &&
        state.memberships[values[1]]
        ? [{ ...state.memberships[values[1]], isActive: state.tenantActive }]
        : []
    if (sql.includes('FROM "Store"')) {
      const [tenantId, storeId] = sql.includes('WHERE "id"')
        ? [values[1], values[0]]
        : values
      return state.storeActive &&
        tenantId === scope.tenantId &&
        storeId === scope.storeId
        ? [{ id: scope.storeId, currencyCode: state.currencyCode }]
        : []
    }
    if (sql.includes('FROM "FinanceBook"'))
      return state.bookPresent ? [{ id: "book-a" }] : []
    if (sql.includes('FROM "OfflineDevice"')) {
      if (sql.includes("FOR UPDATE")) {
        const callback = atDeviceLock
        atDeviceLock = undefined
        callback?.()
      }
      return state.devicePresent &&
        values[0] === state.device.tenantId &&
        values[1] === state.device.deviceId
        ? [sqlProjection(sql, state.device)]
        : []
    }
    if (sql.includes('FROM "OfflineCommand"')) {
      if (sql.includes("FOR UPDATE")) {
        commandLocked = true
        const callback = atCommandLock
        atCommandLock = undefined
        callback?.()
      }
      const row = Object.values(state.commands).find((entry) =>
        sql.includes('WHERE "tenantId"')
          ? entry.tenantId === values[0] && entry.clientCommandId === values[1]
          : entry.id === values[0] && entry.tenantId === values[1],
      )
      return row ? [sqlProjection(sql, row)] : []
    }
    return []
  }
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes("pg_advisory_xact_lock"))
        throw Error("Advisory lock has no row value; use $executeRaw")
      return runSql(strings, ...values)
    },
    $executeRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      await runSql(strings, ...values)
      return 0
    },
    session: {
      findFirst: async (args: Prisma.SessionFindFirstArgs) => {
        record("session", args)
        return state.sessionPresent ? { id: "session-rep" } : null
      },
    },
    accountPrivacyRequest: {
      findUnique: async (args: unknown) => {
        record("privacy", args)
        return state.privacyStatus ? { status: state.privacyStatus } : null
      },
    },
    user: {
      findUnique: async (args: unknown) => {
        record("user", args)
        return { ageBand: state.ageBand, createdAt: state.userCreatedAt }
      },
    },
    legalAcceptance: { findUnique: async () => null },
    store: {
      findFirst: async (args: unknown) => {
        record("store-plan", args)
        const row = state.storeActive
          ? { currencyCode: state.currencyCode }
          : null
        planned()
        return row
      },
    },
    offlineDevice: {
      findFirst: async () => state.device,
      findUnique: async (args: Prisma.OfflineDeviceFindUniqueArgs) => {
        record("device", args)
        if (forbidUnlockedDeviceReads)
          throw Error("Unexpected unlocked OfflineDevice reread")
        if (!state.devicePresent) return null
        if (args.where.id)
          return args.where.id === state.device.id
            ? { deviceId: state.device.deviceId }
            : null
        const key = args.where.tenantId_deviceId
        return key?.tenantId === state.device.tenantId &&
          key.deviceId === state.device.deviceId
          ? state.device
          : null
      },
    },
    offlineDeviceRevocation: {
      findFirst: async (args: unknown) => {
        record("revocation", args)
        return state.revocation ? { id: "revoked-a" } : null
      },
    },
    tenant: {
      findFirstOrThrow: async () => {
        record("tenant-metadata")
        if (forbidUnlockedDeviceReads)
          throw Error("Unexpected unlocked Tenant metadata reread")
        return { metadata: tenantMetadata() }
      },
    },
    retailOpsStaffLifecycleEvent: {
      findFirst: async (args: unknown) => {
        record("lifecycle", args)
        return state.change
      },
    },
    offlineCommand: {
      findUnique: async (args: Prisma.OfflineCommandFindUniqueArgs) => {
        record("command-read", args)
        const key = args.where.tenantId_clientCommandId
        return key?.tenantId === scope.tenantId
          ? (state.commands[key.clientCommandId] ?? null)
          : null
      },
      findFirst: async (args: Prisma.OfflineCommandFindFirstArgs) => {
        record("command-plan/read", args)
        const match = matchCommand(args.where)
        if (!match) return null
        const row = structuredClone(match)
        if (args.include?.store) {
          row.store =
            match.storeId === scope.storeId
              ? {
                  id: scope.storeId,
                  tenantId: scope.tenantId,
                  currencyCode: state.currencyCode,
                  status: state.storeActive ? "ACTIVE" : "PAUSED",
                }
              : null
        }
        if (args.include?.offlineDevice) {
          row.offlineDevice =
            match.offlineDeviceId === state.device.id
              ? structuredClone(state.device)
              : null
        }
        if (!commandLocked && args.include?.store) planned()
        return row
      },
      findMany: async (args: unknown) => {
        record("dependencies", args)
        return state.dependencies
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        record("command-create", data)
        const stored: Record<string, unknown> = {
          id:
            Object.keys(state.commands).length === 0
              ? "command-row-a"
              : `command-row-${Object.keys(state.commands).length + 1}`,
          status: "PENDING",
          conflictCode: null,
          result: null,
          authoritativeState: null,
          attemptedState: null,
          processedAt: null,
          updatedAt: new Date("2026-10-17T08:00:00Z"),
          ...data,
        }
        const row = stored as Command
        state.commands[row.clientCommandId] = row
        return row
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        record("command-update", data)
        const row = Object.values(state.commands).find(
          (entry) => entry.id === where.id,
        )
        if (!row) throw Error("Fixture command not found")
        const updated = {
          ...row,
          ...data,
          updatedAt: new Date(row.updatedAt.getTime() + 1),
        }
        state.commands[row.clientCommandId] = updated
        return updated
      },
    },
    offlineConflictReview: {
      create: async (args: unknown) => {
        record("audit", args)
        if (auditFailure) throw auditFailure
        state.audits.push(structuredClone(args))
        return { id: "review-a" }
      },
    },
  }
  owners.set(tx, {
    canonical: async (input) => {
      record("canonical")
      canonicalInputs.push(structuredClone(input))
      state.effects++
      if (canonicalFailure) throw canonicalFailure
      return { id: "private-order", orderNumber: "PRIVATE-RECEIPT" }
    },
  })
  const db = {
    ...tx,
    $transaction: (
      fn: (transaction: typeof tx) => Promise<unknown>,
      options: unknown,
    ) => {
      const run = async () => {
        transactions++
        record("begin", options)
        const before = structuredClone(state)
        commandLocked = false
        try {
          // Prisma gives each transaction its own object. The actual command
          // fence/financial/recovery tokens are WeakMap-bound to that lifetime.
          const transaction = new Proxy(tx, {})
          const owner = owners.get(tx)
          if (!owner) throw Error("Missing canonical transaction owner")
          owners.set(transaction, owner)
          const result = await fn(transaction)
          record("commit")
          return result
        } catch (error) {
          state = before
          record("rollback")
          afterRollback?.()
          throw error
        }
      }
      const next = tail.then(run)
      tail = next.catch(() => undefined)
      return next
    },
  } as unknown as PrismaClient
  return {
    db,
    calls,
    canonicalInputs,
    get state() {
      return state
    },
    get transactions() {
      return transactions
    },
    failCanonical: (error: Error | null) => {
      canonicalFailure = error
    },
    failAudit: (error: Error) => {
      auditFailure = error
    },
    onRollback: (fn: () => void) => {
      afterRollback = fn
    },
    afterPlanning: (fn: () => void) => {
      afterPlanning = fn
    },
    atCommandLock: (fn: () => void) => {
      atCommandLock = fn
    },
    afterNextSql: (fn: () => void) => {
      afterNextSql = fn
    },
    atTenantLock: (fn: () => void) => {
      atTenantLock = fn
    },
    atDeviceLock: (fn: () => void) => {
      atDeviceLock = fn
    },
    forbidUnlockedDeviceReads: () => {
      forbidUnlockedDeviceReads = true
    },
    stage: (
      commands: Envelope[] = [envelope],
      changed: Partial<typeof scope> = {},
    ) =>
      recoverSuspendedOfflineCommands(db, {
        ...scope,
        ...changed,
        sessionId: "session-rep",
        commands,
      }),
    decide: (
      decision: "approve" | "reject" = "approve",
      actorUserId = "admin-a",
      submitted = envelope,
    ) =>
      decideSuspendedOfflineCommand(db, {
        actorUserId,
        tenantId: scope.tenantId,
        commandId: "command-row-a",
        decision,
        reason: "Reviewed exact original sale",
        envelope: submitted,
      }),
  }
}
type Fixture = ReturnType<typeof fixture>
const row = (f: Fixture) => {
  const command = f.state.commands[envelope.clientCommandId]
  if (!command) throw Error("Expected original staged command")
  return command
}
const author = (f: Fixture) => {
  const member = f.state.memberships[scope.actorUserId]
  if (!member) throw Error("Expected original fixture author")
  return member
}
beforeEach(() => {
  process.env.APP_ENV = "production"
})

test("stage is zero-effect, immutable, hash-compatible and returns acknowledgement only", async () => {
  const f = fixture()
  const before = structuredClone(envelope)
  expect(await f.stage()).toEqual([
    { clientCommandId: envelope.clientCommandId, status: "held" },
  ])
  expect(f.state.effects).toBe(0)
  expect(f.canonicalInputs).toEqual([])
  expect(f.state.audits).toEqual([])
  expect(row(f)).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: null,
    payloadHash: offlineCommandEnvelopeHash(envelope),
    payload: {
      actorUserId: scope.actorUserId,
      initialPayment: { moneyAccountId: "account-original" },
    },
  })
  expect(readOfflineRecoveryRecord(row(f).payload)).toMatchObject({
    membershipId: "membership-rep",
    accessRevision: 4,
    lifecycleEventId: "suspension-a",
  })
  expect(envelope).toEqual(before)
})

test("identity read is fresh and carries exact session/user/expiry/non-QA predicates", async () => {
  const f = fixture()
  await f.stage()
  expect(f.calls.find((call) => call.kind === "session")?.args).toEqual({
    where: {
      id: "session-rep",
      userId: scope.actorUserId,
      expiresAt: { gt: expect.any(Date) },
      qaAuthorizationId: null,
      qaTenantId: null,
      qaMembershipId: null,
      qaStoreId: null,
      NOT: { token: { startsWith: "qas_" } },
    },
    select: { id: true },
  })
})

for (const denial of [
  "session",
  "privacy",
  "legal",
  "age",
  "tenant",
  "Store",
  "missing-member",
  "removed",
  "scoped",
  "role",
  "device-owner",
  "legacy-device-owner",
  "device-Store",
  "device-status",
  "durable-revocation",
  "legacy-revocation",
  "missing-lifecycle",
  "device-after-suspension",
] as const) {
  test(`stage refuses ${denial} with no command/audit/business effect`, async () => {
    const f = fixture()
    const author = f.state.memberships[scope.actorUserId]
    if (!author) throw Error("Expected fixture member")
    if (denial === "session") f.state.sessionPresent = false
    if (denial === "privacy") f.state.privacyStatus = "PROCESSING"
    if (denial === "legal") f.state.userCreatedAt = new Date("2026-10-17")
    if (denial === "age") f.state.ageBand = "UNDECLARED"
    if (denial === "tenant") f.state.tenantActive = false
    if (denial === "Store") f.state.storeActive = false
    if (denial === "missing-member") f.state.memberships = {}
    if (denial === "removed") author.status = "REMOVED"
    if (denial === "scoped") author.staffAccessMode = "SCOPED"
    if (denial === "role") author.role = "CUSTOMER"
    if (denial === "device-owner") f.state.device.registeredByUserId = "rep-b"
    if (denial === "legacy-device-owner")
      f.state.device.registeredByUserId = null
    if (denial === "device-Store") f.state.device.storeId = "store-b"
    if (denial === "device-status") f.state.device.status = "REVOKED"
    if (denial === "durable-revocation") f.state.revocation = true
    if (denial === "legacy-revocation") f.state.metadataRevoked = true
    if (denial === "missing-lifecycle") f.state.change = null
    if (denial === "device-after-suspension")
      f.state.device.registeredAt = new Date("2026-10-17T09:00:00Z")
    await expect(f.stage()).rejects.toBeInstanceOf(Error)
    expect(f.state.commands).toEqual({})
    expect(f.state.audits).toEqual([])
    expect(f.state.effects).toBe(0)
  })
}

test("reactivation permits only exact existing reconciliation and cannot admit new drafts", async () => {
  const f = fixture()
  await f.stage()
  author(f).status = "ACTIVE"
  const original = structuredClone(row(f))
  expect(await f.stage()).toEqual([
    { clientCommandId: envelope.clientCommandId, status: "held" },
  ])
  expect(row(f)).toEqual(original)
  await expect(
    f.stage([{ ...envelope, clientCommandId: "new-after-resume" }]),
  ).rejects.toBeInstanceOf(CatalogError)
  expect(f.state.effects).toBe(0)
  expect(Object.keys(f.state.commands)).toHaveLength(1)
})

test("changed envelope or stored immutable payload refuses without modifying the held original", async () => {
  const f = fixture()
  await f.stage()
  const original = structuredClone(row(f))
  await expect(
    f.stage([
      {
        ...envelope,
        payload: {
          ...envelope.payload,
          initialPayment: {
            ...envelope.payload.initialPayment,
            moneyAccountId: "account-b",
          },
        },
      },
    ]),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(row(f)).toEqual(original)
  row(f).payload.initialPayment = {
    ...envelope.payload.initialPayment,
    moneyAccountId: "tampered-stored-account",
  }
  await expect(f.decide()).rejects.toMatchObject({
    code: "IDEMPOTENCY_MISMATCH",
  })
  expect(f.canonicalInputs).toEqual([])
})

test("approval preserves original author/account/hash and commits apply plus separate admin audit atomically", async () => {
  const f = fixture()
  await f.stage()
  const hash = row(f).payloadHash
  expect(await f.decide()).toEqual({
    clientCommandId: envelope.clientCommandId,
    status: "approved",
  })
  expect(f.state.effects).toBe(1)
  expect(row(f)).toMatchObject({
    status: "APPLIED",
    payloadHash: hash,
    reviewedByUserId: "admin-a",
  })
  expect(f.canonicalInputs[0]).toMatchObject({
    actorUserId: "rep-a",
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    clientOrderId: envelope.clientCommandId,
    initialPayment: {
      moneyAccountId: "account-original",
      clientPaymentId: "payment-original",
    },
  })
  expect(f.canonicalInputs[0]).not.toHaveProperty("_offlineRecovery")
  expect(f.state.audits).toEqual([
    {
      data: {
        commandId: "command-row-a",
        decision: "RETRY",
        reason:
          "[suspended_staff:approve:applied] Reviewed exact original sale",
        reviewedByUserId: "admin-a",
        dependentClientIds: [],
      },
    },
  ])
  expect(f.state.memberships[scope.actorUserId]?.status).toBe("SUSPENDED")
  expect(await f.decide()).toEqual({
    clientCommandId: envelope.clientCommandId,
    status: "approved",
  })
  expect(f.state.effects).toBe(1)
  expect(f.state.audits).toHaveLength(1)
})

for (const denial of [
  "manager",
  "cashier",
  "suspended-admin",
  "self",
  "removed-author",
  "revoked-device",
  "unavailable-Store",
] as const) {
  test(`decision refuses ${denial} before canonical command or audit`, async () => {
    const f = fixture()
    await f.stage()
    const admin = f.state.memberships["admin-a"]
    const author = f.state.memberships[scope.actorUserId]
    if (!admin || !author) throw Error("Expected member fixtures")
    if (denial === "manager") admin.role = "MANAGER"
    if (denial === "cashier") admin.role = "CASHIER"
    if (denial === "suspended-admin") admin.status = "SUSPENDED"
    if (denial === "self") {
      author.role = "OWNER"
      author.status = "ACTIVE"
    }
    if (denial === "removed-author") author.status = "REMOVED"
    if (denial === "revoked-device") f.state.device.status = "REVOKED"
    if (denial === "unavailable-Store") f.state.storeActive = false
    await expect(
      f.decide("approve", denial === "self" ? scope.actorUserId : "admin-a"),
    ).rejects.toBeInstanceOf(Error)
    expect(f.state.effects).toBe(0)
    expect(f.state.audits).toEqual([])
    expect(row(f).status).toBe("REVIEW_REQUIRED")
  })
}

test("reactivated original author still requires explicit admin approval", async () => {
  const f = fixture()
  await f.stage()
  author(f).status = "ACTIVE"
  expect(await f.stage()).toEqual([
    { clientCommandId: envelope.clientCommandId, status: "held" },
  ])
  expect(f.state.effects).toBe(0)
  expect(await f.decide()).toMatchObject({ status: "approved" })
  expect(f.canonicalInputs[0]?.actorUserId).toBe(scope.actorUserId)
})

test("rejection creates no business effect; subsequent opposite decision observes first outcome", async () => {
  const f = fixture()
  await f.stage()
  expect(await f.decide("reject")).toMatchObject({ status: "rejected" })
  expect(await f.decide("approve")).toMatchObject({ status: "rejected" })
  expect(f.state.effects).toBe(0)
  expect(f.state.audits).toHaveLength(1)
  expect(f.state.audits[0]).toMatchObject({
    data: { decision: "DISCARD", reviewedByUserId: "admin-a" },
  })
})

for (const failure of [
  new FinanceError("FORBIDDEN", "Account permission changed"),
  new FinanceError("CONFLICT", "Account paused"),
  new CatalogError("REVISION_CONFLICT", "Stock changed"),
]) {
  test(`typed ${failure.code} rolls back canonical effects before retaining held conflict and can later be approved`, async () => {
    const f = fixture()
    await f.stage()
    const originalPayload = structuredClone(row(f).payload)
    f.failCanonical(failure)
    expect(await f.decide()).toMatchObject({ status: "held" })
    expect(f.state.effects).toBe(0)
    expect(f.state.audits).toHaveLength(1)
    expect(row(f).payload).toEqual(originalPayload)
    expect(row(f).status).toBe("REVIEW_REQUIRED")
    expect(row(f).conflictCode).toBe(
      failure.code === "FORBIDDEN"
        ? "PERMISSION_CHANGED"
        : failure.code === "REVISION_CONFLICT"
          ? "BALANCE_REVISION_CHANGED"
          : "INVALID_COMMAND",
    )
    f.failCanonical(null)
    expect(await f.decide()).toMatchObject({ status: "approved" })
    expect(f.state.effects).toBe(1)
  })
}

test("unknown canonical error propagates unchanged and leaves no effects, status or audit", async () => {
  const f = fixture()
  await f.stage()
  const original = structuredClone(row(f))
  const error = new Error("inert database failure")
  f.failCanonical(error)
  await expect(f.decide()).rejects.toBe(error)
  expect(f.state.effects).toBe(0)
  expect(f.state.audits).toEqual([])
  expect(row(f)).toEqual(original)
})

test("audit failure rolls back already-attempted canonical application and command status", async () => {
  const f = fixture()
  await f.stage()
  const error = new Error("inert audit write failed")
  f.failAudit(error)
  await expect(f.decide()).rejects.toBe(error)
  expect(f.canonicalInputs).toHaveLength(1)
  expect(f.state.effects).toBe(0)
  expect(row(f).status).toBe("REVIEW_REQUIRED")
  expect(f.state.audits).toEqual([])
})

test("intervening rejection after rollback is preserved instead of overwritten by conflict recording", async () => {
  const f = fixture()
  await f.stage()
  f.failCanonical(new FinanceError("CONFLICT", "Account changed"))
  f.onRollback(() => {
    row(f).status = "DISCARDED"
    row(f).updatedAt = new Date(row(f).updatedAt.getTime() + 1)
  })
  expect(await f.decide()).toMatchObject({ status: "rejected" })
  expect(f.state.effects).toBe(0)
  expect(f.state.audits).toEqual([])
  expect(row(f).status).toBe("DISCARDED")
})

test("two serialized decisions have one canonical/audit effect and return the winning result", async () => {
  const f = fixture()
  await f.stage()
  expect(await Promise.all([f.decide("approve"), f.decide("reject")])).toEqual([
    { clientCommandId: envelope.clientCommandId, status: "approved" },
    { clientCommandId: envelope.clientCommandId, status: "approved" },
  ])
  expect(f.state.effects).toBe(1)
  expect(f.state.audits).toHaveLength(1)
})

test("normal replay and recovery approval use identical canonical input for lost-status idempotency", async () => {
  const f = fixture()
  // Exercise real ordinary executeCommand with active author, then model only a
  // lost command-status write by retaining its original immutable envelope.
  author(f).status = "ACTIVE"
  await replayOfflineCommands(f.db, {
    ...scope,
    acceptNewCommands: true,
    requiresApproval: false,
    capabilities: { operateOrders: true },
    commands: [envelope],
  })
  const ordinary = f.canonicalInputs[0]
  if (!ordinary) throw Error("Expected real normal replay canonical call")
  row(f).status = "PENDING"
  author(f).status = "SUSPENDED"
  await f.stage()
  await f.decide()
  expect(f.canonicalInputs[1]).toEqual(ordinary)
})

test("one invalid envelope rolls the entire staged batch back without partial admission", async () => {
  const f = fixture()
  await expect(
    f.stage([
      envelope,
      {
        ...envelope,
        payload: {
          ...envelope.payload,
          customerName: "Changed immutable facts",
        },
      },
    ]),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(f.state.commands).toEqual({})
  expect(f.state.audits).toEqual([])
  expect(f.state.effects).toBe(0)
})

test("empty and oversized recovery batches refuse before opening a transaction", async () => {
  const f = fixture()
  await expect(f.stage([])).rejects.toBeInstanceOf(CatalogError)
  await expect(
    f.stage(Array.from({ length: 251 }, () => envelope)),
  ).rejects.toBeInstanceOf(CatalogError)
  expect(f.transactions).toBe(0)
})

test("receipt reconciliation after approval/rejection never returns privileged canonical facts", async () => {
  for (const decision of ["approve", "reject"] as const) {
    const f = fixture()
    await f.stage()
    await f.decide(decision)
    const result = await f.stage()
    expect(result).toEqual([
      {
        clientCommandId: envelope.clientCommandId,
        status: decision === "approve" ? "approved" : "rejected",
      },
    ])
    const serialized = JSON.stringify(result)
    for (const privateValue of [
      "Original customer",
      "Original sale",
      "account-original",
      "PRIVATE-RECEIPT",
      "private-order",
      "membership-rep",
      "_offlineRecovery",
    ])
      expect(serialized).not.toContain(privateValue)
  }
})

test("changed conflict version after rollback refuses overwrite of an intervening decision", async () => {
  const f = fixture()
  await f.stage()
  f.failCanonical(new FinanceError("CONFLICT", "Account changed"))
  f.onRollback(() => {
    row(f).updatedAt = new Date(row(f).updatedAt.getTime() + 1)
    row(f).conflictCode = "BALANCE_REVISION_CHANGED"
  })
  await expect(f.decide()).rejects.toBeInstanceOf(CatalogError)
  expect(row(f).conflictCode).toBe("BALANCE_REVISION_CHANGED")
  expect(f.state.effects).toBe(0)
  expect(f.state.audits).toEqual([])
})

test("approval lock statements plan Book before Tenant, principals, device and command", async () => {
  const f = fixture()
  await f.stage()
  f.calls.length = 0
  await f.decide()
  const sql = f.calls
    .filter((call) => call.kind === "sql")
    .map((call) => {
      const args = call.args
      return args && typeof args === "object"
        ? String(Reflect.get(args, "sql"))
        : ""
    })
  expect(sql[0]).toBe("SELECT pg_advisory_xact_lock(?::bigint)")
  expect(sql[1]).toContain('FROM "FinanceBook"')
  expect(sql[2]).toContain('FROM "Tenant"')
  expect(sql[2]).toContain('"qaPurgeStartedAt" IS NULL FOR UPDATE')
  expect(sql[3]).toContain('FROM "Membership"')
  expect(sql[4]).toContain('FROM "Membership"')
  expect(sql[5]).toContain('FROM "Store"')
  expect(sql[6]).toContain("pg_advisory_xact_lock")
  expect(sql[7]).toContain('FROM "OfflineDevice"')
  expect(sql[8]).toContain('FROM "OfflineCommand"')
  expect(
    f.calls.findIndex((call) => call.kind === "canonical"),
  ).toBeGreaterThan(f.calls.findIndex((call) => call.kind === "dependencies"))
})

test("admin rejects held draft without restoring revoked device, inactive Store, removed rep or rep session", async () => {
  for (const unavailable of [
    "device",
    "Store",
    "removed-rep",
    "rep-session",
  ] as const) {
    const f = fixture()
    await f.stage()
    if (unavailable === "device") f.state.device.status = "REVOKED"
    if (unavailable === "Store") f.state.storeActive = false
    if (unavailable === "removed-rep") author(f).status = "REMOVED"
    if (unavailable === "rep-session") f.state.sessionPresent = false
    const deviceBefore = structuredClone(f.state.device)
    const authorBefore = structuredClone(author(f))
    f.calls.length = 0
    expect(await f.decide("reject")).toMatchObject({ status: "rejected" })
    expect(row(f).status).toBe("DISCARDED")
    expect(f.state.effects).toBe(0)
    expect(f.canonicalInputs).toEqual([])
    expect(f.state.audits).toHaveLength(1)
    expect(f.state.device).toEqual(deviceBefore)
    expect(author(f)).toEqual(authorBefore)
    expect(
      f.calls.every((call) =>
        [
          "begin",
          "sql",
          "command-plan/read",
          "command-update",
          "audit",
          "commit",
        ].includes(call.kind),
      ),
    ).toBe(true)
    expect(
      f.calls.filter((call) => call.kind === "command-update"),
    ).toHaveLength(1)
    expect(
      f.calls
        .filter((call) => call.kind === "sql")
        .every((call) => {
          const sql = String(Reflect.get(Object(call.args), "sql"))
          return (
            sql === "SELECT pg_advisory_xact_lock(?::bigint)" ||
            /FROM "(?:Tenant|Membership|OfflineCommand)"/.test(sql)
          )
        }),
    ).toBe(true)
    expect(await f.decide("reject")).toMatchObject({ status: "rejected" })
    expect(f.state.audits).toHaveLength(1)
  }
})

for (const denial of [
  "manager",
  "cashier",
  "suspended-admin",
  "missing-admin",
  "self",
  "foreign-Tenant",
  "foreign-command",
  "changed-envelope",
  "changed-stored-payload",
  "missing-marker",
] as const) {
  test(`zero-effect rejection still refuses ${denial} before audit or write`, async () => {
    const f = fixture()
    await f.stage()
    const admin = f.state.memberships["admin-a"]
    if (!admin) throw Error("Expected admin fixture")
    if (denial === "manager") admin.role = "MANAGER"
    if (denial === "cashier") admin.role = "CASHIER"
    if (denial === "suspended-admin") admin.status = "SUSPENDED"
    if (denial === "missing-admin") f.state.memberships = { "rep-a": author(f) }
    if (denial === "self") {
      author(f).role = "OWNER"
      author(f).status = "ACTIVE"
    }
    if (denial === "changed-stored-payload")
      row(f).payload.initialPayment = {
        ...envelope.payload.initialPayment,
        moneyAccountId: "mutated-account",
      }
    if (denial === "missing-marker")
      row(f).payload = { ...envelope.payload, actorUserId: scope.actorUserId }
    const original = structuredClone(row(f))
    const submitted =
      denial === "changed-envelope"
        ? {
            ...envelope,
            payload: {
              ...envelope.payload,
              customerName: "Changed immutable customer",
            },
          }
        : envelope
    await expect(
      decideSuspendedOfflineCommand(f.db, {
        actorUserId: denial === "self" ? scope.actorUserId : "admin-a",
        tenantId: denial === "foreign-Tenant" ? "tenant-b" : scope.tenantId,
        commandId: denial === "foreign-command" ? "other-command" : row(f).id,
        decision: "reject",
        reason: "Reviewed original draft",
        envelope: submitted,
      }),
    ).rejects.toBeInstanceOf(CatalogError)
    expect(row(f)).toEqual(original)
    expect(f.state.audits).toEqual([])
    expect(f.state.effects).toBe(0)
    expect(f.canonicalInputs).toEqual([])
  })
}

test("opposite approval after terminal rejection observes original result despite unavailable apply proof", async () => {
  for (const unavailable of ["device", "Store", "removed-rep"] as const) {
    const f = fixture()
    await f.stage()
    if (unavailable === "device") f.state.device.status = "REVOKED"
    if (unavailable === "Store") f.state.storeActive = false
    if (unavailable === "removed-rep") author(f).status = "REMOVED"
    expect(await f.decide("reject")).toMatchObject({ status: "rejected" })
    expect(await f.decide("approve")).toMatchObject({ status: "rejected" })
    expect(f.state.effects).toBe(0)
    expect(f.state.audits).toHaveLength(1)
  }
})

test("suspended legacy Manager can stage an original sale but only Owner/Admin can authorize its apply", async () => {
  const f = fixture()
  author(f).role = "MANAGER"
  expect(await f.stage()).toEqual([
    { clientCommandId: envelope.clientCommandId, status: "held" },
  ])
  expect(f.state.effects).toBe(0)
  await expect(f.decide("approve", scope.actorUserId)).rejects.toBeInstanceOf(
    CatalogError,
  )
  expect(f.state.audits).toEqual([])
  expect(f.state.effects).toBe(0)
  expect(await f.decide()).toEqual({
    clientCommandId: envelope.clientCommandId,
    status: "approved",
  })
  expect(f.canonicalInputs[0]?.actorUserId).toBe(scope.actorUserId)
  expect(f.state.effects).toBe(1)
  expect(author(f)).toMatchObject({ role: "MANAGER", status: "SUSPENDED" })
  expect(f.state.audits[0]).toMatchObject({
    data: { reviewedByUserId: "admin-a" },
  })
})

test("preliminary Store metadata never authorizes approval after its locked state changes", async () => {
  for (const changed of ["paused", "currency"] as const) {
    const f = fixture()
    await f.stage()
    f.afterPlanning(() => {
      if (changed === "paused") f.state.storeActive = false
      else f.state.currencyCode = "USD"
    })
    await expect(f.decide()).rejects.toBeInstanceOf(CatalogError)
    expect(f.state.effects).toBe(0)
    expect(f.state.audits).toEqual([])
    expect(f.canonicalInputs).toEqual([])
  }
})

test("preliminary Device metadata never replaces fresh ownership, status or revocation proof", async () => {
  for (const changed of [
    "owner",
    "Store",
    "status",
    "durable",
    "legacy",
  ] as const) {
    const f = fixture()
    await f.stage()
    f.afterPlanning(() => {
      if (changed === "owner") f.state.device.registeredByUserId = "other-rep"
      if (changed === "Store") f.state.device.storeId = "other-store"
      if (changed === "status") f.state.device.status = "REVOKED"
      if (changed === "durable") f.state.revocation = true
      if (changed === "legacy") f.state.metadataRevoked = true
    })
    await expect(f.decide()).rejects.toBeInstanceOf(Error)
    expect(f.state.effects).toBe(0)
    expect(f.state.audits).toEqual([])
    expect(f.canonicalInputs).toEqual([])
  }
})

test("the command row acquired under lock retains marker, original author, Store, device and immutable hash fences", async () => {
  for (const changed of [
    "marker",
    "author",
    "Store",
    "device",
    "payload",
    "hash",
  ] as const) {
    const f = fixture()
    await f.stage()
    f.atCommandLock(() => {
      const command = row(f)
      if (changed === "marker")
        command.payload._offlineRecovery = {
          ...Object(command.payload._offlineRecovery),
          lifecycleEventId: "changed-marker",
        }
      if (changed === "author") command.payload.actorUserId = "other-rep"
      if (changed === "Store") command.storeId = "other-store"
      if (changed === "device") command.offlineDeviceId = "other-device-row"
      if (changed === "payload")
        command.payload.customerName = "changed-customer"
      if (changed === "hash") command.payloadHash = "changed-hash"
    })
    await expect(f.decide()).rejects.toBeInstanceOf(CatalogError)
    expect(f.state.effects).toBe(0)
    expect(f.state.audits).toEqual([])
    expect(f.canonicalInputs).toEqual([])
  }
})

test("empty dependency proof avoids a database dependency read", async () => {
  const f = fixture()
  await f.stage()
  f.calls.length = 0
  expect(await f.decide()).toMatchObject({ status: "approved" })
  expect(f.calls.filter((call) => call.kind === "dependencies")).toEqual([])
})

test("nonempty dependency proof must read the exact Tenant identities and require every dependency applied", async () => {
  for (const statuses of [[], ["PENDING"], ["APPLIED"]]) {
    const f = fixture()
    const submitted = {
      ...structuredClone(envelope),
      dependencyClientIds: ["original-dependency"],
    }
    await f.stage([submitted])
    f.state.dependencies = statuses.map((status) => ({ status }))
    f.calls.length = 0
    const decision = f.decide("approve", "admin-a", submitted)
    if (statuses[0] === "APPLIED") {
      expect(await decision).toMatchObject({ status: "approved" })
      expect(f.state.effects).toBe(1)
    } else {
      await expect(decision).rejects.toBeInstanceOf(CatalogError)
      expect(f.state.effects).toBe(0)
      expect(f.state.audits).toEqual([])
    }
    expect(f.calls.filter((call) => call.kind === "dependencies")).toEqual([
      {
        kind: "dependencies",
        args: {
          where: {
            tenantId: scope.tenantId,
            clientCommandId: { in: ["original-dependency"] },
          },
          select: { status: true },
        },
      },
    ])
  }
})

test("locked command and Device reads remain explicitly scoped before canonical effects", async () => {
  const f = fixture()
  await f.stage()
  f.calls.length = 0
  await f.decide()
  const statements = f.calls
    .filter((call) => call.kind === "sql")
    .map((call) => ({
      sql: String(Reflect.get(Object(call.args), "sql")),
      values: Reflect.get(Object(call.args), "values"),
    }))
  const device = statements.find((entry) =>
    entry.sql.includes('FROM "OfflineDevice"'),
  )
  const command = statements.find((entry) =>
    entry.sql.includes('FROM "OfflineCommand"'),
  )
  expect(device?.sql).toContain(
    'WHERE "tenantId"=? AND "deviceId"=? FOR UPDATE',
  )
  expect(device?.values).toEqual([scope.tenantId, scope.deviceId])
  expect(command?.sql).toContain('WHERE "id"=? AND "tenantId"=? FOR UPDATE')
  expect(command?.values).toEqual(["command-row-a", scope.tenantId])
})

function commandFenceValue(clientCommandId: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "ewatrade:offline-command:v1",
        scope.tenantId,
        clientCommandId,
      ]),
    )
    .digest()
    .readBigInt64BE(0)
}
function sqlFacts(calls: Fixture["calls"]) {
  return calls
    .filter((call) => call.kind === "sql")
    .map((call) => {
      const args = Object(call.args)
      const values: unknown = Reflect.get(args, "values")
      if (!Array.isArray(values))
        throw Error("Expected recorded SQL parameters")
      return { sql: String(Reflect.get(args, "sql")), values }
    })
}
const correctionMarker = () => ({
  version: 1,
  kind: "blank_quick_sale_replaced",
  originalClientCommandId: envelope.clientCommandId,
  originalPayloadHash: offlineCommandEnvelopeHash(envelope),
  replacementClientCommandId: "replacement-command",
  replacementPayloadHash: "b".repeat(64),
  replacedByUserId: "admin-a",
  replacedAt: "2026-10-17T09:00:00.000Z",
})

test("all exact batch command fences are acquired in signed order before Tenant or other domain locks", async () => {
  const f = fixture()
  const second = {
    ...structuredClone(envelope),
    clientCommandId: "second-command",
  }
  await f.stage([second, envelope])
  const sql = sqlFacts(f.calls)
  const expected = [second.clientCommandId, envelope.clientCommandId]
    .map(commandFenceValue)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  expect(sql.slice(0, 2)).toEqual(
    expected.map((value) => ({
      sql: "SELECT pg_advisory_xact_lock(?::bigint)",
      values: [value],
    })),
  )
  expect(sql[2]?.sql).toContain('FROM "Tenant"')
  expect(f.state.effects).toBe(0)
  // A later genuine transaction can coordinate a distinct set; fixture tx
  // identity must not accidentally reuse the helper's WeakMap capability.
  f.calls.length = 0
  await f.stage([
    { ...structuredClone(envelope), clientCommandId: "third-command" },
  ])
  expect(sqlFacts(f.calls)[0]).toEqual({
    sql: "SELECT pg_advisory_xact_lock(?::bigint)",
    values: [commandFenceValue("third-command")],
  })
})

test("conflicting duplicate batch identities refuse before any transaction or durable effect", async () => {
  const f = fixture()
  const changed = structuredClone(envelope)
  changed.payload.initialPayment.moneyAccountId = "different-account"
  await expect(f.stage([envelope, changed])).rejects.toMatchObject({
    code: "IDEMPOTENCY_MISMATCH",
  })
  expect(f.transactions).toBe(0)
  expect(f.calls).toEqual([])
  expect(f.state.commands).toEqual({})
})

test("a stale nonterminal correction tombstone refuses recovery staging without reviving the original", async () => {
  for (const status of ["PENDING", "REVIEW_REQUIRED", "CONFLICT", "APPLIED"]) {
    const f = fixture()
    await f.stage()
    row(f).status = status
    row(f).authoritativeState = {
      _offlineQuickSaleCorrection: correctionMarker(),
    }
    const before = structuredClone(row(f))
    await expect(f.stage()).rejects.toBeInstanceOf(CatalogError)
    expect(row(f)).toEqual(before)
    expect(f.state.audits).toEqual([])
    expect(f.state.effects).toBe(0)
  }
})

for (const decision of ["approve", "reject"] as const)
  for (const status of ["REVIEW_REQUIRED", "APPLIED", "DISCARDED"])
    test(`combined correction/recovery annotation refuses ${decision} of ${status} before any domain lock`, async () => {
      const f = fixture()
      await f.stage()
      row(f).status = status
      row(f).authoritativeState = {
        _offlineQuickSaleCorrection: correctionMarker(),
      }
      const before = structuredClone(row(f))
      f.calls.length = 0
      await expect(f.decide(decision)).rejects.toBeInstanceOf(CatalogError)
      expect(sqlFacts(f.calls)).toEqual([
        {
          sql: "SELECT pg_advisory_xact_lock(?::bigint)",
          values: [commandFenceValue(envelope.clientCommandId)],
        },
      ])
      expect(row(f)).toEqual(before)
      expect(f.canonicalInputs).toEqual([])
      expect(f.state.audits).toEqual([])
      expect(f.state.effects).toBe(0)
    })

test("caller mutation after the first staging await cannot retarget the captured scope or batch", async () => {
  const f = fixture()
  const submitted = structuredClone(envelope)
  const request = { ...scope, sessionId: "session-rep", commands: [submitted] }
  const before = structuredClone(submitted)
  f.afterNextSql(() => {
    request.actorUserId = "foreign-actor"
    request.tenantId = "foreign-Tenant"
    request.storeId = "foreign-Store"
    request.deviceId = "foreign-device"
    request.sessionId = "foreign-session"
    submitted.clientCommandId = "foreign-command"
    submitted.dependencyClientIds.push("foreign-dependency")
    submitted.payload.initialPayment.moneyAccountId = "foreign-account"
    const line = submitted.payload.lines[0]
    if (!line) throw Error("Expected original Quick sale line")
    line.description = "Changed caller payload"
    request.commands.push({
      ...structuredClone(envelope),
      clientCommandId: "injected-command",
    })
  })
  expect(await recoverSuspendedOfflineCommands(f.db, request)).toEqual([
    { clientCommandId: before.clientCommandId, status: "held" },
  ])
  expect(Object.keys(f.state.commands)).toEqual([before.clientCommandId])
  expect(row(f)).toMatchObject({
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    offlineDeviceId: "device-row-a",
    payloadHash: offlineCommandEnvelopeHash(before),
    payload: { ...before.payload, actorUserId: scope.actorUserId },
  })
  expect(f.calls.find((call) => call.kind === "session")?.args).toMatchObject({
    where: { id: "session-rep", userId: scope.actorUserId },
  })
})

test("caller mutation after the first decision await cannot change its author, decision, scope or sale", async () => {
  for (const decision of ["approve", "reject"] as const) {
    const f = fixture()
    await f.stage()
    const request = {
      actorUserId: "admin-a",
      tenantId: scope.tenantId,
      commandId: "command-row-a",
      decision: decision as "approve" | "reject",
      reason: "Exact original review",
      envelope: structuredClone(envelope),
    }
    f.afterNextSql(() => {
      request.actorUserId = "foreign-admin"
      request.tenantId = "foreign-Tenant"
      request.commandId = "foreign-row"
      request.decision = decision === "approve" ? "reject" : "approve"
      request.envelope.clientCommandId = "foreign-command"
      request.envelope.payload.initialPayment.moneyAccountId = "foreign-account"
    })
    expect(await decideSuspendedOfflineCommand(f.db, request)).toEqual({
      clientCommandId: envelope.clientCommandId,
      status: decision === "approve" ? "approved" : "rejected",
    })
    expect(f.state.effects).toBe(decision === "approve" ? 1 : 0)
    expect(row(f).reviewedByUserId).toBe("admin-a")
    if (decision === "approve")
      expect(f.canonicalInputs[0]).toMatchObject({
        actorUserId: scope.actorUserId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        clientOrderId: envelope.clientCommandId,
        initialPayment: { moneyAccountId: "account-original" },
      })
  }
})

test("wrong envelope fence fails before domain locks for held approval, rejection and both terminal receipts", async () => {
  for (const decision of ["approve", "reject"] as const)
    for (const status of ["REVIEW_REQUIRED", "APPLIED", "DISCARDED"]) {
      const f = fixture()
      await f.stage()
      row(f).status = status
      const before = structuredClone(row(f))
      f.calls.length = 0
      await expect(
        f.decide(decision, "admin-a", {
          ...structuredClone(envelope),
          clientCommandId: "wrong-command-key",
        }),
      ).rejects.toBeInstanceOf(CatalogError)
      expect(sqlFacts(f.calls)).toEqual([
        {
          sql: "SELECT pg_advisory_xact_lock(?::bigint)",
          values: [commandFenceValue("wrong-command-key")],
        },
      ])
      expect(f.calls.map((call) => call.kind)).toEqual([
        "begin",
        "sql",
        "command-plan/read",
        "rollback",
      ])
      expect(row(f)).toEqual(before)
      expect(f.canonicalInputs).toEqual([])
      expect(f.state.audits).toEqual([])
    }
})

test("typed failure fallback reacquires its own exact fence and refuses changed real identity before domain locks", async () => {
  const f = fixture()
  await f.stage()
  f.calls.length = 0
  f.failCanonical(new FinanceError("CONFLICT", "Account changed"))
  let changed = false
  f.onRollback(() => {
    if (changed) return
    changed = true
    row(f).clientCommandId = "changed-real-command"
  })
  await expect(f.decide()).rejects.toBeInstanceOf(CatalogError)
  let fallbackStart = 0
  f.calls.forEach((call, index) => {
    if (call.kind === "begin") fallbackStart = index
  })
  const fallback = f.calls.slice(fallbackStart)
  expect(fallback.map((call) => call.kind)).toEqual([
    "begin",
    "sql",
    "command-plan/read",
    "rollback",
  ])
  expect(sqlFacts(fallback)).toEqual([
    {
      sql: "SELECT pg_advisory_xact_lock(?::bigint)",
      values: [commandFenceValue(envelope.clientCommandId)],
    },
  ])
  expect(f.state.effects).toBe(0)
  expect(f.state.audits).toEqual([])
  expect(f.canonicalInputs).toHaveLength(1)
})

test("staging clears stale ordinary attempt ownership; applied and rejected recovery never retain a server attempt", async () => {
  for (const decision of ["approve", "reject"] as const) {
    const f = fixture()
    await f.stage()
    const { _offlineRecovery: _marker, ...ordinaryPayload } = row(f).payload
    row(f).payload = ordinaryPayload
    row(f).status = "PENDING"
    row(f).attemptedState = {
      _offlineAttempt: { id: "retired-attempt", kind: "replay" },
    }
    await f.stage()
    expect(row(f).attemptedState).toBe(Prisma.JsonNull)
    row(f).attemptedState = {
      _offlineAttempt: { id: "later-retired-attempt", kind: "approve" },
    }
    await f.decide(decision)
    expect(row(f).attemptedState).toBe(Prisma.JsonNull)
    expect(row(f).status).toBe(decision === "approve" ? "APPLIED" : "DISCARDED")
    expect(row(f).payloadHash).toBe(offlineCommandEnvelopeHash(envelope))
  }
})

for (const appears of [false, true])
  test(`previously absent FinanceBook ${appears ? "appearing at Tenant lock refuses before principal locks" : "remaining absent permits unpaid recovery"}`, async () => {
    const f = fixture()
    const { initialPayment: _payment, ...payload } = structuredClone(
      envelope.payload,
    )
    const unpaid = { ...structuredClone(envelope), payload }
    await recoverSuspendedOfflineCommands(f.db, {
      ...scope,
      sessionId: "session-rep",
      commands: [unpaid],
    })
    f.state.bookPresent = false
    if (appears)
      f.atTenantLock(() => {
        f.state.bookPresent = true
      })
    f.calls.length = 0
    const pending = decideSuspendedOfflineCommand(f.db, {
      actorUserId: "admin-a",
      tenantId: scope.tenantId,
      commandId: "command-row-a",
      decision: "approve",
      reason: "Reviewed unpaid original",
      envelope: unpaid,
    })
    if (appears) await expect(pending).rejects.toBeInstanceOf(CatalogError)
    else expect(await pending).toMatchObject({ status: "approved" })
    const sql = sqlFacts(f.calls)
    expect(sql[1]?.sql).toContain('FROM "FinanceBook"')
    expect(sql[1]?.sql).toContain("FOR UPDATE")
    expect(sql[2]?.sql).toContain('FROM "Tenant"')
    expect(sql[3]?.sql).toContain('FROM "FinanceBook"')
    expect(sql[3]?.sql).not.toContain("FOR UPDATE")
    expect(sql[3]?.values).toEqual([scope.tenantId, "NGN"])
    if (appears) {
      expect(sql).toHaveLength(4)
      expect(f.canonicalInputs).toEqual([])
      expect(f.state.effects).toBe(0)
      expect(f.state.audits).toEqual([])
      expect(row(f).status).toBe("REVIEW_REQUIRED")
    } else {
      expect(f.canonicalInputs).toHaveLength(1)
      expect(f.canonicalInputs[0]).not.toHaveProperty("initialPayment")
      expect(f.state.effects).toBe(1)
      expect(f.state.audits).toHaveLength(1)
    }
  })

for (const operation of ["intake", "approval"] as const) {
  test(`${operation} reuses locked Tenant metadata and Device without unlocked rereads`, async () => {
    const f = fixture()
    if (operation === "approval") await f.stage()
    f.calls.length = 0
    f.forbidUnlockedDeviceReads()
    if (operation === "intake")
      expect(await f.stage()).toEqual([
        { clientCommandId: envelope.clientCommandId, status: "held" },
      ])
    else
      expect(await f.decide()).toEqual({
        clientCommandId: envelope.clientCommandId,
        status: "approved",
      })
    const tenantIndex = f.calls.findIndex(
      (call) =>
        call.kind === "sql" &&
        (call.args as { sql: string }).sql.includes('FROM "Tenant"'),
    )
    const deviceIndex = f.calls.findIndex(
      (call) =>
        call.kind === "sql" &&
        (call.args as { sql: string }).sql.includes('FROM "OfflineDevice"') &&
        (call.args as { sql: string }).sql.includes("FOR UPDATE"),
    )
    const revocationIndex = f.calls.findIndex(
      (call) => call.kind === "revocation",
    )
    expect(tenantIndex).toBeGreaterThanOrEqual(0)
    expect(deviceIndex).toBeGreaterThan(tenantIndex)
    expect(revocationIndex).toBeGreaterThan(deviceIndex)
    expect((f.calls[tenantIndex]?.args as { sql: string }).sql).toContain(
      '"metadata"',
    )
    expect(f.calls.filter((call) => call.kind === "revocation")).toHaveLength(1)
    expect(
      f.calls.some(
        (call) => call.kind === "device" || call.kind === "tenant-metadata",
      ),
    ).toBe(false)
  })
}

for (const denial of [
  "missing",
  "foreign-owner",
  "foreign-Store",
  "revoked-status",
  "suspended-status",
  "durable-tombstone",
  "legacy-tombstone",
] as const) {
  test(`locked device proof still refuses ${denial} without unlocked rereads`, async () => {
    const f = fixture()
    f.forbidUnlockedDeviceReads()
    if (denial === "missing") f.state.devicePresent = false
    if (denial === "foreign-owner")
      f.state.device.registeredByUserId = "foreign-actor"
    if (denial === "foreign-Store") f.state.device.storeId = "foreign-store"
    if (denial === "revoked-status") f.state.device.status = "REVOKED"
    if (denial === "suspended-status") f.state.device.status = "SUSPENDED"
    if (denial === "durable-tombstone") f.state.revocation = true
    if (denial === "legacy-tombstone") f.state.metadataRevoked = true
    const pending = f.stage()
    if (denial === "revoked-status" || denial.endsWith("tombstone")) {
      await expect(pending).rejects.toBeInstanceOf(RetailOpsOfflineDeviceError)
      await expect(pending).rejects.toMatchObject({ code: "DEVICE_REVOKED" })
    } else await expect(pending).rejects.toBeInstanceOf(CatalogError)
    expect(f.state.effects).toBe(0)
    expect(f.state.commands).toEqual({})
    expect(f.state.audits).toEqual([])
    if (denial.endsWith("tombstone"))
      expect(f.state.device.status).toBe("ACTIVE")
  })
}

test("approval checks a fresh durable tombstone after acquiring its ACTIVE device lock", async () => {
  const f = fixture()
  await f.stage()
  f.calls.length = 0
  f.forbidUnlockedDeviceReads()
  f.atDeviceLock(() => {
    f.state.revocation = true
  })
  const pending = f.decide()
  await expect(pending).rejects.toBeInstanceOf(RetailOpsOfflineDeviceError)
  await expect(pending).rejects.toMatchObject({ code: "DEVICE_REVOKED" })
  expect(f.state.device.status).toBe("ACTIVE")
  const deviceIndex = f.calls.findIndex(
    (call) =>
      call.kind === "sql" &&
      (call.args as { sql: string }).sql.includes('FROM "OfflineDevice"') &&
      (call.args as { sql: string }).sql.includes("FOR UPDATE"),
  )
  expect(deviceIndex).toBeGreaterThanOrEqual(0)
  expect(
    f.calls.findIndex((call) => call.kind === "revocation"),
  ).toBeGreaterThan(deviceIndex)
  expect(f.state.effects).toBe(0)
  expect(row(f).status).toBe("REVIEW_REQUIRED")
  expect(f.state.audits).toEqual([])
})
