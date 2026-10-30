import { expect, test } from "bun:test"
import {
  type PerformanceTrace,
  withPerformanceTrace,
} from "@ewatrade/db/performance-tracing"
import { getActiveTenantForUser } from "@ewatrade/db/queries"
import {
  type TRPCContext,
  createCallerFactory,
  createTRPCRouter,
  protectedOrInternalProcedure,
  protectedProcedure,
  resolveProtectedTenantContext,
} from "./init"
import { createRequestReadContext } from "./request-read-context"

const router = createTRPCRouter({
  first: protectedProcedure.query(({ ctx }) => ctx.tenantId),
  second: protectedOrInternalProcedure.query(({ ctx }) => ctx.tenantId),
  write: protectedProcedure.mutation(({ ctx }) => ctx.tenantId),
})

function request(method = "GET") {
  let ageReads = 0
  let membershipReads = 0
  let revoked = false
  let scoped = false
  const db = {
    user: {
      findUnique: async () => {
        ageReads++
        return { ageBand: "ADULT" }
      },
    },
    membership: {
      findFirst: async () => {
        membershipReads++
        if (revoked) return null
        return {
          id: "membership",
          role: scoped ? "MANAGER" : "OWNER",
          status: "ACTIVE",
          tenantId: "tenant",
          staffAccessMode: scoped ? "SCOPED" : "LEGACY",
          catalogEditor: false,
          staffStoreAssignments: scoped
            ? [{ storeId: "store", role: "CASHIER", status: "ACTIVE" }]
            : [],
          tenant: {
            id: "tenant",
            slug: "business",
            name: "Business",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            currencyCode: "NGN",
            timezone: "Africa/Lagos",
            dataClassification: "QA",
            qaPurgeStartedAt: null,
            stores: [
              {
                id: "store",
                slug: "store",
                name: "Store",
                status: "ACTIVE",
                currencyCode: "NGN",
                metadata: {},
              },
            ],
          },
        }
      },
    },
  }
  const ctx = {
    db,
    readContext: createRequestReadContext(method),
    requestHeaders: new Headers(),
    requestId: "request",
    session: { session: { id: "session" }, user: { id: "actor" } },
    tenantContext: null,
    tenantSlug: "business",
    activeStoreId: "store",
    isInternalRequest: false,
    qaSessionScope: null,
  } as unknown as TRPCContext
  return {
    ctx,
    counts: () => ({ ageReads, membershipReads }),
    revoke: () => {
      revoked = true
    },
    scopeStaff: () => {
      scoped = true
    },
  }
}

test("real parallel protected procedures reuse one legal and Tenant read within a GET", async () => {
  const state = request()
  const caller = createCallerFactory(router)(state.ctx)
  let trace: PerformanceTrace | undefined
  const values = await withPerformanceTrace(
    "request",
    () => Promise.all([caller.first(), caller.second(), caller.first()]),
    (value) => {
      trace = value
    },
  )
  expect(values).toEqual(["tenant", "tenant", "tenant"])
  expect(state.counts()).toEqual({ ageReads: 1, membershipReads: 1 })
  expect(trace?.phases.legalReuse?.count).toBe(2)
  expect(trace?.phases.scopeReuse?.count).toBe(2)
})

test("POST reads and mutations retain fresh authority even after a memoized GET read", async () => {
  const post = request("POST")
  expect(post.ctx.readContext).toBeUndefined()
  const caller = createCallerFactory(router)(post.ctx)
  await caller.first()
  await caller.second()
  expect(post.counts()).toEqual({ ageReads: 2, membershipReads: 2 })

  const state = request()
  const readThenWrite = createCallerFactory(router)(state.ctx)
  expect(await readThenWrite.first()).toBe("tenant")
  state.revoke()
  await expect(readThenWrite.write()).rejects.toMatchObject({
    code: "NOT_FOUND",
  })
  expect(state.counts()).toEqual({ ageReads: 2, membershipReads: 2 })
})

test("new requests and foreign readers cannot reuse earlier Tenant facts", async () => {
  const first = request()
  await createCallerFactory(router)(first.ctx).first()
  const next = request()
  next.revoke()
  await expect(
    createCallerFactory(router)(next.ctx).first(),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(next.counts()).toEqual({ ageReads: 1, membershipReads: 1 })

  first.revoke()
  const other = {
    ...first.ctx,
    session: { session: { id: "other" }, user: { id: "other" } },
  } as TRPCContext
  await expect(
    createCallerFactory(router)(other).first(),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})

test("strict Store refusal cannot be satisfied by a recovery read in the same GET", async () => {
  const state = request()
  state.scopeStaff()
  state.ctx.activeStoreId = "revoked-store"
  await expect(
    resolveProtectedTenantContext(state.ctx, false, true),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(
    (await resolveProtectedTenantContext(state.ctx, true, true)).tenantContext
      ?.activeStore?.id,
  ).toBe("store")
  await expect(
    resolveProtectedTenantContext(state.ctx, false, true),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(state.counts()).toEqual({ ageReads: 1, membershipReads: 2 })
})

test("reader copies and database identities stay isolated and QA scope is checked on every caller", async () => {
  const state = request()
  const first = await resolveProtectedTenantContext(state.ctx, false, true)
  first.tenantContext.tenant.name = "reader-local change"
  expect(
    (await resolveProtectedTenantContext(state.ctx, false, true)).tenantContext
      .tenant.name,
  ).toBe("Business")
  const other = request()
  other.revoke()
  await expect(
    resolveProtectedTenantContext(
      { ...other.ctx, readContext: state.ctx.readContext },
      false,
      true,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  state.ctx.qaSessionScope = {
    tenantId: "foreign",
    storeId: "store",
    membershipId: "membership",
  }
  await expect(
    createCallerFactory(router)(state.ctx).first(),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("initial current eligibility is lazy and can only satisfy its exact database/actor GET owner", async () => {
  const db = {}
  const otherDb = {}
  let initialReads = 0
  let fallbackReads = 0
  const rejection = new Error("inert initial age refusal")
  const initialEligibility = {
    db,
    userId: "actor",
    read: async () => {
      initialReads++
      throw rejection
    },
  }
  const memo = createRequestReadContext("GET", initialEligibility)
  if (!memo) throw Error("GET owner missing")
  expect(initialReads).toBe(0)
  const fallback = async () => {
    fallbackReads++
  }
  await memo.eligibility(otherDb, "actor", fallback)
  await memo.eligibility(db, "foreign-actor", fallback)
  expect(initialReads).toBe(0)
  for (let i = 0; i < 2; i++)
    await expect(memo.eligibility(db, "actor", fallback)).rejects.toBe(
      rejection,
    )
  expect(initialReads).toBe(1)
  expect(fallbackReads).toBe(2)
  expect(createRequestReadContext("POST", initialEligibility)).toBeUndefined()
  const fresh = createRequestReadContext("GET")
  await fresh?.eligibility(db, "actor", fallback)
  expect(fallbackReads).toBe(3)
})

test("initial workspace projection is lazy, cloned and limited to the exact database/actor/business/Store GET", async () => {
  const state = request()
  const tenant = await getActiveTenantForUser(state.ctx.db, {
    userId: "actor",
    tenantSlug: "business",
    storeId: "store",
  })
  const input = { userId: "actor", tenantSlug: "business", storeId: "store" }
  let initialReads = 0
  let fallbackReads = 0
  const initial = {
    db: state.ctx.db,
    input,
    read: async () => {
      initialReads++
      return tenant
    },
  }
  const memo = createRequestReadContext("GET", undefined, initial)
  if (!memo) throw Error("GET owner missing")
  const fallback = async () => {
    fallbackReads++
    return null
  }
  expect(initialReads).toBe(0)
  const [first, second] = await Promise.all([
    memo.tenant(state.ctx.db, input, fallback),
    memo.tenant(state.ctx.db, input, fallback),
  ])
  if (!first || !second) throw Error("Fixture context missing")
  first.tenant.name = "reader change"
  expect(second.tenant.name).toBe("Business")
  expect(tenant?.tenant.name).toBe("Business")
  expect(initialReads).toBe(1)
  await memo.tenant({}, input, fallback)
  for (const other of [
    { ...input, userId: "foreign" },
    { ...input, tenantSlug: "foreign" },
    { ...input, storeId: null },
    { ...input, storeId: "foreign" },
  ])
    await memo.tenant(state.ctx.db, other, fallback)
  expect(fallbackReads).toBe(5)
  expect(createRequestReadContext("POST", undefined, initial)).toBeUndefined()
  await createRequestReadContext("GET")?.tenant(state.ctx.db, input, fallback)
  expect(fallbackReads).toBe(6)
})

test("seeded workspace GETs cannot satisfy mutation, recovery or changed QA scope authority", async () => {
  const state = request()
  const input = { userId: "actor", tenantSlug: "business", storeId: "store" }
  const tenant = await getActiveTenantForUser(state.ctx.db, input)
  state.ctx.readContext = createRequestReadContext("GET", undefined, {
    db: state.ctx.db,
    input,
    read: async () => tenant,
  })
  const caller = createCallerFactory(router)(state.ctx)
  expect(await caller.first()).toBe("tenant")
  state.revoke()
  await expect(caller.write()).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    resolveProtectedTenantContext(state.ctx, true, true),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  state.ctx.qaSessionScope = {
    tenantId: "foreign",
    storeId: "store",
    membershipId: "membership",
  }
  await expect(caller.first()).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(state.counts()).toEqual({ ageReads: 2, membershipReads: 3 })
})
