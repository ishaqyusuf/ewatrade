import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  expireStoreConversationGuestCredential,
  listDueStoreConversationGuestCredentialExpiries,
} from "./store-conversation-credential-expiry"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

describe("Store Conversation Guest credential expiry", () => {
  test("lists only bounded credential identifiers", async () => {
    const queries: Record<string, unknown>[] = []
    const result = await listDueStoreConversationGuestCredentialExpiries(
      dbClient({
        storeConversationGuestCredential: {
          findMany: async (query: Record<string, unknown>) => {
            queries.push(query)
            return [{ id: "credential_1" }]
          },
        },
      }),
      { limit: 1, now: new Date("2026-08-23T12:00:00.000Z") },
    )

    expect(result).toEqual([{ credentialId: "credential_1" }])
    expect(JSON.stringify(result)).not.toMatch(/token|device|guest|contact/)
    expect(queries[0]).toMatchObject({ select: { id: true }, take: 1 })
  })

  test("expires one due credential and revokes only its push endpoints", async () => {
    const pushScopes: Record<string, unknown>[] = []
    const transaction = {
      storeConversationGuestCredential: {
        updateMany: async () => ({ count: 1 }),
      },
      storeConversationPushEndpoint: {
        updateMany: async ({ where }: { where: Record<string, unknown> }) => {
          pushScopes.push(where)
          return { count: 2 }
        },
      },
    }
    const result = await expireStoreConversationGuestCredential(
      dbClient({
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback(transaction),
      }),
      { credentialId: "credential_1" },
    )

    expect(result).toEqual({ credentialId: "credential_1", replayed: false })
    expect(pushScopes).toEqual([
      { guestCredentialId: "credential_1", status: "ACTIVE" },
    ])
  })
})
