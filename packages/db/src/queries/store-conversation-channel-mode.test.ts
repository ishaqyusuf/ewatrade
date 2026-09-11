import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationChannelModeError,
  getStoreConversationChannelModeConfiguration,
  updateStoreConversationChannelMode,
} from "./store-conversation-channel-mode"

type StoredConfiguration = {
  desiredMode: "EWATRADE_CHAT" | "WHATSAPP" | "BOTH"
  id: string
  reason: string
  revision: number
  storeId: string
  tenantId: string
  updatedByUserId: string
}

function createDb(
  access: { membership?: boolean; store?: boolean } = {
    membership: true,
    store: true,
  },
) {
  let configuration: StoredConfiguration | null = null
  const commands: Array<Record<string, unknown>> = []
  const audits: Array<Record<string, unknown>> = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    membership: {
      findFirst: async () =>
        access.membership === false ? null : { id: "membership_1" },
    },
    store: {
      findFirst: async () =>
        access.store === false ? null : { id: "store_1" },
    },
    storeConversationChannelConfiguration: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        configuration = {
          desiredMode: data.desiredMode as StoredConfiguration["desiredMode"],
          id: "channel_configuration_1",
          reason: data.reason as string,
          revision: 1,
          storeId: data.storeId as string,
          tenantId: data.tenantId as string,
          updatedByUserId: data.updatedByUserId as string,
        }
        return configuration
      },
      findUnique: async () => configuration,
      updateMany: async ({
        data,
        where,
      }: { data: Record<string, unknown>; where: Record<string, unknown> }) => {
        if (!configuration || configuration.revision !== where.revision) {
          return { count: 0 }
        }
        configuration = {
          ...configuration,
          desiredMode: data.desiredMode as StoredConfiguration["desiredMode"],
          reason: data.reason as string,
          revision: configuration.revision + 1,
          updatedByUserId: data.updatedByUserId as string,
        }
        return { count: 1 }
      },
    },
    storeConversationChannelConfigurationCommand: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        commands.push(data)
        return { id: `command_${commands.length}`, ...data }
      },
      findUnique: async ({
        where,
      }: {
        where: {
          configurationId_clientOperationId: {
            clientOperationId: string
            configurationId: string
          }
        }
      }) => {
        const key = where.configurationId_clientOperationId
        return (
          commands.find(
            (command) =>
              command.configurationId === key.configurationId &&
              command.clientOperationId === key.clientOperationId,
          ) ?? null
        )
      },
    },
    storeConversationChannelConfigurationAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data)
        return { id: `audit_${audits.length}`, ...data }
      },
    },
  }

  return {
    audits,
    client: client as unknown as PrismaClient,
    commands,
    getConfiguration: () => configuration,
  }
}

const command = {
  actorUserId: "owner_1",
  clientOperationId: "channel-mode-operation-0001",
  desiredMode: "both" as const,
  expectedRevision: 0,
  reason: "Offer both eligible customer channels",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Store Conversation channel mode repository", () => {
  test("projects the additive EwaTrade Chat compatibility default", async () => {
    const db = createDb()

    await expect(
      getStoreConversationChannelModeConfiguration(db.client, {
        actorUserId: "owner_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).resolves.toEqual({ desiredMode: "ewatrade_chat", revision: 0 })
  })

  test("writes one payload-bound command and immutable audit", async () => {
    const db = createDb()

    const first = await updateStoreConversationChannelMode(db.client, command)
    const replay = await updateStoreConversationChannelMode(db.client, command)

    expect(first).toEqual({
      desiredMode: "both",
      replayed: false,
      revision: 1,
    })
    expect(replay).toEqual({
      desiredMode: "both",
      replayed: true,
      revision: 1,
    })
    expect(db.commands).toHaveLength(1)
    expect(db.audits).toHaveLength(1)
    expect(db.audits[0]).toMatchObject({
      actorUserId: "owner_1",
      fromMode: null,
      revision: 1,
      storeId: "store_1",
      tenantId: "tenant_1",
      toMode: "BOTH",
      type: "UPDATED",
    })
    await expect(
      updateStoreConversationChannelMode(db.client, {
        ...command,
        desiredMode: "whatsapp",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("rejects stale revisions without changing configuration", async () => {
    const db = createDb()
    await updateStoreConversationChannelMode(db.client, command)

    await expect(
      updateStoreConversationChannelMode(db.client, {
        ...command,
        clientOperationId: "channel-mode-operation-stale",
        desiredMode: "ewatrade_chat",
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(db.getConfiguration()).toMatchObject({
      desiredMode: "BOTH",
      revision: 1,
    })
    expect(db.audits).toHaveLength(1)
  })

  test("uses the revisioned Store mode as a reversible cohort switch", async () => {
    const db = createDb()

    await updateStoreConversationChannelMode(db.client, command)
    await updateStoreConversationChannelMode(db.client, {
      ...command,
      clientOperationId: "channel-mode-operation-whatsapp-only",
      desiredMode: "whatsapp",
      expectedRevision: 1,
    })
    const rolledBack = await updateStoreConversationChannelMode(db.client, {
      ...command,
      clientOperationId: "channel-mode-operation-rollback-chat",
      desiredMode: "ewatrade_chat",
      expectedRevision: 2,
      reason: "Rollback this Store cohort to EwaTrade Chat",
    })

    expect(rolledBack).toEqual({
      desiredMode: "ewatrade_chat",
      replayed: false,
      revision: 3,
    })
    expect(db.getConfiguration()).toMatchObject({
      desiredMode: "EWATRADE_CHAT",
      revision: 3,
    })
    expect(db.audits).toEqual([
      expect.objectContaining({ fromMode: null, revision: 1, toMode: "BOTH" }),
      expect.objectContaining({
        fromMode: "BOTH",
        revision: 2,
        toMode: "WHATSAPP",
      }),
      expect.objectContaining({
        fromMode: "WHATSAPP",
        revision: 3,
        toMode: "EWATRADE_CHAT",
      }),
    ])
  })

  test("allows only one of two concurrent writes at the same revision", async () => {
    const db = createDb()
    await updateStoreConversationChannelMode(db.client, command)

    const results = await Promise.allSettled([
      updateStoreConversationChannelMode(db.client, {
        ...command,
        clientOperationId: "channel-mode-operation-concurrent-chat",
        desiredMode: "ewatrade_chat",
        expectedRevision: 1,
      }),
      updateStoreConversationChannelMode(db.client, {
        ...command,
        clientOperationId: "channel-mode-operation-concurrent-whatsapp",
        desiredMode: "whatsapp",
        expectedRevision: 1,
      }),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
    expect(db.getConfiguration()?.revision).toBe(2)
    expect(db.commands).toHaveLength(2)
    expect(db.audits).toHaveLength(2)
  })

  test("rejects foreign Store scope and non-manager actors before writes", async () => {
    for (const access of [
      { membership: false, store: true },
      { membership: true, store: false },
    ]) {
      const db = createDb(access)
      await expect(
        updateStoreConversationChannelMode(db.client, command),
      ).rejects.toBeInstanceOf(StoreConversationChannelModeError)
      expect(db.commands).toHaveLength(0)
      expect(db.audits).toHaveLength(0)
    }
  })
})
