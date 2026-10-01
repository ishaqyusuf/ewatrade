import { expect, test } from "bun:test"
import {
  createCallerFactory,
  createTRPCRouter,
  protectedOrInternalProcedure,
} from "./init"

const router = createTRPCRouter({
  tenantId: protectedOrInternalProcedure.query(({ ctx }) => ctx.tenantId),
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
