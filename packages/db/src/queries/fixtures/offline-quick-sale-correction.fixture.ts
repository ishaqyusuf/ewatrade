import { expect, mock, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { CatalogError } from "../catalog-errors"
import type { CreateCommercialOrderInput } from "../commercial-orders"

// Child process only. Execute the real correction, policy, staff/device guards,
// fence, pure transformation and hash helpers; intercept DB/canonical ports.
const denyNetwork = () => {
  throw Error("Network forbidden in correction fixture")
}
globalThis.fetch = Object.assign(async () => denyNetwork(), {
  preconnect: denyNetwork,
})
const canonicalOwners = new WeakMap<
  object,
  (input: CreateCommercialOrderInput) => unknown
>()
mock.module(
  new URL("../commercial-orders.ts", import.meta.url).pathname,
  () => ({
    createCommercialOrderInTransaction: (
      tx: Prisma.TransactionClient,
      input: CreateCommercialOrderInput,
    ) => {
      const owner = canonicalOwners.get(tx)
      if (!owner) throw Error("Canonical call escaped correction transaction")
      return owner(input)
    },
  }),
)
const { correctBlankQuickSale } = await import(
  "../offline-quick-sale-correction"
)
const { deriveBlankQuickSaleReplacement } = await import(
  "../offline-quick-sale-correction-input"
)
const { offlineCommandEnvelopeHash } = await import("../offline-commands")
const { readOfflineQuickSaleCorrectionRecord } = await import(
  "../offline-quick-sale-correction-record"
)
const scope = {
  actorUserId: "rep-original",
  tenantId: "tenant-original",
  storeId: "store-original",
  deviceId: "device-original",
}
function request() {
  return {
    ...scope,
    replacementClientCommandId: "replacement-command",
    replacementClientPaymentId: "replacement-payment",
    descriptions: [{ lineIndex: 0, description: " Rice sold " }],
    envelope: {
      clientCommandId: "original-command",
      createdAtClient: new Date("2026-10-17T06:00:00.000Z"),
      dependencyClientIds: ["original-dependency"],
      eventVersion: 1,
      payload: {
        kind: "commercial_order" as const,
        customerName: "Original customer",
        notes: "Original notes",
        fulfillNow: true,
        discountMinor: 5,
        taxMinor: 10,
        deliveryDueAt: new Date("2026-10-17T06:00:00.000Z"),
        lines: [
          {
            custom: "quick_sale" as const,
            amountMinor: 1500,
            description: "  ",
          },
          { custom: "additional_cost" as const, amountMinor: 100 },
        ],
        initialPayment: {
          amountMinor: 1000,
          method: "cash" as const,
          clientPaymentId: "original-payment",
          moneyAccountId: "original-account",
        },
      },
    },
  }
}
type Row = {
  id: string
  tenantId: string
  storeId: string
  offlineDeviceId: string
  clientCommandId: string
  payloadHash: string
  payload: Record<string, unknown>
  status: string
  result: unknown
  authoritativeState: unknown
  attemptedState: unknown
  createdAtClient: Date
  dependencyClientIds: string[]
  eventVersion: number
  [key: string]: unknown
}
const recoveryMarker = {
  version: 1,
  kind: "suspended_staff",
  membershipId: "membership-original",
  accessRevision: 3,
  accessChangedAt: "2026-10-17T07:00:00.000Z",
  lifecycleEventId: "suspension-original",
  receivedAt: "2026-10-17T08:00:00.000Z",
}
function savedRow(input = request(), replacement = false): Row {
  const envelope = replacement
    ? deriveBlankQuickSaleReplacement(input.envelope, input)
    : input.envelope
  return {
    id: replacement ? "replacement-row" : "original-row",
    ...scope,
    offlineDeviceId: "device-row-original",
    clientCommandId: envelope.clientCommandId,
    payloadHash: offlineCommandEnvelopeHash(envelope),
    payload: JSON.parse(
      JSON.stringify({ ...envelope.payload, actorUserId: scope.actorUserId }),
    ),
    createdAtClient: new Date(envelope.createdAtClient),
    dependencyClientIds: [...envelope.dependencyClientIds],
    eventVersion: envelope.eventVersion,
    status: "PENDING",
    result: null,
    authoritativeState: null,
    attemptedState: null,
  }
}

function fixture() {
  let state = {
    tenantActive: true,
    purge: false,
    storeActive: true,
    enabled: true,
    approvalRequired: false,
    tenantUpdatedAt: new Date("2026-10-17T01:00:00.000Z"),
    sequence: 5,
    membership: {
      role: "CASHIER",
      status: "ACTIVE",
      staffAccessMode: "LEGACY",
      isActive: true,
    },
    device: {
      id: "device-row-original",
      ...scope,
      registeredByUserId: scope.actorUserId,
      status: "ACTIVE",
    },
    durableRevoked: false,
    metadataRevoked: false,
    commands: {} as Record<string, Row>,
    orders: {} as Record<string, { id: string; result: unknown }>,
    payments: [] as string[],
    audits: [] as unknown[],
    priorReviews: 0,
    descendants: false,
  }
  const calls: Array<{ kind: string; args: unknown }> = []
  const canonicalInputs: CreateCommercialOrderInput[] = []
  let failure: { at: string; error: Error } | null = null
  let canonicalFailure: Error | null = null
  let firstSql: (() => void) | undefined
  let afterVersion: (() => void) | undefined
  const record = (kind: string, args: unknown) =>
    calls.push({ kind, args: structuredClone(args) })
  const fail = (at: string) => {
    if (failure?.at === at) throw failure.error
  }
  const applyData = (data: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value === Prisma.JsonNull ? null : structuredClone(value),
      ]),
    )
  function commandFor(where: Prisma.OfflineCommandWhereUniqueInput) {
    const key = where.tenantId_clientCommandId
    if (key?.tenantId === scope.tenantId)
      return state.commands[key.clientCommandId] ?? null
    if (where.id)
      return (
        Object.values(state.commands).find((row) => row.id === where.id) ?? null
      )
    return null
  }
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim()
    record("sql", { text, values })
    const callback = firstSql
    firstSql = undefined
    callback?.()
    if (text.startsWith('UPDATE "Tenant"')) {
      if (values[0] !== scope.tenantId)
        throw Error("Foreign Tenant version update")
      fail("version-update")
      state.tenantUpdatedAt = new Date(state.tenantUpdatedAt.getTime() + 1)
      afterVersion?.()
      return 1
    }
    if (text.includes('FROM "Tenant"'))
      return values[0] === scope.tenantId && state.tenantActive && !state.purge
        ? [{ id: scope.tenantId }]
        : []
    if (text.includes('FROM "Membership"'))
      return values[0] === scope.tenantId && values[1] === scope.actorUserId
        ? [structuredClone(state.membership)]
        : []
    if (text.includes('FROM "Store"'))
      return values[0] === scope.storeId &&
        values[1] === scope.tenantId &&
        state.storeActive
        ? [{ id: scope.storeId }]
        : []
    if (text.includes('FROM "OfflineDevice"'))
      return values[0] === state.device.tenantId &&
        values[1] === state.device.storeId &&
        values[2] === state.device.deviceId &&
        values[3] === state.device.registeredByUserId &&
        state.device.status === "ACTIVE"
        ? [{ id: state.device.id }]
        : []
    if (text.includes("pg_advisory_xact_lock")) return 0
    throw Error(`Unexpected correction SQL: ${text}`)
  }
  const ports = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes("pg_advisory_xact_lock"))
        throw Error("Void advisory lock must use executeRaw")
      return sql(strings, ...values)
    },
    $executeRaw: sql,
    membership: {
      findUniqueOrThrow: async (
        args: Prisma.MembershipFindUniqueOrThrowArgs,
      ) => {
        record("membership", args)
        const key = args.where.tenantId_userId
        if (
          key?.tenantId !== scope.tenantId ||
          key.userId !== scope.actorUserId
        )
          throw Error("Foreign membership read")
        return { role: state.membership.role }
      },
    },
    tenant: {
      findUnique: async (args: Prisma.TenantFindUniqueArgs) => {
        record("policy", args)
        return args.where.id === scope.tenantId
          ? {
              metadata: {
                offlineOperationsEnabled: state.enabled,
                offlineApprovalRequired: state.approvalRequired,
              },
              updatedAt: new Date(state.tenantUpdatedAt),
            }
          : null
      },
      findFirstOrThrow: async (args: unknown) => {
        record("metadata", args)
        return {
          metadata: state.metadataRevoked
            ? {
                retailOps: {
                  revokedOfflineDevices: [
                    {
                      actorUserId: scope.actorUserId,
                      deviceId: scope.deviceId,
                      registeredAt: "2026-10-16T00:00:00Z",
                      lastSeenAt: "2026-10-16T01:00:00Z",
                      revokedAt: "2026-10-17T07:00:00Z",
                      revokedByUserId: "admin-original",
                      platform: "android",
                      storeId: scope.storeId,
                    },
                  ],
                },
              }
            : {},
        }
      },
    },
    offlineDevice: {
      findUnique: async (args: Prisma.OfflineDeviceFindUniqueArgs) => {
        record("device-status", args)
        return args.where.tenantId_deviceId?.tenantId ===
          state.device.tenantId &&
          args.where.tenantId_deviceId.deviceId === state.device.deviceId
          ? { status: state.device.status }
          : null
      },
    },
    offlineDeviceRevocation: {
      findFirst: async (args: unknown) => {
        record("revocation", args)
        return state.durableRevoked ? { id: "revocation-original" } : null
      },
    },
    offlineCommand: {
      findUnique: async (args: Prisma.OfflineCommandFindUniqueArgs) => {
        record("command-read", args)
        return structuredClone(commandFor(args.where))
      },
      findFirst: async (args: Prisma.OfflineCommandFindFirstArgs) => {
        record("descendant", args)
        return state.descendants ? { id: "descendant-original" } : null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        record("command-create", data)
        const identity = data.clientCommandId
        if (typeof identity !== "string")
          throw Error("Missing command identity")
        fail(
          identity === "original-command"
            ? "retirement-write"
            : "replacement-create",
        )
        if (state.commands[identity]) throw Error("Duplicate command identity")
        const stored: Record<string, unknown> = {
          id:
            identity === "original-command"
              ? "original-row"
              : "replacement-row",
          result: null,
          authoritativeState: null,
          attemptedState: null,
          conflictCode: null,
          ...applyData(data),
        }
        const row = stored as Row
        state.commands[identity] = row
        return structuredClone(row)
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        record("command-update", { where, data })
        if (data.status === "DISCARDED") fail("retirement-write")
        const row = Object.values(state.commands).find(
          (candidate) => candidate.id === where.id,
        )
        if (!row) throw Error("Missing command update target")
        Object.assign(row, applyData(data))
        return structuredClone(row)
      },
    },
    commercialOrder: {
      findUnique: async (args: Prisma.CommercialOrderFindUniqueArgs) => {
        record("order-read", args)
        const key = args.where.tenantId_clientOrderId
        return key?.tenantId === scope.tenantId
          ? structuredClone(state.orders[key.clientOrderId] ?? null)
          : null
      },
    },
    commercialOrderPayment: {
      findUnique: async (args: Prisma.CommercialOrderPaymentFindUniqueArgs) => {
        record("payment-read", args)
        const key = args.where.tenantId_clientPaymentId
        return key?.tenantId === scope.tenantId &&
          state.payments.includes(key.clientPaymentId)
          ? { id: "used-payment" }
          : null
      },
    },
    offlineConflictReview: {
      count: async (args: unknown) => {
        record("review-count", args)
        return state.priorReviews
      },
      create: async (args: unknown) => {
        record("audit", args)
        fail("audit")
        state.audits.push(structuredClone(args))
        return { id: "correction-audit" }
      },
    },
  }
  const db = {
    $transaction: async (
      fn: (tx: typeof ports) => Promise<unknown>,
      options: unknown,
    ) => {
      record("begin", options)
      const before = structuredClone(state)
      const tx = new Proxy(ports, {})
      canonicalOwners.set(tx, (input) => {
        record("canonical", input)
        canonicalInputs.push(structuredClone(input))
        if (canonicalFailure) throw canonicalFailure
        const order = state.orders[input.clientOrderId]
        if (!order)
          throw Error("Forbidden canonical creation for absent original Order")
        return structuredClone(order.result)
      })
      try {
        const result = await fn(tx)
        record("commit", {})
        return result
      } catch (error) {
        state = before
        record("rollback", {})
        throw error
      }
    },
  } as unknown as PrismaClient
  return {
    db,
    calls,
    canonicalInputs,
    get state() {
      return state
    },
    seed: (row = savedRow()) => {
      state.commands[row.clientCommandId] = row
      return row
    },
    run: (input = request()) => correctBlankQuickSale(db, input),
    fail: (at: string, error: Error) => {
      failure = { at, error }
    },
    canonicalFail: (error: Error) => {
      canonicalFailure = error
    },
    firstSql: (callback: () => void) => {
      firstSql = callback
    },
    afterVersion: (callback: () => void) => {
      afterVersion = callback
    },
  }
}
type Fixture = ReturnType<typeof fixture>
function old(f: Fixture) {
  const row = f.state.commands["original-command"]
  if (!row) throw Error("Expected original row")
  return row
}
function next(f: Fixture) {
  const row = f.state.commands["replacement-command"]
  if (!row) throw Error("Expected replacement row")
  return row
}

for (const staged of [false, true])
  test(`description correction atomically retires ${staged ? "staged" : "absent"} original and creates one exact pair/audit without canonical effects`, async () => {
    const f = fixture()
    if (staged) f.seed()
    const input = request()
    const before = structuredClone(input)
    const originalHash = offlineCommandEnvelopeHash(input.envelope)
    const expected = deriveBlankQuickSaleReplacement(input.envelope, input)
    const result = await f.run(input)
    expect(result).toMatchObject({
      outcome: "replaced",
      originalClientCommandId: input.envelope.clientCommandId,
      originalPayloadHash: originalHash,
      replacement: {
        envelope: expected,
        payloadHash: offlineCommandEnvelopeHash(expected),
        status: "PENDING",
        recoveryHeld: false,
        result: null,
      },
    })
    expect(Object.keys(f.state.commands).sort()).toEqual([
      "original-command",
      "replacement-command",
    ])
    expect(old(f)).toMatchObject({
      status: "DISCARDED",
      payloadHash: originalHash,
      payload: {
        actorUserId: scope.actorUserId,
        initialPayment: input.envelope.payload.initialPayment,
      },
    })
    expect(
      readOfflineQuickSaleCorrectionRecord(old(f).authoritativeState),
    ).toMatchObject({
      originalPayloadHash: originalHash,
      replacementPayloadHash: next(f).payloadHash,
      replacedByUserId: scope.actorUserId,
    })
    expect(next(f)).toMatchObject({
      payloadHash: offlineCommandEnvelopeHash(expected),
      payload: {
        ...JSON.parse(JSON.stringify(expected.payload)),
        actorUserId: scope.actorUserId,
      },
    })
    expect(f.state.sequence).toBe(5)
    expect(f.state.tenantUpdatedAt.getTime()).toBe(
      new Date("2026-10-17T01:00:00.000Z").getTime() + 1,
    )
    expect(f.state.audits).toHaveLength(1)
    expect(f.state.audits[0]).toMatchObject({
      data: {
        commandId: "original-row",
        decision: "DISCARD",
        reviewedByUserId: scope.actorUserId,
        dependentClientIds: [],
      },
    })
    expect(f.canonicalInputs).toEqual([])
    expect(input).toEqual(before)
    expect(f.calls[0]).toEqual({
      kind: "begin",
      args: { maxWait: 10000, timeout: 30000, isolationLevel: "ReadCommitted" },
    })
  })

test("exact retry returns the original link with no new audit, counters or Tenant tuple version", async () => {
  const f = fixture()
  const first = await f.run()
  const before = structuredClone(f.state)
  f.calls.length = 0
  expect(await f.run()).toEqual(first)
  expect(f.state).toEqual(before)
  expect(
    f.calls.some((call) =>
      ["command-create", "command-update", "audit", "canonical"].includes(
        call.kind,
      ),
    ),
  ).toBe(false)
  expect(
    f.calls.some(
      (call) =>
        call.kind === "sql" &&
        String(Reflect.get(Object(call.args), "text")).startsWith("UPDATE"),
    ),
  ).toBe(false)
})

for (const status of ["REVIEW_REQUIRED", "BLOCKED"])
  test(`prior ${status} holds persist on the replacement`, async () => {
    const f = fixture()
    f.seed().status = status
    await f.run()
    expect(next(f).status).toBe("REVIEW_REQUIRED")
  })
test("historical management review holds even a currently PENDING original", async () => {
  const f = fixture()
  f.seed()
  f.state.priorReviews = 1
  await f.run()
  expect(next(f).status).toBe("REVIEW_REQUIRED")
})
for (const role of ["CASHIER", "OPERATOR", "OWNER", "ADMIN", "MANAGER"])
  test(`current approval policy uses fresh ${role} authority`, async () => {
    const f = fixture()
    f.state.membership.role = role
    f.state.approvalRequired = true
    await f.run()
    expect(next(f).status).toBe(
      ["OWNER", "ADMIN", "MANAGER"].includes(role)
        ? "PENDING"
        : "REVIEW_REQUIRED",
    )
  })
test("disabled policy refuses new replacement but permits exact existing-link reconciliation", async () => {
  const f = fixture()
  f.state.enabled = false
  const before = structuredClone(f.state)
  await expect(f.run()).rejects.toBeInstanceOf(CatalogError)
  expect(f.state).toEqual(before)
  f.state.enabled = true
  const first = await f.run()
  f.state.enabled = false
  const linked = structuredClone(f.state)
  expect(await f.run()).toEqual(first)
  expect(f.state).toEqual(linked)
})

for (const staged of [false, true])
  test(`lost canonical result reconciles only historical original (${staged ? "staged" : "absent"} command)`, async () => {
    const f = fixture()
    if (staged) f.seed()
    const input = request()
    const historical = {
      id: "historical-order",
      orderNumber: "ORD-001",
      amountPaidMinor: 1000,
    }
    f.state.orders["original-command"] = {
      id: historical.id,
      result: historical,
    }
    f.state.enabled = false
    const tuple = new Date(f.state.tenantUpdatedAt)
    const actual: unknown = await f.run(input)
    expect(actual).toEqual({
      outcome: "already_applied",
      originalClientCommandId: "original-command",
      result: historical,
    })
    expect(f.canonicalInputs).toEqual([
      {
        ...input.envelope.payload,
        actorUserId: scope.actorUserId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        schemaVersion: 1,
        clientOrderId: input.envelope.clientCommandId,
      },
    ])
    expect(Object.keys(f.state.commands)).toEqual(["original-command"])
    expect(old(f)).toMatchObject({
      status: "APPLIED",
      payloadHash: offlineCommandEnvelopeHash(input.envelope),
      result: historical,
      authoritativeState: null,
      attemptedState: null,
    })
    expect(f.state.audits).toEqual([])
    expect(f.state.tenantUpdatedAt).toEqual(tuple)
  })
test("historical canonical idempotency refusal rolls back and cannot stage a replacement", async () => {
  const f = fixture()
  f.state.orders["original-command"] = { id: "historical-order", result: {} }
  const error = new CatalogError(
    "IDEMPOTENCY_MISMATCH",
    "Historical immutable digest differs",
  )
  f.canonicalFail(error)
  const before = structuredClone(f.state)
  await expect(f.run()).rejects.toBe(error)
  expect(f.state).toEqual(before)
  expect(f.canonicalInputs).toHaveLength(1)
})
for (const fact of ["APPLIED", "DISCARDED", "result"])
  test(`missing canonical Order with ${fact} original proof cannot be recreated or replaced`, async () => {
    const f = fixture()
    const row = f.seed()
    if (fact === "result") row.result = { id: "lost-order" }
    else row.status = fact
    const before = structuredClone(f.state)
    await expect(f.run()).rejects.toBeInstanceOf(CatalogError)
    expect(f.state).toEqual(before)
    expect(f.canonicalInputs).toEqual([])
  })

for (const denial of [
  "actor",
  "Tenant",
  "Store",
  "device",
  "suspended",
  "scoped",
  "inactive-Tenant",
  "purge",
  "inactive-Store",
  "device-owner",
  "device-Store",
  "device-revoked",
  "durable-revocation",
  "metadata-revocation",
] as const)
  test(`fresh origin refuses ${denial} with no changes`, async () => {
    const f = fixture()
    const input = request()
    if (denial === "actor") input.actorUserId = "foreign-actor"
    if (denial === "Tenant") input.tenantId = "foreign-Tenant"
    if (denial === "Store") input.storeId = "foreign-Store"
    if (denial === "device") input.deviceId = "foreign-device"
    if (denial === "suspended") f.state.membership.status = "SUSPENDED"
    if (denial === "scoped") f.state.membership.staffAccessMode = "SCOPED"
    if (denial === "inactive-Tenant") f.state.tenantActive = false
    if (denial === "purge") f.state.purge = true
    if (denial === "inactive-Store") f.state.storeActive = false
    if (denial === "device-owner")
      f.state.device.registeredByUserId = "foreign-owner"
    if (denial === "device-Store") f.state.device.storeId = "foreign-Store"
    if (denial === "device-revoked") f.state.device.status = "REVOKED"
    if (denial === "durable-revocation") f.state.durableRevoked = true
    if (denial === "metadata-revocation") f.state.metadataRevoked = true
    const before = structuredClone(f.state)
    await expect(f.run(input)).rejects.toBeInstanceOf(Error)
    expect(f.state).toEqual(before)
    expect(f.canonicalInputs).toEqual([])
  })

for (const denial of [
  "author",
  "Tenant",
  "Store",
  "device",
  "hash",
  "payload",
  "date",
  "dependencies",
  "recovery",
] as const)
  test(`stored original ${denial} cannot be forged or transferred`, async () => {
    const f = fixture()
    const row = f.seed()
    if (denial === "author") row.payload.actorUserId = "foreign-author"
    if (denial === "Tenant") row.tenantId = "foreign-Tenant"
    if (denial === "Store") row.storeId = "foreign-Store"
    if (denial === "device") row.offlineDeviceId = "foreign-device-row"
    if (denial === "hash") row.payloadHash = "c".repeat(64)
    if (denial === "payload") row.payload.notes = "Changed stored notes"
    if (denial === "date") row.createdAtClient = new Date("2026-10-18")
    if (denial === "dependencies")
      row.dependencyClientIds = ["foreign-dependency"]
    if (denial === "recovery") row.payload._offlineRecovery = recoveryMarker
    const before = structuredClone(f.state)
    await expect(f.run()).rejects.toBeInstanceOf(CatalogError)
    expect(f.state).toEqual(before)
    expect(f.canonicalInputs).toEqual([])
  })

test("public envelopes cannot contain forged author or reserved server metadata", async () => {
  for (const field of [
    "actorUserId",
    "_offlineRecovery",
    "_offlineQuickSaleCorrection",
    "_offlineAttempt",
    "_offlineUnknown",
  ]) {
    const f = fixture()
    const input = request()
    Reflect.set(input.envelope.payload, field, "forged")
    await expect(f.run(input)).rejects.toBeInstanceOf(CatalogError)
    expect(f.calls).toEqual([])
  }
})
for (const collision of [
  "replacement-command",
  "replacement-order",
  "original-payment",
  "replacement-payment",
  "descendant",
] as const)
  test(`existing ${collision} refuses before replacement or retirement`, async () => {
    const f = fixture()
    if (collision === "replacement-command") f.seed(savedRow(request(), true))
    if (collision === "replacement-order")
      f.state.orders["replacement-command"] = { id: "already-used", result: {} }
    if (collision === "original-payment" || collision === "replacement-payment")
      f.state.payments.push(collision)
    if (collision === "descendant") f.state.descendants = true
    const before = structuredClone(f.state)
    await expect(f.run()).rejects.toBeInstanceOf(CatalogError)
    expect(f.state).toEqual(before)
    expect(f.canonicalInputs).toEqual([])
    expect(
      f.calls.some((call) =>
        ["command-create", "command-update", "audit"].includes(call.kind),
      ),
    ).toBe(false)
  })
test("competing different proposal for one original cannot replace its established link", async () => {
  const f = fixture()
  await f.run()
  const before = structuredClone(f.state)
  const changed = request()
  changed.replacementClientCommandId = "other-replacement-command"
  changed.replacementClientPaymentId = "other-replacement-payment"
  await expect(f.run(changed)).rejects.toMatchObject({
    code: "IDEMPOTENCY_MISMATCH",
  })
  expect(f.state).toEqual(before)
})

for (const staged of [false, true])
  for (const at of [
    "replacement-create",
    "retirement-write",
    "audit",
    "version-update",
  ])
    test(`${at} failure rolls back the entire ${staged ? "staged" : "absent"} original pair and tuple change`, async () => {
      const f = fixture()
      if (staged) f.seed()
      const error = Error(`Fixture ${at} unavailable`)
      const before = structuredClone(f.state)
      f.fail(at, error)
      await expect(f.run()).rejects.toBe(error)
      expect(f.state).toEqual(before)
      expect(f.canonicalInputs).toEqual([])
    })
test("the post-version original Order absence read is fresh and can still refuse without effects", async () => {
  const f = fixture()
  f.afterVersion(() => {
    f.state.orders["original-command"] = { id: "unexpected-order", result: {} }
  })
  await expect(f.run()).rejects.toBeInstanceOf(CatalogError)
  expect(f.state.commands).toEqual({})
  expect(f.state.audits).toEqual([])
  expect(f.canonicalInputs).toEqual([])
  const ordered = f.calls.map((call) =>
    call.kind === "sql"
      ? String(Reflect.get(Object(call.args), "text"))
      : call.kind,
  )
  const version = ordered.findIndex((item) =>
    item.startsWith('UPDATE "Tenant"'),
  )
  expect(ordered[version + 1]).toBe("order-read")
})
test("first-await caller mutations cannot change either fence, saved facts or original ownership", async () => {
  const f = fixture()
  const input = request()
  const before = structuredClone(input)
  f.firstSql(() => {
    input.actorUserId = "foreign-actor"
    input.tenantId = "foreign-Tenant"
    input.storeId = "foreign-Store"
    input.deviceId = "foreign-device"
    input.replacementClientCommandId = "foreign-command"
    input.replacementClientPaymentId = "foreign-payment"
    input.envelope.createdAtClient.setUTCFullYear(2030)
    input.envelope.payload.initialPayment.moneyAccountId = "foreign-account"
    input.descriptions[0] = {
      lineIndex: 1,
      description: "Forbidden Additional cost edit",
    }
    input.envelope.dependencyClientIds.push("foreign-dependency")
  })
  const result = await f.run(input)
  expect(result).toMatchObject({
    outcome: "replaced",
    replacement: {
      envelope: deriveBlankQuickSaleReplacement(before.envelope, before),
    },
  })
  expect(old(f).payloadHash).toBe(offlineCommandEnvelopeHash(before.envelope))
  expect(next(f).payload).toMatchObject({
    actorUserId: scope.actorUserId,
    initialPayment: { moneyAccountId: "original-account" },
  })
})

for (const malformed of [
  "missing-next",
  "malformed-record",
  "wrong-link",
  "wrong-link-hash",
  "wrong-original-status",
  "next-author",
  "next-Tenant",
  "next-Store",
  "next-device",
  "next-digest",
  "next-facts",
] as const)
  test(`partial or inconsistent ${malformed} correction link fails closed`, async () => {
    const f = fixture()
    await f.run()
    const record = readOfflineQuickSaleCorrectionRecord(
      old(f).authoritativeState,
    )
    if (!record) throw Error("Expected correction record")
    if (malformed === "missing-next")
      f.state.commands = { "original-command": old(f) }
    if (malformed === "malformed-record")
      old(f).authoritativeState = { _offlineQuickSaleCorrection: null }
    if (malformed === "wrong-link")
      old(f).authoritativeState = {
        _offlineQuickSaleCorrection: {
          ...record,
          replacementClientCommandId: "foreign-command",
        },
      }
    if (malformed === "wrong-link-hash")
      old(f).authoritativeState = {
        _offlineQuickSaleCorrection: {
          ...record,
          replacementPayloadHash: "c".repeat(64),
        },
      }
    if (malformed === "wrong-original-status") old(f).status = "PENDING"
    if (malformed === "next-author")
      next(f).payload.actorUserId = "foreign-author"
    if (malformed === "next-Tenant") next(f).tenantId = "foreign-Tenant"
    if (malformed === "next-Store") next(f).storeId = "foreign-Store"
    if (malformed === "next-device") next(f).offlineDeviceId = "foreign-device"
    if (malformed === "next-digest") next(f).payloadHash = "c".repeat(64)
    if (malformed === "next-facts")
      next(f).payload.notes = "Changed linked facts"
    const before = structuredClone(f.state)
    await expect(f.run()).rejects.toBeInstanceOf(CatalogError)
    expect(f.state).toEqual(before)
    expect(f.canonicalInputs).toEqual([])
  })
test("linked replacement moved into suspended recovery stays held and never exposes canonical receipt", async () => {
  const f = fixture()
  await f.run()
  next(f).status = "REVIEW_REQUIRED"
  next(f).payload._offlineRecovery = recoveryMarker
  next(f).result = { id: "private-order", orderNumber: "PRIVATE-RECEIPT" }
  const before = structuredClone(f.state)
  expect(await f.run()).toMatchObject({
    outcome: "replaced",
    replacement: {
      status: "REVIEW_REQUIRED",
      recoveryHeld: true,
      result: null,
    },
  })
  expect(f.state).toEqual(before)
  expect(f.canonicalInputs).toEqual([])
})

test("complete old/new fences precede exact Tenant, membership, Store, device and version/absence proof", async () => {
  const f = fixture()
  await f.run()
  const statements = f.calls
    .filter((call) => call.kind === "sql")
    .map((call) => ({
      text: String(Reflect.get(Object(call.args), "text")),
      values: Reflect.get(Object(call.args), "values"),
    }))
  for (const statement of statements.slice(0, 2)) {
    expect(statement.text).toBe("SELECT pg_advisory_xact_lock(?::bigint)")
    expect(
      Array.isArray(statement.values) &&
        typeof statement.values[0] === "bigint",
    ).toBe(true)
  }
  expect(statements[2]?.text).toContain('"qaPurgeStartedAt" IS NULL FOR UPDATE')
  expect(statements[2]?.values).toEqual([scope.tenantId])
  const membership = statements.find((entry) =>
    entry.text.includes('FROM "Membership"'),
  )
  expect(membership?.values).toEqual([scope.tenantId, scope.actorUserId])
  expect(membership?.text).toContain("FOR SHARE OF m")
  const store = statements.find((entry) => entry.text.includes('FROM "Store"'))
  expect(store?.values).toEqual([scope.storeId, scope.tenantId])
  expect(store?.text).toContain("\"status\"='ACTIVE' FOR SHARE")
  const device = statements.find((entry) =>
    entry.text.includes('FROM "OfflineDevice"'),
  )
  expect(device?.values).toEqual([
    scope.tenantId,
    scope.storeId,
    scope.deviceId,
    scope.actorUserId,
  ])
  expect(device?.text).toContain("\"status\"='ACTIVE' FOR UPDATE")
  expect(f.calls.find((call) => call.kind === "descendant")?.args).toEqual({
    where: {
      tenantId: scope.tenantId,
      dependencyClientIds: { array_contains: ["original-command"] },
    },
    select: { id: true },
  })
  expect(statements.at(-1)).toEqual({
    text: 'UPDATE "Tenant" SET "updatedAt"=clock_timestamp() WHERE "id"=?',
    values: [scope.tenantId],
  })
})
