import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { offlineRouter } from "./offline"

const envelope = {
  clientCommandId: "original-command",
  createdAtClient: new Date("2026-10-17T06:00:00Z"),
  dependencyClientIds: [],
  eventVersion: 1,
  payload: {
    kind: "commercial_order" as const,
    lines: [
      { custom: "quick_sale" as const, amountMinor: 500, description: "Rice" },
    ],
  },
}
const recovery = {
  commands: [envelope],
  deviceId: "original-device",
  storeId: "original-store",
}
const decision = {
  commandId: "held-command",
  decision: "approve" as const,
  reason: "Checked the saved sale with the rep",
  envelope,
}

function context(db: unknown, role = "OWNER") {
  return {
    db,
    requestHeaders: new Headers(),
    requestId: "recovery-route-test",
    session: {
      session: { id: "session-original", token: "ordinary-session" },
      user: { id: "actor-original" },
    },
    tenantContext: {
      tenant: { id: "unrelated-current-tenant", qaPurgeStartedAt: null },
      membership: { id: "membership", role },
    },
  }
}
const createCaller = createCallerFactory(offlineRouter)

test("recovery admission and decision refuse absent identity before database effects", async () => {
  const caller = createCaller({
    ...context({}),
    session: null,
    tenantContext: null,
  } as never)
  await expect(caller.recover(recovery)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
  await expect(caller.decideRecovery(decision)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  })
})

test("QA-derived recovery and undeclared age never reach device selection", async () => {
  const qa = createCaller({
    ...context({}),
    qaSessionScope: { tenantId: "qa-tenant" },
  } as never)
  await expect(qa.recover(recovery)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  const unknownAge = createCaller(
    context({
      user: { findUnique: async () => ({ ageBand: "UNDECLARED" }) },
    }) as never,
  )
  await expect(unknownAge.recover(recovery)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  })
})

test("recovery rejects author, Tenant and internal marker overrides before origin selection", async () => {
  const caller = createCaller(
    context({
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
    }) as never,
  )
  for (const fields of [
    { actorUserId: "foreign-author" },
    { tenantId: "foreign-tenant" },
    { sessionId: "foreign-session" },
    { _offlineRecovery: {} },
  ]) {
    await expect(
      caller.recover({ ...recovery, ...fields }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.decideRecovery({ ...decision, ...fields }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
  await expect(
    caller.recover({
      ...recovery,
      commands: [
        {
          ...envelope,
          payload: { ...envelope.payload, actorUserId: "foreign-author" },
        },
      ],
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
})

test("Manager and rep cannot invoke the suspension approval override", async () => {
  for (const role of ["MANAGER", "CASHIER", "OPERATOR", "CUSTOMER"]) {
    const caller = createCaller(context({}, role) as never)
    await expect(caller.decideRecovery(decision)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  }
})

test("original owned registration selects recovery Tenant, never current Tenant context", async () => {
  let lookup: unknown
  let lockedTenant: unknown
  const sentinel = Error("stop before any mutation")
  const caller = createCaller(
    context({
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      offlineDevice: {
        findMany: async (input: unknown) => {
          lookup = input
          return [{ tenantId: "original-tenant" }]
        },
      },
      $transaction: async (
        run: (tx: {
          $queryRaw: (
            strings: TemplateStringsArray,
            tenantId: string,
          ) => Promise<never>
        }) => Promise<unknown>,
      ) =>
        run({
          $queryRaw: async (_strings, tenantId) => {
            lockedTenant = tenantId
            throw sentinel
          },
        }),
    }) as never,
  )
  await expect(caller.recover(recovery)).rejects.toMatchObject({
    cause: sentinel,
  })
  expect(lookup).toEqual({
    where: {
      deviceId: recovery.deviceId,
      registeredByUserId: "actor-original",
      storeId: recovery.storeId,
      status: "ACTIVE",
    },
    select: { tenantId: true },
    take: 2,
  })
  expect(lockedTenant).toBe("original-tenant")
})

test("missing or ambiguous original registration refuses recovery without transaction", async () => {
  for (const origins of [[], [{ tenantId: "a" }, { tenantId: "b" }]]) {
    const caller = createCaller(
      context({
        user: { findUnique: async () => ({ ageBand: "ADULT" }) },
        offlineDevice: { findMany: async () => origins },
      }) as never,
    )
    await expect(caller.recover(recovery)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  }
})

test("nested recovery payloads cannot inject author, origin or internal recovery annotations", async () => {
  const caller = createCaller(
    context({
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
    }) as never,
  )
  for (const fields of [
    { actorUserId: "foreign-author" },
    { tenantId: "foreign-tenant" },
    { storeId: "foreign-store" },
    { _offlineRecovery: { kind: "suspended_staff", version: 1 } },
  ]) {
    const changed = { ...envelope, payload: { ...envelope.payload, ...fields } }
    await expect(
      caller.recover({ ...recovery, commands: [changed] } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.decideRecovery({ ...decision, envelope: changed } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  }
})

test("Owner/Admin approval selects only the current authorized Tenant's command", async () => {
  for (const role of ["OWNER", "ADMIN"]) {
    let lookup: unknown
    const sentinel = Error("stop before reading or changing command contents")
    const caller = createCaller(
      context(
        {
          $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
            run({
              offlineCommand: {
                findFirst: async (query: unknown) => {
                  lookup = query
                  throw sentinel
                },
              },
            }),
        },
        role,
      ) as never,
    )
    await expect(caller.decideRecovery(decision)).rejects.toMatchObject({
      cause: sentinel,
    })
    expect(lookup).toEqual({
      where: { id: "held-command", tenantId: "unrelated-current-tenant" },
    })
  }
})

test("QA-derived decisions cannot escape their selected Tenant or Store context", async () => {
  for (const qaSessionScope of [
    { tenantId: "other-tenant", membershipId: "membership", storeId: "store" },
    {
      tenantId: "unrelated-current-tenant",
      membershipId: "membership",
      storeId: "other-store",
    },
  ]) {
    const base = context({})
    const caller = createCaller({
      ...base,
      tenantContext: { ...base.tenantContext, activeStore: { id: "store" } },
      qaSessionScope,
    } as never)
    await expect(caller.decideRecovery(decision)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  }
})
