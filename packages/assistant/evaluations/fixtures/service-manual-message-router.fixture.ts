import { beforeEach, expect, mock, test } from "bun:test"
import { TRPCError, initTRPC } from "@trpc/server"
import { CatalogError } from "../../../db/src/queries/catalog-errors"
import { ServiceIntakeReviewError } from "../../../db/src/queries/service-intake-review"

// Actual router, strict input schemas, messagingScope and error mapper.
// Authentication/tenant middleware and canonical DB functions are stand-ins:
// these checks do not prove HTTP transport, real membership or DB authority.
// Run in an isolated process with --env-file=/dev/null and an unreachable URL.
type TransactionOptions = {
  isolationLevel: string
  maxWait: number
  timeout: number
}
const tx = Object.freeze({ fixtureTransaction: "only-this-client" })
const transactions: TransactionOptions[] = []
const calls: Array<{ name: string; client: unknown; input: unknown }> = []
let effectCalls = 0
let dbTouches = 0
let failure: Error | null = null
const results = {
  context: { fixture: "canonical protected editor result" },
  original: { fixture: "canonical protected original result" },
  record: { fixture: "canonical manual record result" },
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
function forbiddenEffect() {
  effectCalls++
  throw Error(
    "Provider/enqueue or unrelated command is forbidden in this fixture",
  )
}
mock.module("@ewatrade/db/queries", () => ({
  CatalogError,
  readServiceManualMessageEditorContextInTransaction: (
    client: unknown,
    input: unknown,
  ) => canonical("context", client, input),
  readServiceManualMessageOriginalInTransaction: (
    client: unknown,
    input: unknown,
  ) => canonical("original", client, input),
  recordServiceManualMessageInTransaction: (client: unknown, input: unknown) =>
    canonical("record", client, input),
  createBatchServiceNotificationIntents: forbiddenEffect,
  createServiceNotificationIntent: forbiddenEffect,
  listServiceJobMessagesInTransaction: forbiddenEffect,
  recordServiceDeliveryAttempt: forbiddenEffect,
  recordServiceManualShare: forbiddenEffect,
}))
mock.module("@ewatrade/jobs", () => ({
  customerMessagingProviderStatus: forbiddenEffect,
  enqueueServiceNotificationIntent: forbiddenEffect,
}))
type FixtureContext = {
  session: { user: { id: string } } | null
  tenantContext: {
    membership: { role: string; staffAccessMode: string }
    tenant: { id: string }
    activeStore: { id: string } | null
  }
  db: {
    $transaction: <T>(
      callback: (client: typeof tx) => Promise<T>,
      options: TransactionOptions,
    ) => Promise<T>
  }
}
const transport = initTRPC.context<FixtureContext>().create()
const initPath = new URL(
  "../../../../apps/api/src/trpc/init.ts",
  import.meta.url,
).pathname
mock.module(initPath, () => ({
  createTRPCRouter: transport.router,
  protectedProcedure: transport.procedure.use(({ ctx, next }) => {
    if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" })
    return next({ ctx })
  }),
}))
const { serviceCommunicationsRouter } = await import(
  "../../../../apps/api/src/trpc/routers/service-communications"
)
function context(
  role = "OWNER",
  activeStore: string | null = "current-store",
): FixtureContext {
  return {
    session: { user: { id: "authenticated-actor" } },
    tenantContext: {
      membership: { role, staffAccessMode: "LEGACY" },
      tenant: { id: "authenticated-business" },
      activeStore: activeStore ? { id: activeStore } : null,
    },
    db: new Proxy(
      {
        async $transaction<T>(
          callback: (client: typeof tx) => Promise<T>,
          options: TransactionOptions,
        ) {
          transactions.push(options)
          return callback(tx)
        },
      },
      {
        get(target, key) {
          if (key === "$transaction") return target.$transaction
          dbTouches++
          throw Error(`Unexpected database operation: ${String(key)}`)
        },
      },
    ),
  }
}
// Reflect invokes the real caller factory with an explicitly documented stand-in
// context, without pretending it satisfies the production Prisma/session types.
function call(
  method: string,
  input: unknown,
  ctx = context(),
): Promise<unknown> {
  const caller = Reflect.apply(
    serviceCommunicationsRouter.createCaller,
    serviceCommunicationsRouter,
    [ctx],
  )
  return Reflect.apply(Reflect.get(caller, method), caller, [input])
}
const originalInput = {
  jobId: "saved-job",
  intentId: "saved-intent",
  shareId: "saved-share",
}
const manualInput = {
  jobId: "saved-job",
  channel: "whatsapp",
  message: "Already shared update",
  reason: "Customer called",
  alreadyShared: true,
  clientCommandId: "manual-command-1",
}
beforeEach(() => {
  transactions.length = 0
  calls.length = 0
  effectCalls = 0
  dbTouches = 0
  failure = null
})
test("both protected reads use the same supplied transaction with exact current context scope for Owner/Admin/legacy Manager", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    for (const [method, name, input] of [
      ["manualMessageEditorContext", "context", { jobId: "saved-job" }],
      ["manualMessageOriginal", "original", originalInput],
    ] as const) {
      expect(await call(method, input, context(role))).toBe(results[name])
      expect(calls.at(-1)).toEqual({
        name,
        client: tx,
        input: {
          tenantId: "authenticated-business",
          storeId: "current-store",
          actorUserId: "authenticated-actor",
          ...input,
        },
      })
      expect(calls.at(-1)?.client).toBe(tx)
      expect(transactions.at(-1)).toEqual({
        isolationLevel: "RepeatableRead",
        maxWait: 10_000,
        timeout: 30_000,
      })
    }
  }
  expect(transactions).toHaveLength(6)
  expect(effectCalls).toBe(0)
  expect(dbTouches).toBe(0)
})
test("read procedure definitions remain queries and manual recording remains a mutation", () => {
  for (const method of [
    "manualMessageEditorContext",
    "manualMessageOriginal",
  ]) {
    const procedure = Reflect.get(
      serviceCommunicationsRouter._def.procedures,
      method,
    )
    expect(procedure._def.type).toBe("query")
  }
  expect(
    serviceCommunicationsRouter._def.procedures.recordManualMessage._def.type,
  ).toBe("mutation")
})
test("role refusal and missing current Store happen before transaction or canonical read, with no fallback", async () => {
  for (const method of [
    "manualMessageEditorContext",
    "manualMessageOriginal",
  ]) {
    const input =
      method === "manualMessageOriginal"
        ? originalInput
        : { jobId: "saved-job" }
    for (const role of [
      "CASHIER",
      "OPERATOR",
      "SUPPORT",
      "MEMBER",
      "invented",
    ]) {
      await expect(call(method, input, context(role))).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
    }
    await expect(
      call(method, input, context("OWNER", null)),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Choose the current Store.",
    })
  }
  expect(transactions).toEqual([])
  expect(calls).toEqual([])
  expect(effectCalls).toBe(0)
  expect(dbTouches).toBe(0)
})
test("transport stand-in refuses absent session before router scope without claiming real middleware coverage", async () => {
  const ctx = context()
  ctx.session = null
  await expect(
    call("manualMessageEditorContext", { jobId: "saved-job" }, ctx),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  expect(calls).toEqual([])
  expect(transactions).toEqual([])
})
test("strict read schemas refuse smuggled authority recipients extras and overlong IDs before DB entry", async () => {
  const extras = [
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { actorUserId: "foreign" },
    { role: "OWNER" },
    { recipient: "+10000000000" },
    { customerPhone: "+10000000000" },
    { renderedMessage: "forged" },
    { extra: true },
  ]
  for (const method of [
    "manualMessageEditorContext",
    "manualMessageOriginal",
  ]) {
    const input =
      method === "manualMessageOriginal"
        ? originalInput
        : { jobId: "saved-job" }
    for (const extra of extras)
      await expect(call(method, { ...input, ...extra })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      })
    for (const jobId of ["", " ", "j".repeat(129)])
      await expect(call(method, { ...input, jobId })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      })
  }
  for (const key of ["intentId", "shareId"]) {
    for (const value of ["", " ", "x".repeat(129)])
      await expect(
        call("manualMessageOriginal", { ...originalInput, [key]: value }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  await expect(
    call("manualMessageOriginal", {
      jobId: "saved-job",
      intentId: "saved-intent",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(transactions).toEqual([])
  expect(calls).toEqual([])
  expect(effectCalls).toBe(0)
})
test("trimmed boundary IDs retain exact canonical identity without allowing authority override", async () => {
  const jobId = "j".repeat(128)
  const intentId = "i".repeat(128)
  const shareId = "s".repeat(128)
  await call("manualMessageOriginal", {
    jobId: ` ${jobId} `,
    intentId,
    shareId,
  })
  expect(calls[0]?.input).toEqual({
    tenantId: "authenticated-business",
    storeId: "current-store",
    actorUserId: "authenticated-actor",
    jobId,
    intentId,
    shareId,
  })
  expect(calls[0]?.client).toBe(tx)
  expect(effectCalls).toBe(0)
})
test("actual canonical error classes map forbidden/conflict while preserving exact cause and message", async () => {
  for (const method of [
    "manualMessageEditorContext",
    "manualMessageOriginal",
  ]) {
    const input =
      method === "manualMessageOriginal"
        ? originalInput
        : { jobId: "saved-job" }
    for (const error of [
      new ServiceIntakeReviewError(
        "FORBIDDEN",
        "Canonical current actor refused",
      ),
      new ServiceIntakeReviewError("CONFLICT", "Canonical recipient changed"),
      new CatalogError("SERVICE_JOB_NOT_FOUND", "Exact Job unavailable"),
    ]) {
      failure = error
      await expect(call(method, input)).rejects.toMatchObject({
        code: error instanceof CatalogError ? "CONFLICT" : error.code,
        message: error.message,
        cause: error,
      })
    }
  }
  expect(calls).toHaveLength(6)
  expect(calls.every((entry) => entry.client === tx)).toBe(true)
  expect(effectCalls).toBe(0)
  expect(dbTouches).toBe(0)
})
test("unexpected canonical failure stays internal and is never retried or converted to success", async () => {
  failure = Error("Unexpected canonical read failure")
  await expect(
    call("manualMessageOriginal", originalInput),
  ).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: failure.message,
  })
  expect(transactions).toHaveLength(1)
  expect(calls).toHaveLength(1)
  expect(effectCalls).toBe(0)
})
test("manual record delegates once to Serializable canonical command with explicit acknowledgement and no enqueue", async () => {
  expect(await call("recordManualMessage", manualInput, context("ADMIN"))).toBe(
    results.record,
  )
  expect(calls).toEqual([
    {
      name: "record",
      client: tx,
      input: {
        tenantId: "authenticated-business",
        storeId: "current-store",
        actorUserId: "authenticated-actor",
        ...manualInput,
      },
    },
  ])
  expect(transactions).toEqual([
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  ])
  expect(effectCalls).toBe(0)
  expect(dbTouches).toBe(0)
})
test("manual record strict schema rejects false acknowledgement and private recipient/authority fields before canonical write", async () => {
  for (const patch of [
    { alreadyShared: false },
    { alreadyShared: undefined },
    { recipient: "+10000000000" },
    { actorUserId: "forged" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { jobId: "j".repeat(129) },
    { message: "m".repeat(1001) },
  ]) {
    await expect(
      call("recordManualMessage", { ...manualInput, ...patch }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  expect(calls).toEqual([])
  expect(transactions).toEqual([])
  expect(effectCalls).toBe(0)
  expect(dbTouches).toBe(0)
})
