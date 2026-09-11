import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  completeStoreConversationWhatsAppRecovery,
  holdStoreConversationWhatsAppAmbiguousRecovery,
  listDueStoreConversationWhatsAppRecoveries,
} from "./store-conversation-whatsapp-recovery-repository"

function createDb(input: { existingAttempt?: Record<string, unknown> | null } = {}) {
  const writes: Array<{ data: unknown; model: string; where?: unknown }> = []
  const client = {
    $queryRaw: async () => [{ id: "inbound_1" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    customerEntryPoint: {
      findFirst: async () => ({ id: "entry_1" }),
    },
    storeConversationWhatsAppRecoveryAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "recovery_attempt" })
        return { ...data, id: "attempt_1" }
      },
      findFirst: async () => ({ inboundEventId: "inbound_1" }),
      findMany: async (query: Record<string, unknown>) => {
        writes.push({ data: query, model: "recovery_list" })
        return [
          { id: "attempt_1", storeId: "store_1", tenantId: "tenant_1" },
        ]
      },
      findUnique: async () => input.existingAttempt ?? null,
      update: async ({ data, where }: Record<string, unknown>) => {
        writes.push({ data, model: "recovery_attempt_update", where })
        return { id: "attempt_1" }
      },
    },
    whatsAppInboundEvent: {
      findUnique: async () => ({
        connectionId: "connection_1",
        id: "inbound_1",
        routeVertical: "SERVICE",
        status: "RECEIVED",
        storeConversationCandidate: null,
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
      updateMany: async ({ data, where }: Record<string, unknown>) => {
        writes.push({ data, model: "inbound_event", where })
        return { count: 1 }
      },
    },
  }
  return { client: client as unknown as PrismaClient, writes }
}

const scope = {
  connectionId: "connection_1",
  inboundEventId: "inbound_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Store Conversation WhatsApp ambiguous recovery repository", () => {
  test("holds one exact inbound event behind an identifier-only recovery attempt", async () => {
    const db = createDb()
    const result = await holdStoreConversationWhatsAppAmbiguousRecovery(
      db.client,
      scope,
    )

    expect(result).toEqual({ attemptId: "attempt_1", replayed: false })
    expect(db.writes).toContainEqual({
      data: {
        connectionId: "connection_1",
        inboundEventId: "inbound_1",
        kind: "AMBIGUOUS_CANDIDATE",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
      model: "recovery_attempt",
    })
    expect(db.writes).toContainEqual({
      data: { status: "AWAITING_CUSTOMER_CHOICE" },
      model: "inbound_event",
      where: { id: "inbound_1", status: "RECEIVED" },
    })
    expect(JSON.stringify(db.writes)).not.toMatch(/externalCustomer|message|content/i)
  })

  test("replays the existing attempt without creating another outbox row", async () => {
    const db = createDb({
      existingAttempt: {
        connectionId: "connection_1",
        id: "attempt_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })

    const result = await holdStoreConversationWhatsAppAmbiguousRecovery(
      db.client,
      scope,
    )

    expect(result).toEqual({ attemptId: "attempt_1", replayed: true })
    expect(
      db.writes.filter((write) => write.model === "recovery_attempt"),
    ).toHaveLength(0)
  })

  test("completes the attempt and held inbound event in one transaction", async () => {
    const db = createDb()
    const result = await completeStoreConversationWhatsAppRecovery(db.client, {
      attemptId: "attempt_1",
      claimToken: "claim_1",
      now: new Date("2026-08-16T12:00:00.000Z"),
      providerReferenceDigest: "d".repeat(64),
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(result).toEqual({ sent: true })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        providerReferenceDigest: "d".repeat(64),
        status: "SENT",
      }),
      model: "recovery_attempt_update",
      where: { id: "attempt_1" },
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        failureCode: "ambiguous_candidate_recovery_sent",
        status: "IGNORED",
      }),
      model: "inbound_event",
      where: { id: "inbound_1", status: "AWAITING_CUSTOMER_CHOICE" },
    })
  })

  test("lists only bounded due attempt identifiers", async () => {
    const db = createDb()
    const result = await listDueStoreConversationWhatsAppRecoveries(db.client, {
      limit: 999,
      now: new Date("2026-08-16T12:00:00.000Z"),
    })

    expect(result).toEqual([
      { attemptId: "attempt_1", storeId: "store_1", tenantId: "tenant_1" },
    ])
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        select: { id: true, storeId: true, tenantId: true },
        take: 100,
      }),
      model: "recovery_list",
    })
  })
})
