import {
  storeConversationGuestCredentialRotationInputSchema,
  type StoreConversationGuestCredentialRotationProjection,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationGuestCredentialPurpose,
  StoreConversationGuestCredentialStatus,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  GUEST_CREDENTIAL_LIFETIME_MS,
  StoreConversationError,
  digestStoreConversationValue,
  resolveStoreConversationGuestCredential,
  storeConversationPayloadHash,
} from "./store-conversations-core"

export const STORE_CONVERSATION_GUEST_CREDENTIAL_OVERLAP_MS = 10 * 60 * 1_000

function projectRotation(input: {
  credentialExpiresAt: Date
  credentialToken: string
  overlapExpiresAt: Date
  replayed: boolean
}): StoreConversationGuestCredentialRotationProjection {
  return input
}

export async function rotateStoreConversationGuestCredential(
  db: PrismaClient,
  input: {
    clientOperationId: string
    credentialToken: string
    installationToken?: string
    now?: Date
    purpose?: StoreConversationGuestCredentialPurpose
    targetCredentialToken: string
  },
) {
  const parsed = storeConversationGuestCredentialRotationInputSchema.parse({
    clientOperationId: input.clientOperationId,
    targetCredentialToken: input.targetCredentialToken,
  })
  const now = input.now ?? new Date()
  const purpose =
    input.purpose ?? StoreConversationGuestCredentialPurpose.WEB_DEVICE
  const targetTokenDigest = digestStoreConversationValue(
    parsed.targetCredentialToken,
  )

  return runStoreConversationActionTransaction(db, async (tx) => {
    const source = await resolveStoreConversationGuestCredential(tx, {
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose,
    })
    const payloadHash = storeConversationPayloadHash({
      deviceBindingDigest: source.deviceBindingDigest,
      purpose,
      sourceCredentialId: source.id,
      targetTokenDigest,
    })
    const replay =
      await tx.storeConversationGuestCredentialRotation.findUnique({
        include: { targetCredential: true },
        where: {
          guestIdentityId_clientOperationId: {
            clientOperationId: parsed.clientOperationId,
            guestIdentityId: source.guestIdentityId,
          },
        },
      })
    if (replay) {
      if (
        replay.payloadHash !== payloadHash ||
        replay.sourceCredentialId !== source.id ||
        replay.targetCredential.tokenDigest !== targetTokenDigest ||
        replay.targetCredential.purpose !== purpose
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This guest-session rotation does not match the original request.",
        )
      }
      if (
        replay.targetCredential.status !==
          StoreConversationGuestCredentialStatus.ACTIVE ||
        replay.targetCredential.expiresAt <= now
      ) {
        throw new StoreConversationError(
          "GUEST_CREDENTIAL_EXPIRED",
          "This rotated guest session is no longer available.",
        )
      }
      return projectRotation({
        credentialExpiresAt: replay.targetCredential.expiresAt,
        credentialToken: parsed.targetCredentialToken,
        overlapExpiresAt: replay.overlapExpiresAt,
        replayed: true,
      })
    }

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StoreConversationGuestCredential"
      WHERE "id" = ${source.id}
      FOR UPDATE
    `)
    const current = await tx.storeConversationGuestCredential.findUnique({
      where: { id: source.id },
    })
    if (
      !current ||
      current.status !== StoreConversationGuestCredentialStatus.ACTIVE ||
      current.expiresAt <= now ||
      current.rotatedToCredentialId
    ) {
      throw new StoreConversationError(
        "GUEST_CREDENTIAL_EXPIRED",
        "This guest session has already changed. Refresh and try again.",
      )
    }
    if (current.tokenDigest === targetTokenDigest) {
      throw new StoreConversationError(
        "CONFLICT",
        "Choose a new guest-session credential.",
      )
    }

    const credentialExpiresAt = new Date(
      now.getTime() + GUEST_CREDENTIAL_LIFETIME_MS,
    )
    const overlapExpiresAt = new Date(
      now.getTime() + STORE_CONVERSATION_GUEST_CREDENTIAL_OVERLAP_MS,
    )
    const target = await tx.storeConversationGuestCredential.create({
      data: {
        deviceBindingDigest: current.deviceBindingDigest,
        expiresAt: credentialExpiresAt,
        guestIdentityId: current.guestIdentityId,
        lastUsedAt: now,
        purpose: current.purpose,
        tokenDigest: targetTokenDigest,
      },
    })
    const rotated = await tx.storeConversationGuestCredential.updateMany({
      data: {
        overlapExpiresAt,
        rotatedAt: now,
        rotatedToCredentialId: target.id,
        status: StoreConversationGuestCredentialStatus.ROTATED,
      },
      where: {
        id: current.id,
        rotatedToCredentialId: null,
        status: StoreConversationGuestCredentialStatus.ACTIVE,
      },
    })
    if (rotated.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "This guest session changed while it was being rotated.",
      )
    }
    await tx.storeConversationGuestCredentialRotation.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        guestIdentityId: current.guestIdentityId,
        overlapExpiresAt,
        payloadHash,
        purpose: current.purpose,
        sourceCredentialId: current.id,
        targetCredentialId: target.id,
      },
    })
    return projectRotation({
      credentialExpiresAt,
      credentialToken: parsed.targetCredentialToken,
      overlapExpiresAt,
      replayed: false,
    })
  })
}
