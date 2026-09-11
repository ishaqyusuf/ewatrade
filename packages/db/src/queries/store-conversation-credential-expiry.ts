import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationGuestCredentialStatus,
  StoreConversationPushEndpointStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"

export async function listDueStoreConversationGuestCredentialExpiries(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100)
  const now = input.now ?? new Date()
  const rows = await db.storeConversationGuestCredential.findMany({
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: limit,
    where: {
      OR: [
        {
          expiresAt: { lte: now },
          status: StoreConversationGuestCredentialStatus.ACTIVE,
        },
        {
          overlapExpiresAt: { lte: now },
          status: StoreConversationGuestCredentialStatus.ROTATED,
        },
      ],
    },
  })
  return rows.map((row) => ({ credentialId: row.id }))
}

export async function expireStoreConversationGuestCredential(
  db: PrismaClient,
  input: { credentialId: string; now?: Date },
) {
  const now = input.now ?? new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const expired = await tx.storeConversationGuestCredential.updateMany({
      data: { status: StoreConversationGuestCredentialStatus.EXPIRED },
      where: {
        id: input.credentialId,
        OR: [
          {
            expiresAt: { lte: now },
            status: StoreConversationGuestCredentialStatus.ACTIVE,
          },
          {
            overlapExpiresAt: { lte: now },
            status: StoreConversationGuestCredentialStatus.ROTATED,
          },
        ],
      },
    })
    if (expired.count !== 1) {
      const existing = await tx.storeConversationGuestCredential.findUnique({
        select: { status: true },
        where: { id: input.credentialId },
      })
      return existing?.status === StoreConversationGuestCredentialStatus.EXPIRED
        ? { credentialId: input.credentialId, replayed: true }
        : null
    }
    await tx.storeConversationPushEndpoint.updateMany({
      data: {
        invalidatedAt: now,
        status: StoreConversationPushEndpointStatus.REVOKED,
      },
      where: {
        guestCredentialId: input.credentialId,
        status: StoreConversationPushEndpointStatus.ACTIVE,
      },
    })
    return { credentialId: input.credentialId, replayed: false }
  })
}
