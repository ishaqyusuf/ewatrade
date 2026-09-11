import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationAvailabilityError,
  getStoreConversationAvailabilitySettings,
  setStoreConversationManualPause,
  updateStoreConversationAvailabilitySchedule,
} from "./store-conversation-availability"

function createDb(
  access: { membership?: boolean; store?: boolean } = {
    membership: true,
    store: true,
  },
) {
  let configuration: Record<string, unknown> | null = null
  const events: Array<Record<string, unknown>> = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    membership: {
      findFirst: async () =>
        access.membership === false ? null : { id: "membership_1" },
    },
    store: {
      findFirst: async () =>
        access.store === false
          ? null
          : {
              id: "store_1",
              storeConversationAvailabilityConfiguration: configuration,
              tenant: { timezone: "Africa/Lagos" },
            },
    },
    storeConversationAvailabilityAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data)
        return { id: `event_${events.length}`, ...data }
      },
      findUnique: async ({
        where,
      }: {
        where: {
          storeId_clientOperationId: {
            clientOperationId: string
            storeId: string
          }
        }
      }) => {
        const key = where.storeId_clientOperationId
        return (
          events.find(
            (event) =>
              event.storeId === key.storeId &&
              event.clientOperationId === key.clientOperationId,
          ) ?? null
        )
      },
    },
    storeConversationAvailabilityConfiguration: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        configuration = {
          customerWording: "TEMPORARILY_UNAVAILABLE",
          id: "availability_1",
          manualPaused: false,
          pausedAt: null,
          revision: 1,
          ...data,
        }
        return configuration
      },
      findUnique: async () => configuration,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (!configuration) throw new Error("missing configuration")
        const revision = configuration.revision as number
        configuration = {
          ...configuration,
          ...data,
          revision:
            typeof data.revision === "object" ? revision + 1 : data.revision,
        }
        return configuration
      },
    },
  }
  return {
    client: client as unknown as PrismaClient,
    events,
    getConfiguration: () => configuration,
  }
}

describe("Store Conversation availability repository", () => {
  test("projects the additive Tenant-timezone 24/7 compatibility default", async () => {
    const db = createDb()
    const settings = await getStoreConversationAvailabilitySettings(db.client, {
      actorUserId: "owner_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(settings).toMatchObject({
      customerWording: "temporarily_unavailable",
      manualPaused: false,
      revision: 0,
      timezone: "Africa/Lagos",
    })
    expect(settings.weeklyHours).toHaveLength(7)
  })

  test("writes one payload-bound schedule audit and returns its exact replay", async () => {
    const db = createDb()
    const input = {
      actorUserId: "owner_1",
      clientOperationId: "availability-schedule-0001",
      expectedRevision: 0,
      reason: "Set customer service hours",
      storeId: "store_1",
      tenantId: "tenant_1",
      timezone: "Africa/Lagos",
      unreadNotificationGraceSeconds: 45,
      weeklyHours: [{ dayOfWeek: 1, endMinute: 1_020, startMinute: 540 }],
    }

    const first = await updateStoreConversationAvailabilitySchedule(
      db.client,
      input,
    )
    const replay = await updateStoreConversationAvailabilitySchedule(
      db.client,
      input,
    )

    expect(first).toMatchObject({ replayed: false, revision: 1 })
    expect(replay).toMatchObject({ replayed: true, revision: 1 })
    expect(db.events).toHaveLength(1)
    expect(db.events[0]).toMatchObject({
      configurationRevision: 1,
      type: "SCHEDULE_UPDATED",
    })
    await expect(
      updateStoreConversationAvailabilitySchedule(db.client, {
        ...input,
        timezone: "Europe/London",
      }),
    ).rejects.toBeInstanceOf(StoreConversationAvailabilityError)
  })

  test("pauses and resumes with monotonic revision and rejects a stale command", async () => {
    const db = createDb()
    const paused = await setStoreConversationManualPause(db.client, {
      actorUserId: "owner_1",
      clientOperationId: "availability-pause-0001",
      customerWording: "temporarily_unavailable",
      expectedRevision: 0,
      paused: true,
      reason: "Temporary staffing shortage",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    const resumed = await setStoreConversationManualPause(db.client, {
      actorUserId: "owner_1",
      clientOperationId: "availability-resume-0001",
      customerWording: "temporarily_unavailable",
      expectedRevision: 1,
      paused: false,
      reason: "Staff coverage restored",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(paused).toMatchObject({ manualPaused: true, revision: 1 })
    expect(resumed).toMatchObject({ manualPaused: false, revision: 2 })
    expect(db.events.map((event) => event.type)).toEqual(["PAUSED", "RESUMED"])
    expect(db.getConfiguration()).toMatchObject({
      manualPaused: false,
      pauseReason: null,
      revision: 2,
    })
    await expect(
      setStoreConversationManualPause(db.client, {
        actorUserId: "owner_1",
        clientOperationId: "availability-pause-stale",
        customerWording: "temporarily_unavailable",
        expectedRevision: 1,
        paused: true,
        reason: "Stale command",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("rejects a foreign Store scope before configuration or audit writes", async () => {
    const db = createDb({ membership: true, store: false })

    await expect(
      updateStoreConversationAvailabilitySchedule(db.client, {
        actorUserId: "owner_1",
        clientOperationId: "availability-foreign-store",
        expectedRevision: 0,
        reason: "Must not cross Store scope",
        storeId: "store_foreign",
        tenantId: "tenant_1",
        timezone: "Africa/Lagos",
        unreadNotificationGraceSeconds: 45,
        weeklyHours: [{ dayOfWeek: 1, endMinute: 1_020, startMinute: 540 }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(db.events).toHaveLength(0)
    expect(db.getConfiguration()).toBeNull()
  })
})
