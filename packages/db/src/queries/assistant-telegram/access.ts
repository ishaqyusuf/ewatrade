import type { PrismaClient } from "../../../generated/prisma/client"
import { isAccountPrivacyAccessBlocked } from "../account-privacy-access"
import { readAssistantChannelScope } from "../assistant-channel-authority"
import { isLegalSignupSessionBlocked } from "../legal-session-access"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { getCustomerAccountAgeStatus } from "../store-conversation-age-authority"
import type { DbClient } from "../types"
import {
  type TelegramSender,
  isTelegramId,
  lockTelegramSender,
} from "./authority"
import { cancelTelegramWork, connectedTelegramMessage } from "./link"

/**
 * Why a connected chat lost its access (Workshop a-lost, a-expired).
 * `removed`: the business side ended it (membership, Store access or role
 * removed, or the grant was revoked). `idle`: 7 days without use. `expired`:
 * the 30-day grant ran out. The reason never names who changed anything.
 */
export type AssistantTelegramAccessEndReason = "removed" | "idle" | "expired"

export type AssistantTelegramAccessEnded = {
  reason: AssistantTelegramAccessEndReason
  /** Null when the grant itself is gone, so no name can be shown safely. */
  businessName: string | null
  storeName: string | null
  /** The pinned Connected message to edit to Disconnected, when known. */
  connectedMessage: Awaited<ReturnType<typeof connectedTelegramMessage>>
}

/** Account-level blocks are not business decisions and keep the neutral entry reply. */
async function accountBlocked(db: DbClient, userId: string) {
  return (
    !(await getCustomerAccountAgeStatus(db, userId)).eligible ||
    (await isAccountPrivacyAccessBlocked(db, userId)) ||
    (await isLegalSignupSessionBlocked(db, userId))
  )
}

/**
 * Applied lazily on the chat's next message (no scheduled job): when the
 * active binding can no longer be used, close it once and say why. Returns
 * null when the chat was not connected, when access is still valid (other
 * rejections stay silent), or when the reason is not the business's to tell.
 */
export function endAssistantTelegramAccess(
  db: PrismaClient,
  input: TelegramSender & {
    allowedUserIds?: ReadonlySet<string>
    allowedTenantIds?: ReadonlySet<string>
  },
  now = new Date(),
): Promise<AssistantTelegramAccessEnded | null> {
  if (
    !isTelegramId(input.botId) ||
    !isTelegramId(input.userId) ||
    !isTelegramId(input.chatId)
  )
    return Promise.resolve(null)
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockTelegramSender(tx, input)
    await tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE "botId"=${input.botId} AND "telegramUserId"=${input.userId} FOR UPDATE`
    const identity = await tx.assistantTelegramIdentity.findFirst({
      where: {
        botId: input.botId,
        telegramUserId: input.userId,
        chatId: input.chatId,
        revokedAt: null,
      },
      select: { id: true, userId: true, activeBindingId: true },
    })
    if (!identity?.activeBindingId) return null
    if (input.allowedUserIds && !input.allowedUserIds.has(identity.userId))
      return null
    const binding = await tx.assistantTelegramBinding.findFirst({
      where: { id: identity.activeBindingId, identityId: identity.id },
      select: {
        grant: {
          select: {
            id: true,
            tenantId: true,
            storeId: true,
            membershipId: true,
            revokedAt: true,
            expiresAt: true,
            idleExpiresAt: true,
            tenant: { select: { name: true, qaPurgeStartedAt: true } },
            store: { select: { name: true } },
          },
        },
      },
    })
    const grant = binding?.grant
    if (
      grant &&
      input.allowedTenantIds &&
      !input.allowedTenantIds.has(grant.tenantId)
    )
      return null
    let reason: AssistantTelegramAccessEndReason
    // A deleted membership cascades to its grant and binding: access was removed.
    if (!grant || grant.revokedAt) reason = "removed"
    else if (
      !(await readAssistantChannelScope(tx, {
        userId: identity.userId,
        tenantId: grant.tenantId,
        storeId: grant.storeId,
        membershipId: grant.membershipId,
      }))
    ) {
      if (
        grant.tenant.qaPurgeStartedAt ||
        (await accountBlocked(tx, identity.userId))
      )
        return null
      reason = "removed"
    } else if (
      grant.idleExpiresAt <= now &&
      grant.idleExpiresAt < grant.expiresAt
    )
      reason = "idle"
    else if (grant.expiresAt <= now) reason = "expired"
    else return null

    await tx.assistantTelegramIdentity.update({
      where: { id: identity.id },
      data: { activeBindingId: null, selectionGeneration: { increment: 1 } },
    })
    if (grant && reason === "removed" && !grant.revokedAt)
      await tx.assistantTelegramGrant.update({
        where: { id: grant.id },
        data: { revokedAt: now, generation: { increment: 1 } },
      })
    await cancelTelegramWork(tx, { identityId: identity.id }, now)
    return {
      reason,
      businessName: grant?.tenant.name ?? null,
      storeName: grant?.store.name ?? null,
      // Without the grant the latest Connected message may belong to another
      // business, so it is left alone (the pin and menu are still reset).
      connectedMessage: grant
        ? await connectedTelegramMessage(tx, {
            botId: input.botId,
            telegramUserId: input.userId,
            chatId: input.chatId,
            tenantId: grant.tenantId,
          })
        : null,
    }
  })
}
