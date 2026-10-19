import { beforeEach, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import type { CorrectBlankQuickSaleInput } from "../../../../../../packages/db/src/queries/offline-quick-sale-correction"

// Only this coordinator port is intercepted. Actual router, schema and all
// protected middleware execute. The wrapper supplies an inert .invalid URL for
// the shared Prisma constructor; no real connection or provider is used.
const calls: Array<{ db: unknown; input: CorrectBlankQuickSaleInput }> = []
let failure: Error | undefined
const result = {
  outcome: "replaced",
  originalClientCommandId: "original-command",
  originalPayloadHash: "a".repeat(64),
  replacement: {
    id: "replacement-row",
    payloadHash: "b".repeat(64),
    status: "REVIEW_REQUIRED",
    recoveryHeld: false,
    result: null,
  },
  replacedAt: "2026-10-17T12:00:00.000Z",
}
mock.module(
  new URL(
    "../../../../../../packages/db/src/queries/offline-quick-sale-correction.ts",
    import.meta.url,
  ).pathname,
  () => ({
    correctBlankQuickSale: async (
      db: unknown,
      input: CorrectBlankQuickSaleInput,
    ) => {
      calls.push({ db, input: structuredClone(input) })
      if (failure) throw failure
      return structuredClone(result)
    },
  }),
)
const { createCallerFactory, createTRPCRouter, createTRPCContext } =
  await import("../../init")
const { offlineRouter } = await import("../offline")
const { CatalogError, RetailOpsOfflineDeviceError } = await import(
  "@ewatrade/db/queries"
)
const { offlineQuickSaleCorrectionSchema } = await import(
  "../../../schemas/offline"
)
const createCaller = createCallerFactory(
  createTRPCRouter({ offline: offlineRouter }),
)
beforeEach(() => {
  calls.length = 0
  failure = undefined
})

function input() {
  return {
    deviceId: "original-device",
    storeId: "original-store",
    envelope: {
      clientCommandId: "original-command",
      createdAtClient: new Date("2026-10-17T06:00:00Z"),
      dependencyClientIds: ["accepted-parent"],
      eventVersion: 1,
      payload: {
        kind: "commercial_order" as const,
        lines: [{ custom: "quick_sale" as const, amountMinor: 500 }],
        fulfillNow: true,
        customerMode: "create" as const,
        customerName: "Original customer",
        notes: "Original note",
        initialPayment: {
          amountMinor: 500,
          clientPaymentId: "original-payment",
          moneyAccountId: "original-money-account",
          method: "cash" as const,
          reference: "Original reference",
        },
      },
    },
    replacementClientCommandId: "replacement-command",
    replacementClientPaymentId: "replacement-payment",
    descriptions: [{ lineIndex: 0, description: "Rice" }],
  }
}
function context(db: unknown = {}, role = "CASHIER") {
  return {
    db,
    requestHeaders: new Headers(),
    requestId: "correction-route-test",
    isInternalRequest: false,
    session: {
      session: {
        id: "current-session",
        token: "ordinary-session",
        expiresAt: new Date("2099-01-01"),
      },
      user: { id: "authenticated-author" },
    },
    tenantId: "ignored-context-alias",
    tenantContext: {
      tenant: {
        id: "authenticated-tenant",
        qaPurgeStartedAt: null,
        dataClassification: "LIVE",
      },
      membership: { id: "current-membership", role },
      stores: [{ id: "original-store" }, { id: "different-current-store" }],
      activeStore: { id: "different-current-store" },
    },
    qaSessionScope: null,
  }
}
function caller(ctx = context()) {
  return createCaller(ctx as never).offline
}
async function denied(value: unknown, code = "BAD_REQUEST", ctx = context()) {
  await expect(
    caller(ctx).correctBlankQuickSale(value as never),
  ).rejects.toMatchObject({ code })
  expect(calls).toHaveLength(0)
}

test("absent browser identity refuses before coordinator or DB work", async () => {
  await denied(input(), "UNAUTHORIZED", {
    ...context(),
    session: null,
  } as never)
})

test("expired bearer identity is filtered by actual context resolution and then refused", async () => {
  const { auth } = await import("@ewatrade/auth")
  const { prisma } = await import("@ewatrade/db")
  const api = auth.api
  const sessions = prisma.session
  const authDescriptor = Object.getOwnPropertyDescriptor(api, "getSession")
  const sessionDescriptor = Object.getOwnPropertyDescriptor(
    sessions,
    "findFirst",
  )
  let lookup: unknown
  const expired = new Date("2000-01-01T00:00:00Z")
  Object.defineProperty(api, "getSession", {
    configurable: true,
    value: async () => null,
  })
  Object.defineProperty(sessions, "findFirst", {
    configurable: true,
    value: async (query: { where: { expiresAt: { gt: Date } } }) => {
      lookup = query
      return expired > query.where.expiresAt.gt
        ? { id: "expired-session" }
        : null
    },
  })
  try {
    const app = new Hono()
    app.get("/context", async (c) => {
      const resolved = await createTRPCContext({}, c)
      expect(resolved.session).toBeNull()
      await expect(
        createCaller(resolved).offline.correctBlankQuickSale(input()),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      return c.text("inert")
    })
    const response = await app.request("http://session-tests.invalid/context", {
      headers: { authorization: "Bearer expired-token" },
    })
    expect(response.status).toBe(200)
    expect(lookup).toMatchObject({
      where: {
        expiresAt: { gt: expect.any(Date) },
        OR: [{ id: "expired-token" }, { token: "expired-token" }],
      },
    })
    expect(calls).toHaveLength(0)
  } finally {
    if (authDescriptor) Object.defineProperty(api, "getSession", authDescriptor)
    else Reflect.deleteProperty(api, "getSession")
    if (sessionDescriptor)
      Object.defineProperty(sessions, "findFirst", sessionDescriptor)
    else Reflect.deleteProperty(sessions, "findFirst")
  }
})

test("missing active Tenant refuses through actual tenant resolution", async () => {
  let membershipQuery: unknown
  const ctx = {
    ...context({
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      membership: {
        findFirst: async (query: unknown) => {
          membershipQuery = query
          return null
        },
      },
    }),
    tenantContext: null,
  }
  await denied(input(), "NOT_FOUND", ctx as never)
  expect(membershipQuery).toMatchObject({
    where: {
      userId: "authenticated-author",
      status: "ACTIVE",
      tenant: { isActive: true },
    },
  })
})

for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
  test(`active ${role} reaches author correction without management-review permission`, async () => {
    expect(
      await caller(context({}, role)).correctBlankQuickSale(input()),
    ).toEqual(result as never)
    expect(calls).toHaveLength(1)
  })
for (const role of ["SUPPORT", "MEMBER", "CUSTOMER", "unknown", ""])
  test(`${role || "missing"} role cannot correct queued sales`, async () => {
    await denied(input(), "FORBIDDEN", context({}, role))
  })

test("actor/Tenant and explicit original Store come only from authenticated context and allowed selection", async () => {
  const db = {}
  const value = input()
  expect(await caller(context(db)).correctBlankQuickSale(value)).toEqual(
    result as never,
  )
  expect(calls[0]?.db).toBe(db)
  expect(calls[0]?.input).toEqual({
    ...value,
    actorUserId: "authenticated-author",
    tenantId: "authenticated-tenant",
  })
  expect(calls[0]?.input.storeId).toBe("original-store")
})

test("foreign original Store refuses rather than using current Store", async () => {
  await denied({ ...input(), storeId: "foreign-store" }, "NOT_FOUND")
})

test("missing original Store is schema-invalid rather than defaulted", async () => {
  const { storeId: _store, ...value } = input()
  await denied(value)
})

test("SCOPED checkout staff remains denied by existing policy before coordinator", async () => {
  const fresh = {
    role: "CASHIER",
    status: "ACTIVE",
    staffAccessMode: "SCOPED",
    catalogEditor: false,
    staffStoreAssignments: [
      { storeId: "original-store", role: "CASHIER", status: "ACTIVE" },
    ],
  }
  let transactions = 0
  const ctx = context({
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      transactions++
      return run({
        $queryRaw: async () => [{ id: "current-membership" }],
        membership: { findFirst: async () => fresh },
      })
    },
  })
  const scoped = {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      staffAccess: {
        mode: "SCOPED",
        businessRole: "CASHIER",
        status: "ACTIVE",
        catalogEditor: false,
        assignments: fresh.staffStoreAssignments,
      },
    },
  }
  await denied(input(), "FORBIDDEN", scoped as never)
  expect(transactions).toBe(1)
})

for (const field of ["tenantId", "membershipId", "storeId"] as const)
  test(`QA context with a different ${field} refuses`, async () => {
    const ctx = context({}, "OWNER")
    const qaSessionScope = {
      tenantId: "authenticated-tenant",
      membershipId: "current-membership",
      storeId: "different-current-store",
      [field]: "foreign-scope",
    }
    await denied(input(), "FORBIDDEN", { ...ctx, qaSessionScope } as never)
  })

test("matching QA Tenant/Store context retains existing protected local-operation admission", async () => {
  const ctx = context({}, "OWNER")
  const qaSessionScope = {
    tenantId: "authenticated-tenant",
    membershipId: "current-membership",
    storeId: "different-current-store",
  }
  const value = { ...input(), storeId: "different-current-store" }
  expect(
    await caller({ ...ctx, qaSessionScope } as never).correctBlankQuickSale(
      value,
    ),
  ).toEqual(result as never)
  expect(calls[0]?.input.storeId).toBe(qaSessionScope.storeId)
})

test("matching QA Owner cannot target another same-Tenant Store through explicit input", async () => {
  const ctx = context({}, "OWNER")
  const qaSessionScope = {
    tenantId: "authenticated-tenant",
    membershipId: "current-membership",
    storeId: "different-current-store",
  }
  await denied(input(), "FORBIDDEN", {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      tenant: { ...ctx.tenantContext.tenant, dataClassification: "QA" },
    },
    qaSessionScope,
  } as never)
})

test("purging Tenant refuses before correction dispatch", async () => {
  const ctx = context()
  await denied(input(), "CONFLICT", {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      tenant: { ...ctx.tenantContext.tenant, qaPurgeStartedAt: new Date() },
    },
  } as never)
})

for (const [name, fields] of [
  ["author", { actorUserId: "foreign-author" }],
  ["Tenant", { tenantId: "foreign-tenant" }],
  ["result", { result: { id: "fake-order" } }],
  ["approval", { requiresApproval: false }],
  ["policy", { acceptNewCommands: true }],
  ["recovery", { _offlineRecovery: {} }],
  ["replacement payload", { replacementPayload: { amountMinor: 1 } }],
] as const)
  test(`strict correction body rejects ${name} override`, async () => {
    await denied({ ...input(), ...fields })
  })

for (const fields of [
  { actorUserId: "foreign-author" },
  { tenantId: "foreign-tenant" },
  { storeId: "foreign-store" },
  { _offlineRecovery: recoveryMarker() },
  { result: { id: "fake" } },
])
  test(`strict original payload rejects ${Object.keys(fields)[0]}`, async () => {
    const value = input()
    await denied({
      ...value,
      envelope: {
        ...value.envelope,
        payload: { ...value.envelope.payload, ...fields },
      },
    })
  })
function recoveryMarker() {
  return { version: 1, kind: "suspended_staff" }
}

test("strict nested descriptions and original payment reject replacement mutations", async () => {
  for (const fields of [
    { amountMinor: 1 },
    { actorUserId: "foreign" },
    { moneyAccountId: "replacement-account" },
    { _offlineCommandAttempt: {} },
  ])
    await denied({
      ...input(),
      descriptions: [{ lineIndex: 0, description: "Rice", ...fields }],
    })
  const value = input()
  await denied({
    ...value,
    envelope: {
      ...value.envelope,
      payload: {
        ...value.envelope.payload,
        initialPayment: {
          ...value.envelope.payload.initialPayment,
          recordedByUserId: "foreign",
        },
      },
    },
  })
})

test("original blank descriptions remain admitted without inventing words or changing identities", async () => {
  for (const blank of [undefined, ""]) {
    const value = input()
    const line = {
      custom: "quick_sale" as const,
      amountMinor: 500,
      ...(blank === undefined ? {} : { description: blank }),
    }
    const changed = {
      ...value,
      envelope: {
        ...value.envelope,
        payload: { ...value.envelope.payload, lines: [line] },
      },
    }
    await caller().correctBlankQuickSale(changed)
    const forwarded = calls.at(-1)?.input
    expect(forwarded?.envelope).toEqual(changed.envelope)
    expect(forwarded?.envelope.payload.lines[0]).toEqual(line)
  }
})

test("fresh command/payment identities, original account and trimmed description forward exactly", async () => {
  const value = input()
  value.descriptions[0] = { lineIndex: 0, description: "  Rice  " }
  const json = JSON.parse(JSON.stringify(value))
  await caller().correctBlankQuickSale(json)
  expect(calls[0]?.input).toEqual({
    ...value,
    descriptions: [{ lineIndex: 0, description: "Rice" }],
    actorUserId: "authenticated-author",
    tenantId: "authenticated-tenant",
  })
  expect(calls[0]?.input.envelope.payload.initialPayment).toEqual(
    value.envelope.payload.initialPayment,
  )
  expect(calls[0]?.input.envelope.createdAtClient).toBeInstanceOf(Date)
})

for (const length of [1, 200])
  test(`${length}-character corrected description reaches coordinator`, async () => {
    const value = {
      ...input(),
      descriptions: [{ lineIndex: 0, description: "x".repeat(length) }],
    }
    await caller().correctBlankQuickSale(value)
    expect(calls[0]?.input.descriptions[0]?.description).toHaveLength(length)
  })
for (const description of ["", "   ", "x".repeat(201)])
  test(`invalid description length ${description.length} is refused`, async () => {
    await denied({ ...input(), descriptions: [{ lineIndex: 0, description }] })
  })
for (const lineIndex of [-1, 0.5, 100])
  test(`invalid correction line index ${lineIndex} is refused`, async () => {
    await denied({
      ...input(),
      descriptions: [{ lineIndex, description: "Rice" }],
    })
  })

test("100 corrections with line indices zero through99 are schema-admitted", async () => {
  const value = input()
  const lines = Array.from({ length: 100 }, () => ({
    custom: "quick_sale" as const,
    amountMinor: 500,
  }))
  const descriptions = Array.from({ length: 100 }, (_, lineIndex) => ({
    lineIndex,
    description: "Rice",
  }))
  await caller().correctBlankQuickSale({
    ...value,
    envelope: {
      ...value.envelope,
      payload: { ...value.envelope.payload, lines },
    },
    descriptions,
  })
  expect(calls[0]?.input.descriptions).toHaveLength(100)
  expect(calls[0]?.input.descriptions.at(-1)?.lineIndex).toBe(99)
})
for (const length of [0, 101])
  test(`${length} correction entries are refused`, async () => {
    await denied({
      ...input(),
      descriptions: Array.from({ length }, () => ({
        lineIndex: 0,
        description: "Rice",
      })),
    })
  })

test("unpaid original keeps absent replacement payment identity absent", async () => {
  const value = input()
  const { initialPayment: _payment, ...payload } = value.envelope.payload
  const { replacementClientPaymentId: _replacementPayment, ...unpaid } = value
  await caller().correctBlankQuickSale({
    ...unpaid,
    envelope: { ...value.envelope, payload },
  })
  expect(calls[0]?.input.envelope.payload).not.toHaveProperty("initialPayment")
  expect(calls[0]?.input).not.toHaveProperty("replacementClientPaymentId")
})

for (const [code, mapped] of [
  ["IDEMPOTENCY_MISMATCH", "CONFLICT"],
  ["INVALID_ORDER", "BAD_REQUEST"],
  ["INVALID_STOCK_OPERATION", "FORBIDDEN"],
] as const)
  test(`coordinator ${code} preserves domain cause and maps ${mapped}`, async () => {
    failure = new CatalogError(code, "Synthetic correction refusal")
    await expect(caller().correctBlankQuickSale(input())).rejects.toMatchObject(
      { code: mapped, cause: failure, message: failure.message },
    )
    expect(calls).toHaveLength(1)
  })

test("revoked-device denial maps FORBIDDEN without changing the cause", async () => {
  failure = new RetailOpsOfflineDeviceError(
    "DEVICE_REVOKED",
    "Synthetic device refusal",
  )
  await expect(caller().correctBlankQuickSale(input())).rejects.toMatchObject({
    code: "FORBIDDEN",
    cause: failure,
  })
})

test("unexpected coordinator errors remain unexpected and retain their cause", async () => {
  failure = Error("Synthetic unexpected port failure")
  await expect(caller().correctBlankQuickSale(input())).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    cause: failure,
  })
})

test("disabled policy idempotent reconciliation reaches coordinator without route precheck or client policy flags", async () => {
  let policyReads = 0
  const db = {
    tenant: {
      findUnique: async () => {
        policyReads++
        return { metadata: { offlineOperationsEnabled: false } }
      },
    },
  }
  expect(await caller(context(db)).correctBlankQuickSale(input())).toEqual(
    result as never,
  )
  expect(policyReads).toBe(0)
  expect(calls).toHaveLength(1)
  expect(calls[0]?.input).not.toHaveProperty("requiresApproval")
  expect(calls[0]?.input).not.toHaveProperty("acceptNewCommands")
})

test("shared strict schema preserves the original blank envelope and rejects internal hold fields", () => {
  const value = input()
  expect(offlineQuickSaleCorrectionSchema.parse(value).envelope).toEqual(
    value.envelope,
  )
  expect(
    offlineQuickSaleCorrectionSchema.safeParse({ ...value, hold: false })
      .success,
  ).toBe(false)
})
