import { expect, test } from "bun:test"
import { offlineRecoveryDecisionSchema } from "../../../../apps/api/src/schemas/offline"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  type OfflineCommandEnvelope,
  listOfflineConflictReviews,
  offlineCommandEnvelopeHash,
} from "./offline-commands"

const envelope = {
  clientCommandId: "original-command",
  createdAtClient: new Date("2026-10-17T06:00:00Z"),
  dependencyClientIds: ["original-dependency"],
  eventVersion: 1,
  payload: {
    kind: "commercial_order" as const,
    customerName: "Original customer",
    lines: [
      { custom: "quick_sale" as const, amountMinor: 500, description: "Rice" },
    ],
    initialPayment: {
      amountMinor: 500,
      clientPaymentId: "original-payment",
      moneyAccountId: "original-account",
      method: "cash" as const,
    },
  },
}
const marker = {
  version: 1,
  kind: "suspended_staff",
  membershipId: "original-membership",
  accessRevision: 4,
  accessChangedAt: "2026-10-17T07:00:00.000Z",
  lifecycleEventId: "suspension-original",
  receivedAt: "2026-10-17T08:00:00.000Z",
}
const actor = {
  id: "original-author",
  displayName: "Original rep",
  name: "Original rep",
  email: "original@example.test",
}
const device = {
  id: "device-row-original",
  deviceId: "device-original",
  deviceName: "Original phone",
  platform: "ANDROID",
  registeredAt: new Date("2026-10-16"),
}
const store = {
  id: "store-original",
  name: "Original Store",
  currencyCode: "NGN",
  status: "ACTIVE",
}
const moneyAccount = { id: "original-account", name: "Original till" }
const accountRecord = {
  ...moneyAccount,
  book: { tenantId: "tenant-original", currencyCode: "NGN" },
}
function command(recovery = true) {
  return {
    id: "command-row-original",
    tenantId: "tenant-original",
    storeId: store.id,
    offlineDeviceId: device.id,
    clientCommandId: envelope.clientCommandId,
    createdAtClient: envelope.createdAtClient,
    dependencyClientIds: envelope.dependencyClientIds as unknown,
    eventVersion: envelope.eventVersion,
    payloadHash: offlineCommandEnvelopeHash(envelope),
    payload: {
      ...structuredClone(envelope.payload),
      actorUserId: actor.id,
      ...(recovery ? { _offlineRecovery: marker } : {}),
    },
    type: "COMMERCIAL_ORDER",
    status: "REVIEW_REQUIRED",
    conflictCode: null as string | null,
    conflictMessage: "Awaiting review",
    authoritativeState: null,
    result: null,
    processedAt: null,
  }
}
function fixture(
  commands: unknown[] = [command()],
  labels = true,
  accountRecords = [accountRecord],
  stores = [store],
) {
  const calls: Array<{ port: string; args: unknown }> = []
  const db = {
    offlineCommand: {
      findMany: async (args: { select?: unknown }) => {
        calls.push({ port: "commands", args })
        return args.select
          ? [
              {
                clientCommandId: "dependent-original",
                dependencyClientIds: [envelope.clientCommandId],
                status: "BLOCKED",
              },
            ]
          : commands
      },
    },
    user: {
      findMany: async (args: unknown) => {
        calls.push({ port: "authors", args })
        return labels ? [actor] : []
      },
    },
    offlineDevice: {
      findMany: async (args: unknown) => {
        calls.push({ port: "devices", args })
        return labels ? [device] : []
      },
    },
    store: {
      findMany: async (args: unknown) => {
        calls.push({ port: "Stores", args })
        return labels ? stores : []
      },
    },
    financeAccount: {
      findMany: async (args: {
        where: { OR: typeof accountRecords }
      }) => {
        calls.push({ port: "accounts", args })
        return accountRecords.filter((account) =>
          args.where.OR.some(
            (scope) =>
              scope.id === account.id &&
              scope.book.tenantId === account.book.tenantId &&
              scope.book.currencyCode === account.book.currencyCode,
          ),
        )
      },
    },
  } as unknown as PrismaClient
  return { db, calls }
}

test("recovery projection retains original author/origin and strict exact decision envelope", async () => {
  const original = command()
  const f = fixture([original])
  const [projected] = await listOfflineConflictReviews(f.db, {
    tenantId: "tenant-original",
    storeId: store.id,
  })
  if (!projected) throw Error("Expected held review row")
  expect(projected).toMatchObject({
    actor,
    recovery: marker,
    recoveryOrigin: { store, device, moneyAccount },
    reviewKind: "suspended_recovery",
    safeActions: ["approve", "reject"],
  })
  expect(projected.recoveryEnvelope).toEqual(envelope)
  expect(projected.recoveryEnvelope?.payload).not.toHaveProperty("actorUserId")
  expect(projected.recoveryEnvelope?.payload).not.toHaveProperty(
    "_offlineRecovery",
  )
  const decision = offlineRecoveryDecisionSchema.parse({
    commandId: original.id,
    decision: "approve",
    reason: "Reviewed original draft",
    envelope: projected.recoveryEnvelope,
  })
  expect(offlineCommandEnvelopeHash(decision.envelope)).toBe(
    original.payloadHash,
  )
  expect(decision.envelope.payload.initialPayment?.moneyAccountId).toBe(
    "original-account",
  )
  expect(projected.dependentCommands).toEqual([
    { clientCommandId: "dependent-original", status: "BLOCKED" },
  ])
  expect(original.payload.actorUserId).toBe(actor.id)
  expect(original.payload._offlineRecovery).toEqual(marker)
})

test("catalog entered total survives typed recovery projection and exact decision hash", async () => {
  const line: OfflineCommandEnvelope["payload"]["lines"][number] = {
    offeringId: "original-catalog-offering",
    quantity: "2",
    enteredTotalMinor: 1_200,
  }
  const originalEnvelope: OfflineCommandEnvelope = {
    ...envelope,
    payload: { ...envelope.payload, lines: [line] },
  }
  const original = {
    ...command(),
    payloadHash: offlineCommandEnvelopeHash(originalEnvelope),
    payload: {
      ...originalEnvelope.payload,
      actorUserId: actor.id,
      _offlineRecovery: marker,
    },
  }
  const [projected] = await listOfflineConflictReviews(fixture([original]).db, {
    tenantId: original.tenantId,
    storeId: original.storeId,
  })
  expect(projected?.recoveryEnvelope?.payload.lines).toEqual([line])
  const parsed = offlineRecoveryDecisionSchema.parse({
    commandId: original.id,
    decision: "approve",
    reason: "Reviewed original entered total",
    envelope: projected?.recoveryEnvelope,
  })
  expect<unknown>(parsed.envelope.payload.lines).toEqual([line])
  expect(offlineCommandEnvelopeHash(parsed.envelope)).toBe(original.payloadHash)
})

test("origin labels are selected in the exact Tenant namespace with no private Finance/device fields", async () => {
  const f = fixture()
  await listOfflineConflictReviews(f.db, {
    tenantId: "tenant-original",
    storeId: store.id,
  })
  expect(f.calls).toEqual([
    {
      port: "commands",
      args: {
        orderBy: { createdAtClient: "asc" },
        where: {
          status: { in: ["BLOCKED", "REVIEW_REQUIRED"] },
          storeId: store.id,
          tenantId: "tenant-original",
        },
      },
    },
    {
      port: "commands",
      args: {
        select: {
          clientCommandId: true,
          dependencyClientIds: true,
          status: true,
        },
        where: { tenantId: "tenant-original" },
      },
    },
    {
      port: "authors",
      args: {
        select: { displayName: true, email: true, id: true, name: true },
        where: { id: { in: [actor.id] } },
      },
    },
    {
      port: "devices",
      args: {
        where: { tenantId: "tenant-original", id: { in: [device.id] } },
        select: {
          id: true,
          deviceId: true,
          deviceName: true,
          platform: true,
          registeredAt: true,
        },
      },
    },
    {
      port: "Stores",
      args: {
        where: { tenantId: "tenant-original", id: { in: [store.id] } },
        select: { id: true, name: true, currencyCode: true, status: true },
      },
    },
    {
      port: "accounts",
      args: {
        where: {
          OR: [
            {
              id: moneyAccount.id,
              book: { tenantId: "tenant-original", currencyCode: "NGN" },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          book: { select: { currencyCode: true } },
        },
      },
    },
  ])
})

test("ordinary approval/conflict projection keeps original actions and avoids all origin label queries", async () => {
  for (const conflictCode of [null, "INVALID_COMMAND"]) {
    const ordinary = command(false)
    ordinary.conflictCode = conflictCode
    const f = fixture([ordinary])
    const [projected] = await listOfflineConflictReviews(f.db, {
      tenantId: "tenant-original",
    })
    expect(projected).toMatchObject({
      actor,
      recovery: null,
      recoveryOrigin: null,
      recoveryEnvelope: null,
      payload: ordinary.payload,
      reviewKind: conflictCode ? "conflict" : "approval",
      safeActions: conflictCode ? ["retry", "discard"] : ["approve", "reject"],
    })
    expect(f.calls.map((call) => call.port)).toEqual([
      "commands",
      "commands",
      "authors",
    ])
  }
})

test("missing origin/author labels remain nullable without replacing the immutable recovery envelope", async () => {
  const f = fixture([command()], false)
  const [projected] = await listOfflineConflictReviews(f.db, {
    tenantId: "tenant-original",
  })
  expect(projected).toMatchObject({
    actor: null,
    recoveryOrigin: { store: null, device: null, moneyAccount: null },
    recoveryEnvelope: envelope,
  })
})

test("Money Account labels never cross Tenant, Store currency Book, or original account identity", async () => {
  for (const accountRecords of [
    [],
    [{ ...accountRecord, id: "replacement-account" }],
    [
      {
        ...accountRecord,
        book: { ...accountRecord.book, tenantId: "foreign-tenant" },
      },
    ],
    [
      {
        ...accountRecord,
        book: { ...accountRecord.book, currencyCode: "USD" },
      },
    ],
  ]) {
    const f = fixture([command()], true, accountRecords)
    const [projected] = await listOfflineConflictReviews(f.db, {
      tenantId: "tenant-original",
    })
    expect(projected?.recoveryOrigin?.moneyAccount).toBeNull()
    expect(
      projected?.recoveryEnvelope?.payload.initialPayment?.moneyAccountId,
    ).toBe("original-account")
  }
})

test("each original Store currency scopes the label even when commands name the same account ID", async () => {
  const foreignCurrencyStore = {
    ...store,
    id: "usd-store",
    currencyCode: "USD",
  }
  const second = command()
  second.storeId = foreignCurrencyStore.id
  second.id = "second-row"
  const f = fixture(
    [command(), second],
    true,
    [accountRecord],
    [store, foreignCurrencyStore],
  )
  const rows = await listOfflineConflictReviews(f.db, {
    tenantId: "tenant-original",
  })
  expect(rows[0]?.recoveryOrigin?.moneyAccount).toEqual(moneyAccount)
  expect(rows[1]?.recoveryOrigin?.moneyAccount).toBeNull()
})

test("missing original Store or payment account performs no Finance query and never substitutes a default", async () => {
  for (const absent of ["Store", "payment account"]) {
    const original = command()
    if (absent === "payment account") {
      Reflect.deleteProperty(original.payload.initialPayment, "moneyAccountId")
    }
    const f = fixture(
      [original],
      true,
      [accountRecord],
      absent === "Store" ? [] : [store],
    )
    const [projected] = await listOfflineConflictReviews(f.db, {
      tenantId: "tenant-original",
    })
    expect(projected?.recoveryOrigin?.moneyAccount).toBeNull()
    expect(f.calls.some((call) => call.port === "accounts")).toBe(false)
  }
})

test("account label is a balance-free DTO even if an adapter returns additional private fields", async () => {
  const f = fixture([command()], true, [
    { ...accountRecord, ...{ balanceMinor: 700, token: "private-token" } },
  ])
  const [projected] = await listOfflineConflictReviews(f.db, {
    tenantId: "tenant-original",
  })
  expect(projected?.recoveryOrigin?.moneyAccount).toEqual(moneyAccount)
  expect(JSON.stringify(projected?.recoveryOrigin)).not.toContain("balance")
  expect(JSON.stringify(projected?.recoveryOrigin)).not.toContain(
    "private-token",
  )
})

test("malformed persisted dependency proof yields no decision envelope instead of dropping bad facts", async () => {
  for (const dependencyClientIds of [
    null,
    {},
    "original-dependency",
    ["original-dependency", 7],
    [null],
  ]) {
    const malformed = command()
    malformed.dependencyClientIds = dependencyClientIds
    const f = fixture([malformed])
    const [projected] = await listOfflineConflictReviews(f.db, {
      tenantId: "tenant-original",
    })
    expect(projected?.reviewKind).toBe("suspended_recovery")
    expect(projected?.recoveryEnvelope).toBeNull()
    expect(malformed.dependencyClientIds).toEqual(dependencyClientIds)
  }
})
