import { expect, test } from "bun:test"
import {
  authenticatedProcedure,
  createCallerFactory,
  createTRPCRouter,
  platformAdminProcedure,
  protectedOrInternalProcedure,
  protectedProcedure,
} from "./init"

const router = createTRPCRouter({
  tenantId: protectedOrInternalProcedure.query(({ ctx }) => ctx.tenantId),
  protectedTenantId: protectedProcedure.query(({ ctx }) => ctx.tenantId),
})

test("user-scoped protected-or-internal call checks age before Tenant lookup", async () => {
  let tenantReads = 0
  const caller = createCallerFactory(router)({
    db: {
      user: { findUnique: async () => ({ ageBand: "UNDECLARED" }) },
      membership: {
        findFirst: async () => {
          tenantReads += 1
          return null
        },
      },
    },
    isInternalRequest: false,
    session: { user: { id: "legacy-account" } },
    tenantContext: null,
  } as never)

  await expect(caller.tenantId()).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  })
  expect(tenantReads).toBe(0)
  await expect(caller.protectedTenantId()).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  })
  expect(tenantReads).toBe(0)
})

test("internal service call retains its separate authority", async () => {
  const caller = createCallerFactory(router)({
    isInternalRequest: true,
    session: null,
    tenantContext: null,
    tenantId: null,
  } as never)

  expect(await caller.tenantId()).toBeNull()
})

test("QA age recovery does not grant global Account or platform access", async () => {
  const restrictedRouter = createTRPCRouter({
    global: authenticatedProcedure.query(() => "global"),
    platform: platformAdminProcedure.query(() => "platform"),
  })
  const caller = createCallerFactory(restrictedRouter)({
    session: { user: { id: "qa-admin", isPlatformAdmin: true } },
    qaSessionScope: {
      membershipId: "qa-membership",
      storeId: "qa-store",
      tenantId: "qa-tenant",
    },
  } as never)

  await expect(caller.global()).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(caller.platform()).rejects.toMatchObject({ code: "FORBIDDEN" })
})
