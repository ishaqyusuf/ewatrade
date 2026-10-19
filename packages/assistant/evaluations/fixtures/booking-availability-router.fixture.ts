import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { StaffAccess } from "@ewatrade/auth/store-access"
import { TRPCError, initTRPC } from "@trpc/server"
import { ServiceCommerceBookingError } from "../../../db/src/queries/service-commerce-bookings/shared"
import { ServiceCommercePolicyError } from "../../../db/src/queries/service-commerce-policy"

// Actual strict schema, router, requireGeneralScope and role checks. Only the
// protected transport, transaction transport and canonical reader stand in.
// Run alone: module stand-ins are process-wide. This is neither HTTP/Session
// authentication nor persisted membership, SQL capacity or isolation proof.
type Options = { isolationLevel: string; maxWait: number; timeout: number }
const transactions: Options[] = []
const calls: Array<{ client: unknown; input: unknown }> = []
let failure: Error | null = null
let forbiddenTouches = 0
function forbidden(): never {
  forbiddenTouches++
  throw Error("No database mutation, provider or extra transport is permitted")
}
const tx = new Proxy(Object.freeze({ fixture: "booking-read-transaction" }), {
  get: forbidden,
})
const canonicalResult = Object.freeze({
  slots: [],
  nextCursor: "canonical-continuation",
  capacityAssessment: "live_unreserved",
  paymentReadiness: "not_checked",
  providerSettlement: "not_checked",
  coverage: { reachedEnd: false, scannedCandidates: 500 },
})
mock.module("@ewatrade/db/service-booking-availability", () => ({
  readStaffServiceCommerceBookingAvailabilityInTransaction: async (
    client: unknown,
    input: unknown,
  ) => {
    calls.push({ client, input })
    if (failure) throw failure
    return canonicalResult
  },
}))
type FixtureContext = {
  session: { user: { id: string } } | null
  tenantContext: {
    tenant: { id: string; dataClassification: "LIVE" }
    membership: { role: string }
    activeStore: { id: string } | null
    staffAccess: StaffAccess
  }
  db: {
    $transaction: <T>(
      run: (client: typeof tx) => Promise<T>,
      options: Options,
    ) => Promise<T>
  }
}
const transport = initTRPC.context<FixtureContext>().create()
const protectedProcedure = transport.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" })
  return next({ ctx })
})
mock.module(
  new URL("../../../../apps/api/src/trpc/init.ts", import.meta.url).pathname,
  () => ({
    createTRPCRouter: transport.router,
    createCallerFactory: transport.createCallerFactory,
    mergeRouters: transport.mergeRouters,
    publicProcedure: transport.procedure,
    protectedProcedure,
    authenticatedProcedure: protectedProcedure,
    eligibleAccountProcedure: protectedProcedure,
    mobileEntryProcedure: protectedProcedure,
    accountAgeProcedure: protectedProcedure,
    platformAdminProcedure: protectedProcedure,
    internalProcedure: protectedProcedure,
    protectedOrInternalProcedure: protectedProcedure,
  }),
)
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(forbidden, { preconnect: forbidden }),
)
const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
  "inert-router-fixture-key-32-characters"
afterAll(() => {
  network.mockRestore()
  if (previousKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})
const { serviceAssistantBookingsRouter } = await import(
  "../../../../apps/api/src/trpc/routers/service-assistant-bookings"
)
const derived = {
  actorUserId: "current-actor",
  tenantId: "current-business",
  storeId: "current-store",
}
function context(role: StaffAccess["businessRole"] = "OWNER"): FixtureContext {
  return {
    session: { user: { id: derived.actorUserId } },
    tenantContext: {
      tenant: { id: derived.tenantId, dataClassification: "LIVE" },
      membership: { role },
      activeStore: { id: derived.storeId },
      staffAccess: {
        businessRole: role,
        status: "ACTIVE",
        mode: "LEGACY",
        catalogEditor: false,
        assignments: [],
      },
    },
    db: new Proxy(
      {
        async $transaction<T>(
          run: (client: typeof tx) => Promise<T>,
          options: Options,
        ) {
          transactions.push(options)
          return run(tx)
        },
      },
      {
        get(target, key) {
          return key === "$transaction" ? target.$transaction : forbidden()
        },
      },
    ),
  }
}
const input = () => ({
  source: { kind: "service", id: "exact-request" },
  offeringId: "exact-offering",
  resourceId: "exact-resource",
  from: new Date("2026-10-16T09:00:00.123Z"),
  to: new Date("2026-10-16T12:00:00.987Z"),
})
function call(raw: unknown = input(), ctx = context()): Promise<unknown> {
  // No assertion that this deliberate transport stand-in is production Prisma
  // or a real authenticated request context.
  const caller = Reflect.apply(
    serviceAssistantBookingsRouter.createCaller,
    serviceAssistantBookingsRouter,
    [ctx],
  )
  return Reflect.apply(Reflect.get(caller, "availability"), caller, [raw])
}
beforeEach(() => {
  transactions.length = 0
  calls.length = 0
  failure = null
  forbiddenTouches = 0
})
function untouched() {
  expect(transactions).toEqual([])
  expect(calls).toEqual([])
  expect(forbiddenTouches).toBe(0)
}

test("only a protected query is exposed; live page coverage is returned without empty-page inference", async () => {
  expect(Object.keys(serviceAssistantBookingsRouter._def.procedures)).toEqual([
    "availability",
  ])
  expect(
    serviceAssistantBookingsRouter._def.procedures.availability._def.type,
  ).toBe("query")
  expect(await call()).toBe(canonicalResult)
  expect(forbiddenTouches).toBe(0)
})
test("every Service operator ceiling reaches exactly one canonical read in one owned bounded snapshot", async () => {
  for (const role of [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "OPERATOR",
    "CASHIER",
  ] as const) {
    calls.length = 0
    transactions.length = 0
    const raw = input()
    expect(await call(raw, context(role))).toBe(canonicalResult)
    expect(calls).toEqual([{ client: tx, input: { ...raw, ...derived } }])
    expect(calls[0]?.client).toBe(tx)
    expect(transactions).toEqual([
      { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
    ])
  }
  expect(forbiddenTouches).toBe(0)
})
test("Date milliseconds, optional quantity, limit and opaque continuation pass exactly", async () => {
  const raw = {
    ...input(),
    quantity: 10_000,
    limit: 100,
    cursor: "x".repeat(4096),
  }
  await call(raw)
  expect(calls[0]?.input).toEqual({ ...raw, ...derived })
  expect(Reflect.get(calls[0]?.input ?? {}, "from").toISOString()).toBe(
    "2026-10-16T09:00:00.123Z",
  )
  expect(Reflect.get(calls[0]?.input ?? {}, "to").toISOString()).toBe(
    "2026-10-16T12:00:00.987Z",
  )
  expect(forbiddenTouches).toBe(0)
})
test("actual General scope refuses absent, inactive or foreign scoped Store access before a transaction", async () => {
  const noStore = context()
  noStore.tenantContext.activeStore = null
  const inactive = context()
  inactive.tenantContext.staffAccess.status = "SUSPENDED"
  const foreign = context("OPERATOR")
  foreign.tenantContext.staffAccess.mode = "SCOPED"
  foreign.tenantContext.staffAccess.assignments = [
    { storeId: "other-store", role: "OPERATOR", status: "ACTIVE" },
  ]
  for (const ctx of [noStore, inactive, foreign])
    await expect(call(input(), ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  untouched()
  const current = context("OPERATOR")
  current.tenantContext.staffAccess.mode = "SCOPED"
  current.tenantContext.staffAccess.assignments = [
    { storeId: derived.storeId, role: "OPERATOR", status: "ACTIVE" },
  ]
  expect(await call(input(), current)).toBe(canonicalResult)
})
test("refused roles, unsigned transport and unavailable GENERAL signing configuration do not read", async () => {
  for (const role of ["MEMBER", "SUPPORT"] as const)
    await expect(call(input(), context(role))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  const unsigned = context()
  unsigned.session = null
  await expect(call(input(), unsigned)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
  const key = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  try {
    await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" })
  } finally {
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY = key
  }
  untouched()
})
test("strict wire refuses source fiction, tokens, clocks, exclusions, configuration and scope overrides", async () => {
  const raw = input()
  const invalid = [
    { ...raw, source: { kind: "commerce_inquiry", id: "inquiry" } },
    { ...raw, source: { ...raw.source, tenantId: "foreign" } },
    ...[
      "actorUserId",
      "tenantId",
      "storeId",
      "userId",
      "accessToken",
      "now",
      "excludeBookingId",
      "excludeHoldId",
      "configId",
      "configurationRevision",
      "authority",
    ].map((key) => ({ ...raw, [key]: "smuggled" })),
  ]
  for (const value of invalid)
    await expect(call(value)).rejects.toMatchObject({ code: "BAD_REQUEST" })
  untouched()
})
test("exact identities and Date types never trim, retarget or silently truncate wire instants", async () => {
  const raw = input()
  for (const id of [
    "",
    "x".repeat(192),
    " request",
    "request ",
    "request\nprivate",
    "a/b",
    "a\\b",
    "../request",
    ".",
    "..",
    "a?b",
    "a#b",
    "a%2fb",
  ]) {
    for (const value of [
      { ...raw, source: { kind: "service", id } },
      { ...raw, offeringId: id },
      { ...raw, resourceId: id },
    ])
      await expect(call(value)).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  for (const value of [
    { ...raw, from: "2026-10-16T09:00:00.123456Z" },
    { ...raw, to: "2026-10-16T12:00:00.987Z" },
    { ...raw, from: raw.from.getTime() },
    { ...raw, from: new Date(Number.NaN) },
  ])
    await expect(call(value)).rejects.toMatchObject({ code: "BAD_REQUEST" })
  untouched()
  await call({ ...raw, resourceId: "x".repeat(191) })
  expect(calls).toHaveLength(1)
})
test("wire quantities, page bounds and cursor lengths refuse before canonical access", async () => {
  for (const patch of [
    { quantity: 0 },
    { quantity: 10_001 },
    { quantity: 1.5 },
    { quantity: "1" },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { cursor: "" },
    { cursor: "x".repeat(4097) },
  ])
    await expect(call({ ...input(), ...patch })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  untouched()
})
test("known canonical booking and policy refusals map exactly with no retry, effects or invented availability", async () => {
  for (const [error, code] of [
    [
      new ServiceCommerceBookingError("BOOKING_FORBIDDEN", "Refused"),
      "FORBIDDEN",
    ],
    [
      new ServiceCommerceBookingError("BOOKING_BLOCKED", "Blocked"),
      "FORBIDDEN",
    ],
    [
      new ServiceCommerceBookingError("BOOKING_NOT_FOUND", "Unavailable"),
      "NOT_FOUND",
    ],
    [
      new ServiceCommerceBookingError("BOOKING_INVALID_INPUT", "Bad window"),
      "BAD_REQUEST",
    ],
    [
      new ServiceCommerceBookingError(
        "BOOKING_CAPACITY_CONFLICT",
        "Unknown capacity",
      ),
      "CONFLICT",
    ],
    [
      new ServiceCommerceBookingError(
        "BOOKING_CONFIGURATION_CONFLICT",
        "Unknown complete facts",
      ),
      "CONFLICT",
    ],
    [
      new ServiceCommercePolicyError("FORBIDDEN", "Current policy refused"),
      "FORBIDDEN",
    ],
    [
      new ServiceCommercePolicyError(
        "POLICY_BLOCKED",
        "Current policy blocked",
      ),
      "CONFLICT",
    ],
  ] as const) {
    calls.length = 0
    transactions.length = 0
    failure = error
    await expect(call()).rejects.toMatchObject({ code, message: error.message })
    expect(calls).toHaveLength(1)
    expect(transactions).toHaveLength(1)
    expect(forbiddenTouches).toBe(0)
  }
})
test("unexpected canonical failure is not retried or converted into empty availability", async () => {
  failure = Error("Synthetic unexpected read failure")
  await expect(call()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    cause: failure,
  })
  expect(calls).toHaveLength(1)
  expect(transactions).toHaveLength(1)
  expect(forbiddenTouches).toBe(0)
})
