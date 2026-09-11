import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { digestStoreConversationValue } from "./store-conversations-core"
import { rotateStoreConversationGuestCredential } from "./store-conversation-guest-security"

const sourceToken = "source-credential-token-with-enough-entropy"
const targetToken = "target-credential-token-with-enough-entropy"
const now = new Date("2026-08-16T12:00:00.000Z")

function createDb() {
  const writes: unknown[] = []
  const source = {
    deviceBindingDigest: null,
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    guestIdentity: { id: "guest_1", status: "ACTIVE" },
    guestIdentityId: "guest_1",
    id: "credential_source",
    overlapExpiresAt: null as Date | null,
    purpose: "WEB_DEVICE",
    rotatedToCredentialId: null as string | null,
    status: "ACTIVE",
    tokenDigest: digestStoreConversationValue(sourceToken),
  }
  let target: Record<string, unknown> | null = null
  let rotation: Record<string, unknown> | null = null
  const client = {
    $queryRaw: async () => [{ id: source.id }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    storeConversationGuestCredential: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        target = {
          ...data,
          guestIdentity: source.guestIdentity,
          id: "credential_target",
          overlapExpiresAt: null,
          rotatedToCredentialId: null,
          status: "ACTIVE",
        }
        writes.push({ data, model: "credential_create" })
        return target
      },
      findFirst: async () => source,
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === source.id ? source : target,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(source, data)
        writes.push({ data, model: "credential_rotate" })
        return { count: 1 }
      },
    },
    storeConversationGuestCredentialRotation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        rotation = { ...data, id: "rotation_1" }
        writes.push({ data, model: "rotation" })
        return rotation
      },
      findUnique: async () =>
        rotation && target
          ? { ...rotation, targetCredential: target }
          : null,
    },
  }
  return { client: client as unknown as PrismaClient, writes }
}

describe("Store Conversation Guest credential rotation", () => {
  test("rotates once with bounded overlap and replays from a caller-staged target token", async () => {
    const db = createDb()
    const input = {
      clientOperationId: "rotate-operation-0001",
      credentialToken: sourceToken,
      now,
      targetCredentialToken: targetToken,
    }

    const first = await rotateStoreConversationGuestCredential(db.client, input)
    const replay = await rotateStoreConversationGuestCredential(db.client, input)

    expect(first).toEqual({
      credentialExpiresAt: new Date("2027-02-12T12:00:00.000Z"),
      credentialToken: targetToken,
      overlapExpiresAt: new Date("2026-08-16T12:10:00.000Z"),
      replayed: false,
    })
    expect(replay).toEqual({ ...first, replayed: true })
    expect(db.writes).toHaveLength(3)
    expect(JSON.stringify(db.writes)).not.toContain(targetToken)
    expect(JSON.stringify(db.writes)).toContain(
      digestStoreConversationValue(targetToken),
    )
  })

  test("rejects a changed target token on operation replay", async () => {
    const db = createDb()
    const input = {
      clientOperationId: "rotate-operation-0002",
      credentialToken: sourceToken,
      now,
      targetCredentialToken: targetToken,
    }
    await rotateStoreConversationGuestCredential(db.client, input)

    await expect(
      rotateStoreConversationGuestCredential(db.client, {
        ...input,
        targetCredentialToken: "different-target-credential-token-value",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})
