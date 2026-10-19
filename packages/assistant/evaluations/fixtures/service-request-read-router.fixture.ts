import { beforeEach, expect, mock, test } from "bun:test"
import { TRPCError, initTRPC } from "@trpc/server"
import { ServiceIntakeReviewError } from "../../../db/src/queries/service-intake-review"

// Actual router, shared strict schemas, role ceiling, scope derivation and error
// mapping. Protected middleware, transaction transport and canonical DB functions
// are stand-ins; this is not HTTP, real membership or canonical SQL acceptance.
// Run separately with --env-file=/dev/null and an unreachable DB initializer.
type Options = { isolationLevel: string; maxWait: number; timeout: number }
const tx = Object.freeze({ sourceFixture: "request-read-transaction" })
const transactions: Options[] = []
const calls: Array<{ name: string; client: unknown; input: unknown }> = []
let failure: Error | null = null
let forbiddenTouches = 0
function forbidden() {
  forbiddenTouches++
  throw Error("Database mutation, provider or unexpected transport forbidden")
}
const results = {
  listPage: Object.freeze({ fixture: "complete canonical page result" }),
  original: Object.freeze({ fixture: "exact canonical original result" }),
}
async function canonical(
  name: keyof typeof results,
  client: unknown,
  input: unknown,
) {
  calls.push({ name, client, input })
  if (failure) throw failure
  return results[name]
}
mock.module("@ewatrade/db/service-request-read", () => ({
  listServiceRequestPageInTransaction: (client: unknown, input: unknown) =>
    canonical("listPage", client, input),
  readServiceRequestOriginalInTransaction: (client: unknown, input: unknown) =>
    canonical("original", client, input),
}))
mock.module("@ewatrade/jobs", () => ({
  customerMessagingProviderStatus: forbidden,
  enqueueServiceNotificationIntent: forbidden,
}))
type FixtureContext = {
  session: { user: { id: string } } | null
  tenantContext: {
    tenant: { id: string }
    membership: { role: string; staffAccessMode: string }
    activeStore: { id: string } | null
  }
  db: {
    $transaction: <T>(
      callback: (client: typeof tx) => Promise<T>,
      options: Options,
    ) => Promise<T>
  }
}
const transport = initTRPC.context<FixtureContext>().create()
mock.module(
  new URL("../../../../apps/api/src/trpc/init.ts", import.meta.url).pathname,
  () => ({
    createTRPCRouter: transport.router,
    protectedProcedure: transport.procedure.use(({ ctx, next }) => {
      if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" })
      return next({ ctx })
    }),
  }),
)
const { serviceAssistantRequestsRouter } = await import(
  "../../../../apps/api/src/trpc/routers/service-assistant-requests"
)
const derived = {
  actorUserId: "current-actor",
  tenantId: "current-business",
  storeId: "current-store",
}
function context(
  role = "OWNER",
  store: string | null = derived.storeId,
): FixtureContext {
  return {
    session: { user: { id: derived.actorUserId } },
    tenantContext: {
      tenant: { id: derived.tenantId },
      membership: { role, staffAccessMode: "LEGACY" },
      activeStore: store ? { id: store } : null,
    },
    db: new Proxy(
      {
        async $transaction<T>(
          callback: (client: typeof tx) => Promise<T>,
          options: Options,
        ) {
          transactions.push(options)
          return callback(tx)
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
// Deliberately use a transport stand-in without asserting it is production Prisma
// or a production authenticated context. The runtime router code is unchanged.
function call(
  method: string,
  input: unknown,
  ctx = context(),
): Promise<unknown> {
  const caller = Reflect.apply(
    serviceAssistantRequestsRouter.createCaller,
    serviceAssistantRequestsRouter,
    [ctx],
  )
  return Reflect.apply(Reflect.get(caller, method), caller, [input])
}
beforeEach(() => {
  transactions.length = 0
  calls.length = 0
  failure = null
  forbiddenTouches = 0
})
test("router exposes exactly two pure query procedures, with no mutation surface", () => {
  expect(
    Object.keys(serviceAssistantRequestsRouter._def.procedures).sort(),
  ).toEqual(["listPage", "original"])
  for (const procedure of Object.values(
    serviceAssistantRequestsRouter._def.procedures,
  ))
    expect(procedure._def.type).toBe("query")
})
test("default page and exact original derive current scope and invoke one canonical function in the same bounded snapshot", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    for (const [name, input, expected] of [
      ["listPage", {}, { limit: 10 }],
      [
        "original",
        { requestId: "saved-request" },
        { requestId: "saved-request" },
      ],
    ] as const) {
      const before = calls.length
      const beforeTransactions = transactions.length
      expect(await call(name, input, context(role))).toBe(results[name])
      expect(calls).toHaveLength(before + 1)
      expect(transactions).toHaveLength(beforeTransactions + 1)
      expect(calls.at(-1)).toEqual({
        name,
        client: tx,
        input: { ...expected, ...derived },
      })
      expect(calls.at(-1)?.client).toBe(tx)
      expect(transactions.at(-1)).toEqual({
        isolationLevel: "RepeatableRead",
        maxWait: 10_000,
        timeout: 30_000,
      })
    }
  }
  expect(forbiddenTouches).toBe(0)
})
test("all six canonical status filters and exact literal query/cursor pass unchanged apart from trimming", async () => {
  for (const status of [
    "submitted",
    "needs_information",
    "quoted",
    "declined",
    "withdrawn",
    "converted",
  ]) {
    const input = {
      status,
      query: "  Amina_%\\ literal  ",
      cursor: "fixed-continuation",
      limit: 1,
    }
    await call("listPage", input)
    expect(calls.at(-1)?.input).toEqual({
      ...input,
      query: "Amina_%\\ literal",
      ...derived,
    })
  }
  expect(calls).toHaveLength(6)
  expect(transactions).toHaveLength(6)
  expect(forbiddenTouches).toBe(0)
})
test("page bounds and malformed filters refuse before canonical or transaction entry", async () => {
  for (const patch of [
    { limit: 0 },
    { limit: 11 },
    { limit: 1.5 },
    { limit: "10" },
    { status: "SUBMITTED" },
    { status: "approved" },
    { status: "prescription" },
    { query: "" },
    { query: " " },
    { query: "q".repeat(121) },
    { query: null },
    { cursor: "" },
    { cursor: "c".repeat(4097) },
    { cursor: 12 },
  ])
    await expect(call("listPage", patch)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  expect(calls).toEqual([])
  expect(transactions).toEqual([])
  expect(forbiddenTouches).toBe(0)
})
test("supported page boundary values remain bounded canonical arguments, not wrapper truncation", async () => {
  const input = { limit: 10, query: "q".repeat(120), cursor: "c".repeat(4096) }
  await call("listPage", input)
  expect(calls[0]?.input).toEqual({ ...input, ...derived })
  expect(calls).toHaveLength(1)
  expect(transactions).toHaveLength(1)
  // Cursor semantic/fingerprint validation belongs to the real canonical helper.
})
test("exact original accepts128 character identity and refuses missing blank nonstring or129 identities", async () => {
  const requestId = "r".repeat(128)
  await call("original", { requestId: ` ${requestId} ` })
  expect(calls[0]?.input).toEqual({ requestId, ...derived })
  for (const input of [
    {},
    { requestId: "" },
    { requestId: " " },
    { requestId: "r".repeat(129) },
    { requestId: null },
    { requestId: 123 },
  ])
    await expect(call("original", input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  expect(calls).toHaveLength(1)
  expect(transactions).toHaveLength(1)
  expect(forbiddenTouches).toBe(0)
})
test("strict schemas reject smuggled authority source types public tokens contacts and extra keys", async () => {
  for (const extra of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { role: "OWNER" },
    { staffAccessMode: "LEGACY" },
    { sourceType: "PRESCRIPTION_REQUEST" },
    { sourceType: "PRODUCT_INQUIRY" },
    { publicToken: "private-token" },
    { token: "private-token" },
    { customerPhone: "+10000000000" },
    { origin: { tenantId: "foreign", storeId: "foreign" } },
    { href: "https://foreign.invalid" },
    { extra: true },
  ]) {
    await expect(call("listPage", extra)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(
      call("original", { requestId: "saved-request", ...extra }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  expect(calls).toEqual([])
  expect(transactions).toEqual([])
  expect(forbiddenTouches).toBe(0)
})
test("unsupported roles or absent active Store fail before canonical read with no Store fallback", async () => {
  for (const [method, input] of [
    ["listPage", {}],
    ["original", { requestId: "saved-request" }],
  ] as const) {
    for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER", "unknown"])
      await expect(call(method, input, context(role))).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
    await expect(
      call(method, input, context("OWNER", null)),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Choose the current Store.",
    })
  }
  expect(transactions).toEqual([])
  expect(calls).toEqual([])
  expect(forbiddenTouches).toBe(0)
})
test("session stand-in refusal is not represented as production middleware acceptance", async () => {
  const ctx = context()
  ctx.session = null
  await expect(call("listPage", {}, ctx)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
  expect(calls).toEqual([])
  expect(transactions).toEqual([])
})
test("known canonical forbidden/conflict errors preserve safe code message and cause without retry", async () => {
  for (const [method, input] of [
    ["listPage", {}],
    ["original", { requestId: "saved-request" }],
  ] as const) {
    for (const code of ["FORBIDDEN", "CONFLICT"] as const) {
      failure = new ServiceIntakeReviewError(
        code,
        "Canonical request read refused",
      )
      const before = calls.length
      await expect(call(method, input)).rejects.toMatchObject({
        code,
        message: failure.message,
        cause: failure,
      })
      expect(calls).toHaveLength(before + 1)
    }
  }
  expect(transactions).toHaveLength(4)
  expect(calls.every((entry) => entry.client === tx)).toBe(true)
  expect(forbiddenTouches).toBe(0)
})
test("unexpected canonical errors and duck-typed codes remain internal without retry or alternate read", async () => {
  for (const error of [
    Error("Unexpected canonical failure"),
    Object.assign(Error("Not a recognized canonical error"), {
      code: "FORBIDDEN",
    }),
  ]) {
    failure = error
    const before = calls.length
    await expect(
      call("original", { requestId: "saved-request" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: error })
    expect(calls).toHaveLength(before + 1)
  }
  expect(transactions).toHaveLength(2)
  expect(forbiddenTouches).toBe(0)
})
