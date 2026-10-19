import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
  reviewOfflineConflict,
} from "./offline-commands"

const envelope = {
  clientCommandId: "original-command",
  createdAtClient: new Date("2026-10-17T07:00:00Z"),
  dependencyClientIds: [],
  eventVersion: 1,
  payload: {
    kind: "commercial_order" as const,
    lines: [
      { custom: "quick_sale" as const, amountMinor: 500, description: "Rice" },
    ],
  },
}

test("normal replay binds the device lookup to the current authenticated author", async () => {
  let read: unknown
  const db = {
    offlineDevice: {
      async findFirst(input: unknown) {
        read = input
        return null
      },
    },
  } as unknown as PrismaClient
  await expect(
    replayOfflineCommands(db, {
      acceptNewCommands: true,
      actorUserId: "actor-a",
      capabilities: { operateOrders: true },
      commands: [envelope],
      deviceId: "registered-device",
      requiresApproval: false,
      storeId: "store-a",
      tenantId: "tenant-a",
    }),
  ).rejects.toThrow("not active")
  expect(read).toEqual({
    where: {
      deviceId: "registered-device",
      registeredByUserId: "actor-a",
      status: "ACTIVE",
      storeId: "store-a",
      tenantId: "tenant-a",
    },
  })
})

const recoveryMarker = {
  version: 1,
  kind: "suspended_staff",
  membershipId: "original-membership",
  accessRevision: 4,
  accessChangedAt: "2026-10-17T07:10:00.000Z",
  lifecycleEventId: "original-suspension",
  receivedAt: "2026-10-17T08:00:00.000Z",
}
function heldCommand(
  status = "REVIEW_REQUIRED",
  marker: unknown = recoveryMarker,
  conflictCode: string | null = null,
) {
  return {
    id: "command-row-a",
    tenantId: "tenant-a",
    storeId: "store-a",
    offlineDeviceId: "device-row-a",
    clientCommandId: envelope.clientCommandId,
    createdAtClient: envelope.createdAtClient,
    dependencyClientIds: envelope.dependencyClientIds,
    eventVersion: envelope.eventVersion,
    attemptedState: null,
    offlineDevice: { deviceId: "registered-device" },
    payloadHash: offlineCommandEnvelopeHash(envelope),
    status,
    conflictCode,
    payload: {
      ...structuredClone(envelope.payload),
      actorUserId: "actor-a",
      _offlineRecovery: marker,
    },
    result: { id: "private-order", orderNumber: "PRIVATE-RECEIPT" },
    authoritativeState: { privateStock: 100 },
  }
}

for (const status of [
  "APPLIED",
  "PENDING",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "DISCARDED",
]) {
  test(`ordinary replay refuses recovery ${status} before returning privileged output or applying`, async () => {
    const writes: unknown[] = []
    const command = heldCommand(status)
    const original = structuredClone(command)
    const db = {
      offlineDevice: {
        findFirst: async () => ({ id: "device-row-a" }),
        findUnique: async () => ({ status: "ACTIVE" }),
      },
      offlineDeviceRevocation: { findFirst: async () => null },
      tenant: { findFirstOrThrow: async () => ({ metadata: null }) },
      offlineCommand: {
        findUnique: async () => command,
        create: async (value: unknown) => {
          writes.push(value)
          throw Error("Must not stage")
        },
        update: async (value: unknown) => {
          writes.push(value)
          throw Error("Must not write")
        },
      },
      $transaction: async (value: unknown) => {
        writes.push(value)
        throw Error("Must not apply")
      },
    } as unknown as PrismaClient
    await expect(
      replayOfflineCommands(db, {
        acceptNewCommands: true,
        requiresApproval: false,
        actorUserId: "actor-a",
        capabilities: { operateOrders: true },
        commands: [envelope],
        deviceId: "registered-device",
        storeId: "store-a",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow("management recovery")
    expect(writes).toEqual([])
    expect(command).toEqual(original)
  })
}

for (const decision of ["approve", "reject", "retry", "discard"] as const) {
  for (const marker of [recoveryMarker, null]) {
    test(`normal ${decision} refuses ${marker ? "held" : "malformed-marker"} record before audit or effects`, async () => {
      const calls: string[] = []
      const command = heldCommand(
        "REVIEW_REQUIRED",
        marker,
        decision === "retry" || decision === "discard"
          ? "PERMISSION_CHANGED"
          : null,
      )
      const original = structuredClone(command)
      const tx = {
        $queryRaw: async () => {
          calls.push("lock")
          return []
        },
        offlineCommand: {
          findFirst: async () => {
            calls.push("read")
            return command
          },
          findMany: async () => {
            calls.push("dependents")
            return []
          },
          update: async () => {
            calls.push("update")
            return command
          },
        },
        offlineConflictReview: {
          create: async () => {
            calls.push("audit")
            return {}
          },
        },
        commercialOrder: {
          create: async () => {
            calls.push("order")
            throw Error("Must not apply")
          },
        },
      }
      const db = {
        offlineCommand: tx.offlineCommand,
        $transaction: async (
          fn: (transaction: typeof tx) => Promise<unknown>,
        ) => fn(tx),
      } as unknown as PrismaClient
      await expect(
        reviewOfflineConflict(db, {
          actorUserId: "active-manager",
          commandId: command.id,
          decision,
          tenantId: "tenant-a",
          reason: "Attempt ordinary review",
        }),
      ).rejects.toThrow(
        marker ? "management recovery" : "needs management recovery",
      )
      // The outside planning read can now refuse the marker before any lock.
      expect(calls).toEqual(["read"])
      expect(command).toEqual(original)
    })
  }
}

test("normal approval conflict recording refuses a recovery marker added between its two transactions", async () => {
  const original = heldCommand()
  const { _offlineRecovery: _marker, ...unmarked } = original.payload
  const payload: Record<string, unknown> = unmarked
  const command = { ...original, payload }
  let transactions = 0
  const persistedAudits: unknown[] = []
  const persistedUpdates: unknown[] = []
  const tx = {
    // Returning no staff row makes the real active-author guard fail, exercising
    // actual approval rollback and its second conflict-recording transaction.
    $executeRaw: async () => 1,
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ")
      if (sql.includes('FROM "Tenant"'))
        return [{ id: "tenant-a", metadata: null }]
      if (sql.includes('FROM "Membership"') && !sql.includes("JOIN"))
        return [{ role: "MANAGER", status: "ACTIVE" }]
      return []
    },
    store: { findFirst: async () => ({ currencyCode: "NGN" }) },
    offlineCommand: {
      findFirst: async () => command,
      findUnique: async () => command,
      findMany: async () => [],
      update: async ({ data }: { data: Record<string, unknown> }) => {
        persistedUpdates.push(data)
        Object.assign(command, data)
        return { ...command }
      },
    },
    offlineConflictReview: {
      create: async (value: unknown) => {
        persistedAudits.push(value)
        return {}
      },
    },
    sellableOffering: { findMany: async () => [] },
  }
  const db = {
    offlineCommand: tx.offlineCommand,
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => {
      transactions++
      const auditCount = persistedAudits.length
      const updateCount = persistedUpdates.length
      try {
        return await fn(tx)
      } catch (error) {
        persistedAudits.length = auditCount
        persistedUpdates.length = updateCount
        // A recovery intake commits after rollback, before conflict recording.
        if (transactions === 2)
          command.payload._offlineRecovery = recoveryMarker
        throw error
      }
    },
  } as unknown as PrismaClient
  await expect(
    reviewOfflineConflict(db, {
      actorUserId: "active-manager",
      commandId: command.id,
      decision: "approve",
      tenantId: "tenant-a",
    }),
  ).rejects.toThrow("management recovery")
  expect(transactions).toBe(3)
  expect(persistedAudits).toEqual([])
  expect(persistedUpdates).toHaveLength(1)
  expect(persistedUpdates[0]).toMatchObject({
    attemptedState: { _offlineCommandAttempt: { version: 1, kind: "approve" } },
  })
  expect(Object.keys(persistedUpdates[0] as object)).toEqual(["attemptedState"])
  expect(command.payload._offlineRecovery).toEqual(recoveryMarker)
})

test("normal replay refuses durable and legacy revocation even with an ACTIVE owned row", async () => {
  for (const source of ["durable", "legacy"] as const) {
    let commandReads = 0
    const db = {
      offlineDevice: {
        async findFirst() {
          return { id: "device-row-a" }
        },
        async findUnique() {
          return { status: "ACTIVE" }
        },
      },
      offlineDeviceRevocation: {
        async findFirst() {
          return source === "durable" ? { id: "revocation" } : null
        },
      },
      tenant: {
        async findFirstOrThrow() {
          return {
            metadata: {
              retailOps: {
                revokedOfflineDevices:
                  source === "legacy"
                    ? [
                        {
                          deviceId: "registered-device",
                          actorUserId: "actor-a",
                          registeredAt: "2026-01-01T00:00:00Z",
                          lastSeenAt: "2026-01-02T00:00:00Z",
                          revokedAt: "2026-01-03T00:00:00Z",
                          revokedByUserId: "admin",
                          storeId: "store-a",
                          platform: "android",
                        },
                      ]
                    : [],
              },
            },
          }
        },
      },
      offlineCommand: {
        async findUnique() {
          commandReads++
          throw Error("No command should be read")
        },
      },
    } as unknown as PrismaClient
    await expect(
      replayOfflineCommands(db, {
        acceptNewCommands: true,
        actorUserId: "actor-a",
        capabilities: { operateOrders: true },
        commands: [envelope],
        deviceId: "registered-device",
        requiresApproval: false,
        storeId: "store-a",
        tenantId: "tenant-a",
      }),
    ).rejects.toMatchObject({ code: "DEVICE_REVOKED" })
    expect(commandReads).toBe(0)
  }
})

test("an existing same-hash command cannot reconcile through another actor, Store or device", async () => {
  // Obtain the actual envelope digest from staging, never duplicate the private hash.
  let saved: Record<string, unknown> | undefined
  const db = {
    $transaction: async (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      fn({
        ...db,
        $executeRaw: async () => 1,
        $queryRaw: async (strings: TemplateStringsArray) => {
          const sql = strings.join(" ")
          if (sql.includes('FROM "Tenant"'))
            return [{ id: "tenant-a", metadata: null }]
          if (sql.includes('FROM "Membership"'))
            return [
              {
                role: "CASHIER",
                status: "ACTIVE",
                staffAccessMode: "LEGACY",
                isActive: true,
              },
            ]
          if (sql.includes('FROM "Store"'))
            return [{ id: "store-a", currencyCode: "NGN" }]
          return []
        },
      } as unknown as Prisma.TransactionClient),
    offlineDevice: {
      async findFirst() {
        return { id: "device-row-a" }
      },
      async findUnique() {
        return { status: "ACTIVE" }
      },
    },
    offlineDeviceRevocation: {
      async findFirst() {
        return null
      },
    },
    tenant: {
      async findFirstOrThrow() {
        return { metadata: null }
      },
    },
    offlineCommand: {
      async findUnique() {
        return saved ?? null
      },
      async create({ data }: { data: Record<string, unknown> }) {
        saved = {
          id: "command-row-a",
          conflictCode: null,
          conflictMessage: null,
          authoritativeState: null,
          result: null,
          processedAt: null,
          status: "REVIEW_REQUIRED",
          ...data,
        }
        return saved
      },
      async findMany() {
        return []
      },
    },
  } as unknown as PrismaClient
  const input = {
    acceptNewCommands: true,
    actorUserId: "actor-a",
    capabilities: { operateOrders: true },
    commands: [envelope],
    deviceId: "registered-device",
    requiresApproval: true,
    storeId: "store-a",
    tenantId: "tenant-a",
  }
  await replayOfflineCommands(db, input)
  if (!saved) throw Error("Expected staged immutable command")
  const original = JSON.stringify(saved)
  for (const changed of [{ actorUserId: "actor-b" }, { storeId: "store-b" }])
    await expect(
      replayOfflineCommands(db, { ...input, ...changed }),
    ).rejects.toThrow("another account, device or Store")
  saved.offlineDeviceId = "other-device-row"
  await expect(replayOfflineCommands(db, input)).rejects.toThrow(
    "another account, device or Store",
  )
  saved.offlineDeviceId = "device-row-a"
  expect(JSON.stringify(saved)).toBe(original)
  expect((await replayOfflineCommands(db, input))[0]?.status).toBe(
    "REVIEW_REQUIRED",
  )
})
