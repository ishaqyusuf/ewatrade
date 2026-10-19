import { expect, mock, test } from "bun:test"
import {
  type OfflineCommand,
  Prisma,
  type PrismaClient,
} from "../../../generated/prisma/client"
import { CatalogError } from "../catalog-errors"

type State = {
  commands: Map<string, OfflineCommand>
  orders: Map<string, unknown>
  effects: number
  audits: unknown[]
  enabled: boolean
  approvalRequired: boolean
  authorStatus: string
  reviewerRole: string
  revoked: boolean
  bookPresent: boolean
}
type Context = { state: State; number: number }
const contexts = new WeakMap<object, Context>()
const canonicalCalls: Array<{ tx: number; input: Record<string, unknown> }> = []
let canonicalError: Error | undefined
mock.module(
  new URL("../commercial-orders.ts", import.meta.url).pathname,
  () => ({
    // Only the canonical composition boundary is intercepted. The actual replay,
    // review, fence, actor guard, financial locking and revocation checks run.
    createCommercialOrderInTransaction: async (
      tx: object,
      input: Record<string, unknown>,
    ) => {
      const context = contexts.get(tx)
      if (!context) throw Error("Canonical composition escaped its transaction")
      canonicalCalls.push({ tx: context.number, input: structuredClone(input) })
      const id = String(input.clientOrderId)
      if (!context.state.orders.has(id)) {
        context.state.orders.set(id, structuredClone(input))
        context.state.effects++
      }
      if (canonicalError) throw canonicalError
      return { id: `order:${id}` }
    },
  }),
)
const {
  replayOfflineCommands,
  reviewOfflineConflict,
  offlineCommandEnvelopeHash,
} = await import("../offline-commands")

type Envelope = Parameters<typeof offlineCommandEnvelopeHash>[0]
function envelope(): Envelope {
  return {
    clientCommandId: "original-command",
    createdAtClient: new Date("2026-10-17T07:00:00Z"),
    dependencyClientIds: [],
    eventVersion: 1,
    payload: {
      kind: "commercial_order",
      lines: [{ custom: "quick_sale", amountMinor: 500, description: "Rice" }],
    },
  }
}
function request(command = envelope()) {
  return {
    acceptNewCommands: true,
    actorUserId: "author",
    capabilities: { operateOrders: true },
    commands: [command],
    deviceId: "original-device",
    requiresApproval: false,
    storeId: "store",
    tenantId: "tenant",
  }
}
function first(input: ReturnType<typeof request>) {
  const value = input.commands[0]
  if (!value) throw Error("Missing inert command")
  return value
}
function saved(
  command = envelope(),
  status = "PENDING",
  conflictCode: string | null = null,
) {
  return {
    id: "command-row",
    tenantId: "tenant",
    storeId: "store",
    offlineDeviceId: "device-row",
    clientCommandId: command.clientCommandId,
    createdAtClient: command.createdAtClient,
    dependencyClientIds: command.dependencyClientIds,
    eventVersion: command.eventVersion,
    payloadHash: offlineCommandEnvelopeHash(command),
    payload: { ...structuredClone(command.payload), actorUserId: "author" },
    attemptedState: null,
    authoritativeState: null,
    status,
    conflictCode,
    conflictMessage: null,
    result: null,
    processedAt: null,
    reviewedAt: null,
    reviewedByUserId: null,
    type: "COMMERCIAL_ORDER",
    createdAt: new Date("2026-10-17T08:00:00Z"),
    updatedAt: new Date("2026-10-17T08:00:00Z"),
  } as OfflineCommand
}
const recovery = {
  version: 1,
  kind: "suspended_staff",
  membershipId: "membership",
  accessRevision: 2,
  accessChangedAt: "2026-10-17T09:00:00.000Z",
  lifecycleEventId: "suspension",
  receivedAt: "2026-10-17T10:00:00.000Z",
}
function retire(state: State) {
  const command = state.commands.get("original-command")
  if (!command) throw Error("Missing staged command")
  command.status = "DISCARDED"
  command.attemptedState = null
  command.authoritativeState = {
    _offlineQuickSaleCorrection: {
      version: 1,
      kind: "blank_quick_sale_replaced",
      originalClientCommandId: command.clientCommandId,
      originalPayloadHash: command.payloadHash,
      replacementClientCommandId: "replacement-command",
      replacementPayloadHash: "b".repeat(64),
      replacedByUserId: "author",
      replacedAt: "2026-10-17T11:00:00.000Z",
    },
  }
}
function command(state: State) {
  const value = state.commands.get("original-command")
  if (!value) throw Error("Missing original command")
  return value
}
function activeAttempt(row: OfflineCommand) {
  return (
    row.attemptedState as { _offlineCommandAttempt?: { id: string } } | null
  )?._offlineCommandAttempt?.id
}
function clone<T>(value: T): T {
  return structuredClone(value)
}
function jsonValue(value: unknown) {
  return value === Prisma.JsonNull ? null : clone(value)
}

type Hooks = {
  before?: (number: number, state: State) => void | Promise<void>
  committed?: (number: number, state: State) => void | Promise<void>
  rolledBack?: (number: number, state: State) => void | Promise<void>
  failAppliedWrite?: boolean
  bookAppearsAfterPlan?: boolean
}
function database(hooks: Hooks = {}) {
  canonicalCalls.length = 0
  canonicalError = undefined
  let state: State = {
    commands: new Map(),
    orders: new Map(),
    effects: 0,
    audits: [],
    enabled: true,
    approvalRequired: false,
    authorStatus: "ACTIVE",
    reviewerRole: "MANAGER",
    revoked: false,
    bookPresent: true,
  }
  let number = 0
  const events: Array<{ tx: number; name: string }> = []
  const updates: Array<{ tx: number; data: Record<string, unknown> }> = []
  function ports(current: () => State, n: number) {
    const event = (name: string) => events.push({ tx: n, name })
    const find = (clientCommandId: string) =>
      clone(current().commands.get(clientCommandId) ?? null)
    return {
      $executeRaw: async (strings: TemplateStringsArray) => {
        event(
          strings.join(" ").includes("hashtextextended")
            ? "device-key"
            : "command-key",
        )
        return 1
      },
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const sql = strings.join(" ")
        if (sql.includes('FROM "FinanceBook"')) {
          const locking = sql.includes("FOR UPDATE")
          event(locking ? "Book" : "Book-presence")
          return current().bookPresent ||
            (!locking && hooks.bookAppearsAfterPlan)
            ? [{ id: "book" }]
            : []
        }
        if (sql.includes('FROM "CustomerLedgerAccount"')) {
          event("Account")
          return []
        }
        if (sql.includes('FROM "Tenant"')) {
          event("Tenant")
          return [
            {
              id: "tenant",
              metadata: {
                offlineOperationsEnabled: current().enabled,
                offlineApprovalRequired: current().approvalRequired,
              },
            },
          ]
        }
        if (sql.includes('FROM "Membership"')) {
          event("Membership")
          const actor = values[1]
          return [
            {
              role: actor === "reviewer" ? current().reviewerRole : "CASHIER",
              status: actor === "reviewer" ? "ACTIVE" : current().authorStatus,
              staffAccessMode: "LEGACY",
              isActive: true,
            },
          ]
        }
        if (sql.includes('FROM "Store"')) {
          event("Store")
          return [{ id: "store", currencyCode: "NGN" }]
        }
        if (sql.includes('FROM "OfflineDevice"')) {
          event("Device")
          return [{ id: "device-row" }]
        }
        if (sql.includes('FROM "OfflineCommand"')) {
          event("Command")
          return []
        }
        throw Error(`Unexpected inert SQL port: ${sql}`)
      },
      store: { findFirst: async () => ({ id: "store", currencyCode: "NGN" }) },
      offlineDevice: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          where.deviceId === "original-device" &&
          where.registeredByUserId === "author" &&
          where.storeId === "store" &&
          where.tenantId === "tenant"
            ? { id: "device-row" }
            : null,
        findUnique: async () => ({ status: "ACTIVE" }),
      },
      offlineDeviceRevocation: {
        findFirst: async () =>
          current().revoked ? { id: "revocation" } : null,
      },
      tenant: { findFirstOrThrow: async () => ({ metadata: null }) },
      sellableOffering: { findMany: async () => [] },
      offlineCommand: {
        findUnique: async ({
          where,
        }: {
          where: { tenantId_clientCommandId: { clientCommandId: string } }
        }) => find(where.tenantId_clientCommandId.clientCommandId),
        findFirst: async ({ where }: { where: { id: string } }) => {
          const row = [...current().commands.values()].find(
            (row) => row.id === where.id,
          )
          return row
            ? { ...clone(row), offlineDevice: { deviceId: "original-device" } }
            : null
        },
        findMany: async ({
          where,
        }: { where: { clientCommandId?: { in: string[] } } }) =>
          clone(
            [...current().commands.values()].filter(
              (row) =>
                !where.clientCommandId ||
                where.clientCommandId.in.includes(row.clientCommandId),
            ),
          ),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          event("create-command")
          const row = { ...saved(), ...clone(data) } as OfflineCommand
          current().commands.set(row.clientCommandId, row)
          return clone(row)
        },
        update: async ({
          where,
          data,
        }: { where: { id: string }; data: Record<string, unknown> }) => {
          event(data.status === "APPLIED" ? "APPLIED" : "update-command")
          if (data.status === "APPLIED" && hooks.failAppliedWrite)
            throw Error("Inert APPLIED persistence failure")
          const row = [...current().commands.values()].find(
            (row) => row.id === where.id,
          )
          if (!row) throw Error("Missing inert update row")
          const copied = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, jsonValue(value)]),
          )
          Object.assign(row, copied)
          updates.push({ tx: n, data: copied })
          return clone(row)
        },
      },
      offlineConflictReview: {
        create: async ({ data }: { data: unknown }) => {
          event("audit")
          current().audits.push(clone(data))
          return {}
        },
      },
    }
  }
  const outside = ports(() => state, 0)
  const db = {
    ...outside,
    $transaction: async <T>(
      run: (tx: Prisma.TransactionClient) => Promise<T>,
      options: unknown,
    ): Promise<T> => {
      const n = ++number
      expect(options).toEqual({ maxWait: 10000, timeout: 30000 })
      await hooks.before?.(n, state)
      const local = clone(state)
      const tx = ports(() => local, n) as unknown as Prisma.TransactionClient
      contexts.set(tx, { state: local, number: n })
      const updateCount = updates.length
      try {
        const result = await run(tx)
        state = local
        await hooks.committed?.(n, state)
        return result
      } catch (error) {
        updates.length = updateCount
        await hooks.rolledBack?.(n, state)
        throw error
      }
    },
  } as unknown as PrismaClient
  return { db, events, updates, state: () => state, transactions: () => number }
}
function review(
  f: ReturnType<typeof database>,
  decision: "approve" | "reject" | "retry" | "discard" = "approve",
) {
  return reviewOfflineConflict(f.db, {
    actorUserId: "reviewer",
    commandId: "command-row",
    decision,
    reason: "Reviewed exact saved sale",
    tenantId: "tenant",
  })
}

test("replay commits canonical effects and APPLIED in the same actual transaction", async () => {
  const f = database()
  const result = await replayOfflineCommands(f.db, request())
  expect(result[0]?.status).toBe("APPLIED")
  expect(f.state().effects).toBe(1)
  expect(activeAttempt(command(f.state()))).toBeUndefined()
  expect(canonicalCalls).toHaveLength(1)
  expect(f.updates.find((row) => row.data.status === "APPLIED")?.tx).toBe(
    canonicalCalls[0]?.tx,
  )
  const sequence = f.events
    .filter((row) => row.tx === canonicalCalls[0]?.tx)
    .map((row) => row.name)
  expect(sequence.indexOf("command-key")).toBeLessThan(sequence.indexOf("Book"))
  expect(sequence.indexOf("Book")).toBeLessThan(sequence.indexOf("Tenant"))
  expect(sequence.indexOf("Tenant")).toBeLessThan(
    sequence.indexOf("Membership"),
  )
  expect(
    f.events
      .filter((row) => row.tx === 1)
      .map((row) => row.name)
      .indexOf("command-key"),
  ).toBe(0)
})

test("failed APPLIED write rolls back canonical effects and retains the durable pending attempt", async () => {
  const f = database({ failAppliedWrite: true })
  await expect(replayOfflineCommands(f.db, request())).rejects.toThrow(
    "APPLIED persistence failure",
  )
  expect(f.state().orders.size).toBe(0)
  expect(f.state().effects).toBe(0)
  expect(command(f.state()).status).toBe("PENDING")
  expect(activeAttempt(command(f.state()))).toEqual(expect.any(String))
})

test("typed failure rolls back effects before separately recording its exact attempt conflict", async () => {
  const f = database()
  canonicalError = new CatalogError("REVISION_CONFLICT", "Stock changed")
  const result = await replayOfflineCommands(f.db, request())
  expect(result[0]).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: "BALANCE_REVISION_CHANGED",
  })
  expect(f.state().effects).toBe(0)
  expect(f.state().orders.size).toBe(0)
  expect(activeAttempt(command(f.state()))).toBeUndefined()
  expect(f.transactions()).toBe(3)
})

test("correction after reservation retires execution without a canonical call", async () => {
  const f = database({
    before: (n, state) => {
      if (n === 2) retire(state)
    },
  })
  const result = await replayOfflineCommands(f.db, request())
  expect(result[0]?.status).toBe("DISCARDED")
  expect(result[0]?.authoritativeState).toEqual(
    command(f.state()).authoritativeState,
  )
  expect(canonicalCalls).toHaveLength(0)
  expect(f.state().effects).toBe(0)
})

test("late typed failure cannot overwrite correction's terminal forward link", async () => {
  const f = database({
    rolledBack: (n, state) => {
      if (n === 2) retire(state)
    },
  })
  canonicalError = new CatalogError("INVALID_ORDER", "Missing description")
  const result = await replayOfflineCommands(f.db, request())
  expect(result[0]?.status).toBe("DISCARDED")
  expect(command(f.state()).conflictCode).toBeNull()
  expect(command(f.state()).authoritativeState).toHaveProperty(
    "_offlineQuickSaleCorrection",
  )
  expect(f.state().effects).toBe(0)
  expect(f.updates).toHaveLength(1)
})

test("late typed failure cannot overwrite a newer attempt with the same status and timestamp", async () => {
  const f = database({
    rolledBack: (n, state) => {
      if (n === 2)
        command(state).attemptedState = {
          _offlineCommandAttempt: {
            version: 1,
            id: "newer-attempt",
            kind: "replay",
          },
        }
    },
  })
  canonicalError = new CatalogError("INVALID_ORDER", "Old failure")
  const result = await replayOfflineCommands(f.db, request())
  expect(result[0]?.status).toBe("PENDING")
  expect(command(f.state()).conflictCode).toBeNull()
  expect(activeAttempt(command(f.state()))).toBe("newer-attempt")
  expect(f.updates).toHaveLength(1)
})

test("recovery marker added before execution prevents ordinary effects and conflict writes", async () => {
  const f = database({
    before: (n, state) => {
      if (n === 2)
        command(state).payload = {
          ...(command(state).payload as object),
          _offlineRecovery: recovery,
        }
    },
  })
  await expect(replayOfflineCommands(f.db, request())).rejects.toThrow(
    "management recovery",
  )
  expect(canonicalCalls).toHaveLength(0)
  expect(f.state().effects).toBe(0)
  expect(f.updates).toHaveLength(1)
})

test("current disablement between admission and execution prevents effects", async () => {
  const f = database({
    before: (n, state) => {
      if (n === 2) state.enabled = false
    },
  })
  expect((await replayOfflineCommands(f.db, request()))[0]?.status).toBe(
    "PENDING",
  )
  expect(canonicalCalls).toHaveLength(0)
  expect(activeAttempt(command(f.state()))).toBeUndefined()
})

test("current approval policy between admission and execution creates a management hold", async () => {
  const f = database({
    before: (n, state) => {
      if (n === 2) state.approvalRequired = true
    },
  })
  expect((await replayOfflineCommands(f.db, request()))[0]).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: null,
  })
  expect(canonicalCalls).toHaveLength(0)
  expect(activeAttempt(command(f.state()))).toBeUndefined()
})

test("a precreated pending row cannot bypass a newly required management hold", async () => {
  const f = database()
  f.state().commands.set("original-command", saved())
  const input = request()
  input.requiresApproval = true
  expect((await replayOfflineCommands(f.db, input))[0]?.status).toBe(
    "REVIEW_REQUIRED",
  )
  expect(canonicalCalls).toHaveLength(0)
  expect(f.state().audits).toHaveLength(0)
})

test("retained caller mutation cannot change the captured runtime payload or dates", async () => {
  const input = request()
  first(input).payload.customerMode = "create"
  first(input).payload.customerName = "Original customer"
  first(input).payload.serviceChargeMinor = 50
  const original = clone(input)
  const f = database({
    committed: (n) => {
      if (n === 1) {
        first(input).payload.customerName = "Changed"
        first(input).createdAtClient.setUTCFullYear(2030)
        first(input).payload.lines[0] = {
          custom: "quick_sale",
          amountMinor: 999,
          description: "Changed",
        }
      }
    },
  })
  await replayOfflineCommands(f.db, input)
  expect(canonicalCalls[0]?.input).toMatchObject({
    ...first(original).payload,
    actorUserId: "author",
    clientOrderId: "original-command",
  })
  expect(command(f.state()).payloadHash).toBe(
    offlineCommandEnvelopeHash(first(original)),
  )
  expect(command(f.state()).createdAtClient).toEqual(
    first(original).createdAtClient,
  )
})

test("fresh durable revocation after admission prevents canonical execution", async () => {
  const f = database({
    before: (n, state) => {
      if (n === 2) state.revoked = true
    },
  })
  await expect(replayOfflineCommands(f.db, request())).rejects.toMatchObject({
    code: "DEVICE_REVOKED",
  })
  expect(canonicalCalls).toHaveLength(0)
  expect(f.state().effects).toBe(0)
})

test("fresh suspension after admission records permission denial without canonical effects", async () => {
  const f = database({
    before: (n, state) => {
      if (n === 2) state.authorStatus = "SUSPENDED"
    },
  })
  expect((await replayOfflineCommands(f.db, request()))[0]).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: "PERMISSION_CHANGED",
  })
  expect(canonicalCalls).toHaveLength(0)
  expect(f.state().effects).toBe(0)
})

test("management approval atomically applies as original author and appends one audit", async () => {
  const f = database()
  f.state().commands.set(
    "original-command",
    saved(envelope(), "REVIEW_REQUIRED"),
  )
  expect((await review(f)).status).toBe("APPLIED")
  expect(f.state().effects).toBe(1)
  expect(f.state().audits).toHaveLength(1)
  expect(canonicalCalls[0]?.input.actorUserId).toBe("author")
  expect(f.updates.find((row) => row.data.status === "APPLIED")?.tx).toBe(
    canonicalCalls[0]?.tx,
  )
  expect(activeAttempt(command(f.state()))).toBeUndefined()
})

for (const decision of ["retry", "discard", "reject"] as const)
  test(`management ${decision} retires old attempt metadata without business effects`, async () => {
    const f = database()
    const row = saved(
      envelope(),
      "REVIEW_REQUIRED",
      decision === "reject" ? null : "INVALID_COMMAND",
    )
    row.attemptedState = {
      _offlineCommandAttempt: { version: 1, id: "old-attempt", kind: "replay" },
    }
    f.state().commands.set(row.clientCommandId, row)
    const hash = row.payloadHash
    expect((await review(f, decision)).status).toBe(
      decision === "retry" ? "PENDING" : "DISCARDED",
    )
    expect(activeAttempt(command(f.state()))).toBeUndefined()
    expect(command(f.state()).payloadHash).toBe(hash)
    expect(f.state().audits).toHaveLength(1)
    expect(canonicalCalls).toHaveLength(0)
  })

test("management approval failure rolls effects back before recording one truthful audit", async () => {
  const f = database()
  f.state().commands.set(
    "original-command",
    saved(envelope(), "REVIEW_REQUIRED"),
  )
  canonicalError = new CatalogError("REVISION_CONFLICT", "Changed stock")
  expect(await review(f)).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: "BALANCE_REVISION_CHANGED",
  })
  expect(f.state().effects).toBe(0)
  expect(f.state().audits).toHaveLength(1)
  expect(activeAttempt(command(f.state()))).toBeUndefined()
})

test("late approval failure cannot replace a newer approval attempt or append its audit", async () => {
  const f = database({
    rolledBack: (n, state) => {
      if (n === 2)
        command(state).attemptedState = {
          _offlineCommandAttempt: {
            version: 1,
            id: "new-review-attempt",
            kind: "approve",
          },
        }
    },
  })
  f.state().commands.set(
    "original-command",
    saved(envelope(), "REVIEW_REQUIRED"),
  )
  canonicalError = new CatalogError("INVALID_ORDER", "Old failure")
  expect(await review(f)).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: null,
  })
  expect(f.state().audits).toHaveLength(0)
  expect(activeAttempt(command(f.state()))).toBe("new-review-attempt")
  expect(f.state().effects).toBe(0)
})

test("fresh non-management reviewer cannot reserve, audit or apply", async () => {
  const f = database()
  f.state().commands.set(
    "original-command",
    saved(envelope(), "REVIEW_REQUIRED"),
  )
  f.state().reviewerRole = "CASHIER"
  await expect(review(f)).rejects.toThrow("Only business management")
  expect(f.updates).toHaveLength(0)
  expect(f.state().audits).toHaveLength(0)
  expect(canonicalCalls).toHaveLength(0)
})

test("dependency denial is staged under the identity/Tenant fence without dependency row locks", async () => {
  const f = database()
  const input = request()
  first(input).dependencyClientIds = ["missing-parent"]
  expect((await replayOfflineCommands(f.db, input))[0]).toMatchObject({
    status: "BLOCKED",
    conflictCode: "DEPENDENCY_BLOCKED",
  })
  expect(canonicalCalls).toHaveLength(0)
  expect(f.transactions()).toBe(1)
  expect(f.events.filter((row) => row.name === "Command")).toHaveLength(1)
})

test("unsupported version is retained for review without a canonical call", async () => {
  const f = database()
  const input = request()
  first(input).eventVersion = 2
  expect((await replayOfflineCommands(f.db, input))[0]).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: "UNSUPPORTED_CLIENT",
  })
  expect(canonicalCalls).toHaveLength(0)
})

test("unknown failed transaction can retry the original identity and commit once", async () => {
  const hooks = { failAppliedWrite: true }
  const f = database(hooks)
  await expect(replayOfflineCommands(f.db, request())).rejects.toThrow(
    "APPLIED persistence failure",
  )
  const firstAttempt = activeAttempt(command(f.state()))
  hooks.failAppliedWrite = false
  expect((await replayOfflineCommands(f.db, request()))[0]?.status).toBe(
    "APPLIED",
  )
  expect(f.state().effects).toBe(1)
  expect(canonicalCalls.map((call) => call.input.clientOrderId)).toEqual([
    "original-command",
    "original-command",
  ])
  expect(firstAttempt).toEqual(expect.any(String))
  expect(activeAttempt(command(f.state()))).toBeUndefined()
})

test("absence rechecked under Tenant preserves unpaid creation without requiring a Book", async () => {
  const f = database()
  f.state().bookPresent = false
  expect((await replayOfflineCommands(f.db, request()))[0]?.status).toBe(
    "APPLIED",
  )
  expect(f.state().effects).toBe(1)
  const sequence = f.events.filter((row) => row.tx === 2).map((row) => row.name)
  expect(sequence.indexOf("Book")).toBeLessThan(sequence.indexOf("Tenant"))
  expect(sequence.indexOf("Tenant")).toBeLessThan(
    sequence.indexOf("Book-presence"),
  )
  expect(sequence.indexOf("Book-presence")).toBeLessThan(
    sequence.indexOf("Membership"),
  )
})

test("a Book appearing after planning aborts before Membership or canonical work", async () => {
  const f = database({ bookAppearsAfterPlan: true })
  f.state().bookPresent = false
  expect((await replayOfflineCommands(f.db, request()))[0]).toMatchObject({
    status: "REVIEW_REQUIRED",
    conflictCode: "BALANCE_REVISION_CHANGED",
    conflictMessage: "Finance setup changed. Review and retry this saved sale.",
  })
  expect(canonicalCalls).toHaveLength(0)
  expect(f.state().effects).toBe(0)
  expect(
    f.events.filter((row) => row.tx === 2).map((row) => row.name),
  ).not.toContain("Membership")
  expect(activeAttempt(command(f.state()))).toBeUndefined()
})
