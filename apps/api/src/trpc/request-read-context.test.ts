import { expect, test } from "bun:test"
import {
  type PerformanceTrace,
  withPerformanceTrace,
} from "@ewatrade/db/performance-tracing"
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
