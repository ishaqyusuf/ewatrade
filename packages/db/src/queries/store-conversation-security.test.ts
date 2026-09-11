import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  approveStoreConversationSecurityChallenge,
  consumeStoreConversationSecurityChallenge,
  evaluateStoreConversationSecurity,
} from "./store-conversation-security"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const baseInput = {
  actionCost: 1,
  bridge: "none" as const,
  challengeTokenCandidate: "proof-token-that-is-long-enough-for-a-challenge",
  clientOperationId: "security-operation-1",
  conversationId: "conversation_private_1",
  deviceKey: "device_private_1",
  media: "none" as const,
  networkRisk: "low" as const,
  networkRiskKey: "network_private_1",
  principalKey: "guest_private_1",
  purpose: "message" as const,
  storeEntryKey: "entry_private_1",
  storeId: "store_private_1",
  tenantId: "tenant_private_1",
  verification: "unverified" as const,
}

function evaluationClient(
  writes: Record<string, unknown>[],
  counts: Partial<Record<string, number>> = {},
) {
  let event: Record<string, unknown> | null = null
  let challenge: Record<string, unknown> | null = null
  const transaction = {
    storeConversationSecurityChallenge: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        challenge = { id: "challenge_1", ...data }
        writes.push({ model: "challenge", ...data })
        return challenge
      },
    },
    storeConversationSecurityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        event = { id: "security_event_1", ...data }
        writes.push({ model: "event", ...data })
        return event
      },
      findUnique: async () => (event ? { ...event, challenge } : null),
    },
    storeConversationSecurityWindow: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        writes.push({ model: "window", ...create })
        return { count: counts[String(create.scopeKind)] ?? 1 }
      },
    },
  }
  return dbClient({
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
  })
}

describe("Store Conversation security repository", () => {
  test("persists only digest-scoped evidence for an allowed fixed-window decision", async () => {
    const writes: Record<string, unknown>[] = []
    const result = await evaluateStoreConversationSecurity(
      evaluationClient(writes),
      baseInput,
      { now: new Date("2026-08-23T12:34:30.000Z") },
    )

    expect(result).toMatchObject({
      challenge: null,
      decision: "allow",
      reason: "within_bounded_usage",
      replayed: false,
    })
    const persisted = JSON.stringify(writes)
    for (const secret of [
      baseInput.principalKey,
      baseInput.deviceKey,
      baseInput.storeEntryKey,
      baseInput.networkRiskKey,
      baseInput.storeId,
      baseInput.tenantId,
      baseInput.conversationId,
      baseInput.challengeTokenCandidate,
    ]) {
      expect(persisted).not.toContain(secret)
    }
    expect(writes.filter((write) => write.model === "window")).toHaveLength(5)
  })

  test("issues and exactly replays a digest-only challenge for network scrutiny", async () => {
    const writes: Record<string, unknown>[] = []
    const client = evaluationClient(writes)
    const input = {
      ...baseInput,
      clientOperationId: "security-operation-network",
      networkRisk: "high" as const,
    }

    const first = await evaluateStoreConversationSecurity(client, input)
    const replay = await evaluateStoreConversationSecurity(client, input)

    expect(first).toMatchObject({
      challenge: {
        id: "challenge_1",
        proofToken: baseInput.challengeTokenCandidate,
      },
      decision: "challenge",
      replayed: false,
    })
    expect(replay).toMatchObject({
      challenge: { id: "challenge_1" },
      decision: "challenge",
      replayed: true,
    })
    expect(writes.filter((write) => write.model === "challenge")).toHaveLength(
      1,
    )
  })

  test("denies a multi-signal burst without issuing a challenge", async () => {
    const writes: Record<string, unknown>[] = []
    const result = await evaluateStoreConversationSecurity(
      evaluationClient(writes, {
        DEVICE: 36,
        PRINCIPAL: 36,
        STORE_ENTRY: 70,
      }),
      {
        ...baseInput,
        actionCost: 5,
        clientOperationId: "security-operation-burst",
      },
    )

    expect(result).toMatchObject({
      challenge: null,
      decision: "deny",
      reason: "multi_signal_limit_exceeded",
    })
    expect(writes.some((write) => write.model === "challenge")).toBe(false)
  })

  test("approves then consumes only an exact unexpired one-time digest proof", async () => {
    const calls: Array<Record<string, unknown>> = []
    const client = dbClient({
      storeConversationSecurityChallenge: {
        updateMany: async (input: Record<string, unknown>) => {
          calls.push(input)
          return { count: 1 }
        },
      },
    })
    const proof = {
      challengeId: "challenge_1",
      principalKey: baseInput.principalKey,
      proofToken: baseInput.challengeTokenCandidate,
      purpose: "message" as const,
    }

    await expect(
      approveStoreConversationSecurityChallenge(client, proof),
    ).resolves.toEqual({ challengeId: "challenge_1", status: "approved" })
    await expect(
      consumeStoreConversationSecurityChallenge(client, proof),
    ).resolves.toEqual({ challengeId: "challenge_1", status: "consumed" })
    expect(calls[0]?.where).toMatchObject({ status: "ISSUED" })
    expect(calls[1]?.where).toMatchObject({ status: "APPROVED" })
    expect(JSON.stringify(calls)).not.toContain(baseInput.principalKey)
    expect(JSON.stringify(calls)).not.toContain(
      baseInput.challengeTokenCandidate,
    )
  })
})
