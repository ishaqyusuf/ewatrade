import {
  type StoreConversationAccountCandidateListProjection,
  type StoreConversationAccountDeviceProjection,
  type StoreConversationAccountInvitationState,
  type StoreConversationAccountLinkProjection,
  type StoreConversationAccountListProjection,
  projectStoreConversationAccountInvitation,
  storeConversationAccountCandidateListInputSchema,
  storeConversationAccountDeviceRevokeInputSchema,
  storeConversationAccountInvitationDismissInputSchema,
  storeConversationAccountLinkInputSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CustomerEntryPointStatus,
  StoreConversationAccountAccessStatus,
  StoreConversationAccountAuditOutcome,
  StoreConversationAccountAuditPurpose,
  StoreConversationAccountAuditType,
  StoreConversationAccountInvitationMilestone,
  StoreConversationAccountInvitationStatus,
  StoreConversationCommandKind,
  StoreConversationGuestAccessStatus,
  StoreConversationGuestCredentialPurpose,
  StoreConversationGuestCredentialStatus,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  StoreConversationError,
  digestStoreConversationValue,
  loadStoreConversationForGuest,
  lockStoreConversation,
  resolveStoreConversationEntry,
  resolveStoreConversationGuestCredential,
  storeConversationPayloadHash,
  touchStoreConversationGuestCredential,
} from "./store-conversations-core"
import type { DbClient } from "./types"

const MAX_ACCOUNT_DEVICES = 100

type GuestDeviceContext = {
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

type AccountCommandResult<Result> =
  | { ok: true; result: Result }
  | { code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND"; message: string; ok: false }

function invitationState(
  status: StoreConversationAccountInvitationStatus,
): StoreConversationAccountInvitationState {
  if (status === StoreConversationAccountInvitationStatus.DISMISSED) {
    return "dismissed"
  }
  if (status === StoreConversationAccountInvitationStatus.LINKED) {
    return "linked"
  }
  return "offered"
}

function projectStoreInitials(storeName: string) {
  const initials = storeName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  return initials || "ST"
}

function projectListMessageAuthor(author: StoreConversationMessageAuthorKind) {
  return author === StoreConversationMessageAuthorKind.CUSTOMER
    ? ("customer" as const)
    : author === StoreConversationMessageAuthorKind.STORE_ATTENDANT
      ? ("store" as const)
      : ("system" as const)
}

function encodeCandidateCursor(input: { id: string; lastActivityAt: Date }) {
  return Buffer.from(
    JSON.stringify({ id: input.id, lastActivityAt: input.lastActivityAt }),
  ).toString("base64url")
}

function decodeCandidateCursor(cursor?: string) {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { id?: unknown; lastActivityAt?: unknown }
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.lastActivityAt !== "string"
    ) {
      throw new Error("invalid cursor")
    }
    const lastActivityAt = new Date(parsed.lastActivityAt)
    if (Number.isNaN(lastActivityAt.getTime())) throw new Error("invalid date")
    return { id: parsed.id, lastActivityAt }
  } catch {
    throw new StoreConversationError(
      "CONFLICT",
      "This conversation list cursor is invalid. Refresh and try again.",
    )
  }
}

async function assertAccountUser(db: DbClient, accountUserId: string) {
  const account = await db.user.findUnique({
    select: { id: true },
    where: { id: accountUserId },
  })
  if (!account) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Customer Account access is unavailable.",
    )
  }
  return account
}

async function lockAccountUser(db: DbClient, accountUserId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "User"
      WHERE "id" = ${accountUserId}
      FOR UPDATE
    `,
  )
  if (rows.length !== 1) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Customer Account access is unavailable.",
    )
  }
}

async function lockGuestCredential(db: DbClient, credentialId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "StoreConversationGuestCredential"
      WHERE "id" = ${credentialId}
      FOR UPDATE
    `,
  )
  if (rows.length !== 1) {
    throw new StoreConversationError(
      "GUEST_CREDENTIAL_EXPIRED",
      "This guest session is unavailable. Start again from the Store link.",
    )
  }
}

async function recordDeniedAccountAudit(
  db: DbClient,
  input: {
    accountUserId: string
    clientOperationId: string
    credentialId?: string
    guestIdentityId?: string
    payloadHash?: string
    reasonCode: string
    scope?: {
      conversationId: string
      invitationId?: string
      storeId: string
      tenantId: string
    }
    type:
      | typeof StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED
      | typeof StoreConversationAccountAuditType.DEVICE_REVOCATION_DENIED
  },
) {
  await db.storeConversationAccountAuditEvent.create({
    data: {
      actorAccountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      credentialId: input.credentialId,
      guestIdentityId: input.guestIdentityId,
      outcome: StoreConversationAccountAuditOutcome.DENIED,
      payloadHash: input.payloadHash,
      purpose:
        input.type === StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED
          ? StoreConversationAccountAuditPurpose.ACCOUNT_ADOPTION
          : StoreConversationAccountAuditPurpose.DEVICE_SECURITY,
      reasonCode: input.reasonCode,
      type: input.type,
      ...(input.scope ?? {}),
    },
  })
}

export async function appendFirstReleasedQuoteAccountInvitationInTransaction(
  tx: DbClient,
  input: {
    conversationId: string
    quoteVersionId: string
    storeId: string
    tenantId: string
  },
) {
  const existing = await tx.storeConversationAccountInvitation.findUnique({
    select: { id: true, messageId: true },
    where: {
      conversationId_milestone: {
        conversationId: input.conversationId,
        milestone:
          StoreConversationAccountInvitationMilestone.FIRST_RELEASED_QUOTE,
      },
    },
  })
  if (existing) return { ...existing, replayed: true }

  await lockStoreConversation(tx, input)
  const conversation = await tx.storeConversation.findFirst({
    select: { id: true, lastMessageSequence: true },
    where: {
      id: input.conversationId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!conversation) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Store conversation is unavailable.",
    )
  }
  const afterLock = await tx.storeConversationAccountInvitation.findUnique({
    select: { id: true, messageId: true },
    where: {
      conversationId_milestone: {
        conversationId: input.conversationId,
        milestone:
          StoreConversationAccountInvitationMilestone.FIRST_RELEASED_QUOTE,
      },
    },
  })
  if (afterLock) return { ...afterLock, replayed: true }

  const occurredAt = new Date()
  const sequence = conversation.lastMessageSequence + 1
  const advanced = await tx.storeConversation.updateMany({
    data: {
      lastActivityAt: occurredAt,
      lastMessageSequence: sequence,
    },
    where: {
      id: conversation.id,
      lastMessageSequence: conversation.lastMessageSequence,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (advanced.count !== 1) {
    throw new StoreConversationError(
      "CONFLICT",
      "This Store conversation changed before the account invitation was added.",
    )
  }
  const message = await tx.storeConversationMessage.create({
    data: {
      authorKind: StoreConversationMessageAuthorKind.SYSTEM,
      body: "Account invitation",
      channel: StoreConversationMessageChannel.SYSTEM,
      conversationId: conversation.id,
      kind: StoreConversationMessageKind.ACCOUNT_INVITATION,
      occurredAt,
      sequence,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: { id: true },
  })
  const invitation = await tx.storeConversationAccountInvitation.create({
    data: {
      conversationId: conversation.id,
      messageId: message.id,
      milestone:
        StoreConversationAccountInvitationMilestone.FIRST_RELEASED_QUOTE,
      quoteVersionId: input.quoteVersionId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: { id: true, messageId: true },
  })
  return { ...invitation, replayed: false }
}

export async function dismissGuestStoreConversationAccountInvitation(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    installationToken?: string
    invitationId: string
    messageId: string
    publicToken: string
    purpose?: StoreConversationGuestCredentialPurpose
  },
) {
  const parsed = storeConversationAccountInvitationDismissInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    invitationId: input.invitationId,
    messageId: input.messageId,
    publicToken: input.publicToken,
  })
  const now = new Date()
  const payloadHash = storeConversationPayloadHash(parsed)
  return runStoreConversationActionTransaction(db, async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose:
        input.purpose ?? StoreConversationGuestCredentialPurpose.WEB_DEVICE,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (
        receipt.kind !==
          StoreConversationCommandKind.ACCOUNT_INVITATION_DISMISSED ||
        receipt.messageId !== parsed.messageId ||
        receipt.payloadHash !== payloadHash
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This invitation command was already used with different input.",
        )
      }
      const invitation = await tx.storeConversationAccountInvitation.findFirst({
        select: { id: true, status: true },
        where: {
          conversationId: conversation.id,
          id: parsed.invitationId,
          messageId: parsed.messageId,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
      })
      if (!invitation) {
        throw new StoreConversationError(
          "NOT_FOUND",
          "This account invitation is unavailable.",
        )
      }
      return {
        invitation: projectStoreConversationAccountInvitation({
          id: invitation.id,
          state: invitationState(invitation.status),
        }),
        replayed: true,
      }
    }
    const invitation = await tx.storeConversationAccountInvitation.findFirst({
      select: { id: true, status: true },
      where: {
        conversationId: conversation.id,
        id: parsed.invitationId,
        messageId: parsed.messageId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!invitation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This account invitation is unavailable.",
      )
    }
    if (invitation.status === StoreConversationAccountInvitationStatus.LINKED) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation is already linked to an account.",
      )
    }
    if (
      invitation.status === StoreConversationAccountInvitationStatus.OFFERED
    ) {
      await tx.storeConversationAccountInvitation.update({
        data: {
          dismissedAt: now,
          status: StoreConversationAccountInvitationStatus.DISMISSED,
        },
        where: { id: invitation.id },
      })
    }
    await tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        kind: StoreConversationCommandKind.ACCOUNT_INVITATION_DISMISSED,
        messageId: parsed.messageId,
        payloadHash,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    return {
      invitation: projectStoreConversationAccountInvitation({
        id: invitation.id,
        state: "dismissed",
      }),
      replayed:
        invitation.status ===
        StoreConversationAccountInvitationStatus.DISMISSED,
    }
  })
}

export async function listGuestStoreConversationAccountCandidates(
  db: PrismaClient,
  input: {
    accountUserId: string
    credentialToken: string
    cursor?: string
    installationToken?: string
    pageSize?: number
    purpose?: StoreConversationGuestCredentialPurpose
  },
): Promise<
  StoreConversationAccountCandidateListProjection & {
    credentialExpiresAt: Date
  }
> {
  const parsed = storeConversationAccountCandidateListInputSchema.parse({
    cursor: input.cursor,
    pageSize: input.pageSize,
  })
  const cursor = decodeCandidateCursor(parsed.cursor)
  const now = new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    await assertAccountUser(tx, input.accountUserId)
    const credential = await resolveStoreConversationGuestCredential(tx, {
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose:
        input.purpose ?? StoreConversationGuestCredentialPurpose.WEB_DEVICE,
    })
    const rows = await tx.storeConversation.findMany({
      include: {
        accountAccess: { select: { accountUserId: true } },
        accountInvitations: {
          orderBy: { createdAt: "desc" },
          select: { status: true },
          take: 1,
        },
        store: { select: { name: true } },
      },
      orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
      take: parsed.pageSize + 1,
      where: {
        lifecycle: StoreConversationLifecycle.ACTIVE,
        OR: [
          { guestIdentityId: credential.guestIdentityId },
          {
            guestAccesses: {
              some: {
                guestIdentityId: credential.guestIdentityId,
                status: StoreConversationGuestAccessStatus.ACTIVE,
              },
            },
          },
        ],
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { lastActivityAt: { lt: cursor.lastActivityAt } },
                    {
                      id: { lt: cursor.id },
                      lastActivityAt: cursor.lastActivityAt,
                    },
                  ],
                },
              ],
            }
          : {}),
      },
    })
    const selected = rows.slice(0, parsed.pageSize)
    const last = selected.at(-1)
    const credentialExpiresAt = await touchStoreConversationGuestCredential(
      tx,
      {
        credentialId: credential.id,
        guestIdentityId: credential.guestIdentityId,
        now,
      },
    )
    return {
      credentialExpiresAt,
      items: selected.map((conversation) => ({
        conversationId: conversation.id,
        invitationState: conversation.accountInvitations[0]
          ? invitationState(conversation.accountInvitations[0].status)
          : null,
        lastActivityAt: conversation.lastActivityAt,
        linked:
          conversation.accountAccess?.accountUserId === input.accountUserId,
        state:
          conversation.accountAccess &&
          conversation.accountAccess.accountUserId !== input.accountUserId
            ? ("restricted" as const)
            : conversation.moderationState ===
                StoreConversationModerationState.RESTRICTED
              ? ("restricted" as const)
              : ("active" as const),
        storeAvatar: {
          kind: "initials" as const,
          label: projectStoreInitials(conversation.store.name),
        },
        storeName: conversation.store.name,
      })),
      nextCursor:
        rows.length > parsed.pageSize && last
          ? encodeCandidateCursor({
              id: last.id,
              lastActivityAt: last.lastActivityAt,
            })
          : null,
    }
  })
}

export async function loadStoreConversationForAccount(
  db: DbClient,
  input: {
    accountUserId: string
    conversationId: string
    now?: Date
    storeId: string
    tenantId: string
    touchAccess?: boolean
  },
) {
  await assertAccountUser(db, input.accountUserId)
  const access = await db.storeConversationAccountAccess.findFirst({
    include: { conversation: { include: { store: true } } },
    where: {
      accountUserId: input.accountUserId,
      conversationId: input.conversationId,
      status: StoreConversationAccountAccessStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!access) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Store conversation is unavailable.",
    )
  }
  if (input.touchAccess !== false) {
    await db.storeConversationAccountAccess.update({
      data: { lastOpenedAt: input.now ?? new Date() },
      where: { id: access.id },
    })
  }
  return access
}

export async function resumeStoreConversationForAccount(
  db: DbClient,
  input: {
    accountUserId: string
    now?: Date
    publicToken: string
  },
) {
  const now = input.now ?? new Date()
  await assertAccountUser(db, input.accountUserId)
  const entry = await db.customerEntryPoint.findFirst({
    select: { storeId: true, tenantId: true },
    where: {
      publicTokenDigest: digestStoreConversationValue(input.publicToken),
      status: CustomerEntryPointStatus.PUBLISHED,
    },
  })
  if (!entry) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Store link is unavailable. Scan the current Store QR and try again.",
    )
  }
  const access = await db.storeConversationAccountAccess.findFirst({
    select: { conversationId: true, id: true },
    where: {
      accountUserId: input.accountUserId,
      status: StoreConversationAccountAccessStatus.ACTIVE,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
  })
  if (!access) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "No linked conversation is available for this Store.",
    )
  }
  await db.storeConversationAccountAccess.update({
    data: { lastOpenedAt: now },
    where: { id: access.id },
  })
  return { conversation: { id: access.conversationId } }
}

export async function listStoreConversationAccountConversations(
  db: PrismaClient,
  input: {
    accountUserId: string
    cursor?: string
    pageSize?: number
  },
): Promise<StoreConversationAccountListProjection> {
  const parsed = storeConversationAccountCandidateListInputSchema.parse({
    cursor: input.cursor,
    pageSize: input.pageSize,
  })
  const cursor = decodeCandidateCursor(parsed.cursor)
  return runStoreConversationActionTransaction(db, async (tx) => {
    await assertAccountUser(tx, input.accountUserId)
    const rows = await tx.storeConversationAccountAccess.findMany({
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { sequence: "desc" },
              select: { authorKind: true, body: true },
              take: 1,
            },
            store: {
              select: {
                customerEntryPoint: {
                  select: { publicToken: true, status: true },
                },
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        { conversation: { lastActivityAt: "desc" } },
        { conversationId: "desc" },
      ],
      take: parsed.pageSize + 1,
      where: {
        accountUserId: input.accountUserId,
        status: StoreConversationAccountAccessStatus.ACTIVE,
        ...(cursor
          ? {
              OR: [
                {
                  conversation: {
                    lastActivityAt: { lt: cursor.lastActivityAt },
                  },
                },
                {
                  conversationId: { lt: cursor.id },
                  conversation: { lastActivityAt: cursor.lastActivityAt },
                },
              ],
            }
          : {}),
        conversation: {
          store: {
            customerEntryPoint: {
              is: { status: CustomerEntryPointStatus.PUBLISHED },
            },
          },
        },
      },
    })
    const selected = rows.slice(0, parsed.pageSize)
    const unreadStoreMessages = new Map<string, number>(
      await Promise.all(
        selected.map(
          async (access) =>
            [
              access.conversation.id,
              await tx.storeConversationMessage.count({
                where: {
                  authorKind:
                    StoreConversationMessageAuthorKind.STORE_ATTENDANT,
                  conversationId: access.conversation.id,
                  occurredAt: { gt: access.lastOpenedAt },
                  storeId: access.storeId,
                  tenantId: access.tenantId,
                },
              }),
            ] as const,
        ),
      ),
    )
    const last = selected.at(-1)
    return {
      items: selected.flatMap((access) => {
        const entry = access.conversation.store.customerEntryPoint
        return entry?.status === CustomerEntryPointStatus.PUBLISHED
          ? [
              {
                conversationId: access.conversation.id,
                lastActivityAt: access.conversation.lastActivityAt,
                lastMessage: access.conversation.messages[0]
                  ? {
                      author: projectListMessageAuthor(
                        access.conversation.messages[0].authorKind,
                      ),
                      text: access.conversation.messages[0].body,
                    }
                  : null,
                lastMessageSequence: access.conversation.lastMessageSequence,
                publicToken: entry.publicToken,
                state:
                  access.conversation.moderationState ===
                  StoreConversationModerationState.RESTRICTED
                    ? ("restricted" as const)
                    : access.conversation.lifecycle ===
                        StoreConversationLifecycle.ARCHIVED
                      ? ("archived" as const)
                      : ("active" as const),
                storeAvatar: {
                  kind: "initials" as const,
                  label: projectStoreInitials(access.conversation.store.name),
                },
                storeName: access.conversation.store.name,
                unreadStoreMessages:
                  unreadStoreMessages.get(access.conversation.id) ?? 0,
              },
            ]
          : []
      }),
      nextCursor:
        rows.length > parsed.pageSize && last
          ? encodeCandidateCursor({
              id: last.conversationId,
              lastActivityAt: last.conversation.lastActivityAt,
            })
          : null,
    }
  })
}

async function linkAccountConversationsTransaction(
  tx: DbClient,
  input: {
    accountUserId: string
    clientOperationId: string
    conversationIds: string[]
    credentialToken: string
    device: GuestDeviceContext
  },
): Promise<AccountCommandResult<StoreConversationAccountLinkProjection>> {
  const now = new Date()
  await assertAccountUser(tx, input.accountUserId)
  await lockAccountUser(tx, input.accountUserId)
  let credential = await resolveStoreConversationGuestCredential(tx, {
    credentialToken: input.credentialToken,
    installationToken: input.device.installationToken,
    now,
    purpose: input.device.purpose,
  })
  await lockGuestCredential(tx, credential.id)
  credential = await resolveStoreConversationGuestCredential(tx, {
    credentialToken: input.credentialToken,
    installationToken: input.device.installationToken,
    now,
    purpose: input.device.purpose,
  })
  const payloadHash = storeConversationPayloadHash({
    accountUserId: input.accountUserId,
    confirmed: true,
    conversationIds: input.conversationIds,
    guestIdentityId: credential.guestIdentityId,
  })
  const prior = await tx.storeConversationAccountLinkCommand.findUnique({
    where: {
      accountUserId_clientOperationId: {
        accountUserId: input.accountUserId,
        clientOperationId: input.clientOperationId,
      },
    },
  })
  if (prior) {
    if (
      prior.guestIdentityId !== credential.guestIdentityId ||
      prior.linkedConversationCount !== input.conversationIds.length ||
      prior.payloadHash !== payloadHash
    ) {
      await recordDeniedAccountAudit(tx, {
        accountUserId: input.accountUserId,
        clientOperationId: input.clientOperationId,
        credentialId: credential.id,
        guestIdentityId: credential.guestIdentityId,
        payloadHash,
        reasonCode: "account_link_operation_conflict",
        type: StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED,
      })
      return {
        code: "CONFLICT",
        message:
          "This account-link command was already used with different input.",
        ok: false,
      }
    }
    const linkedCount = await tx.storeConversationAccountAccess.count({
      where: {
        accountUserId: input.accountUserId,
        conversationId: { in: input.conversationIds },
        status: StoreConversationAccountAccessStatus.ACTIVE,
      },
    })
    if (linkedCount !== input.conversationIds.length) {
      return {
        code: "CONFLICT",
        message: "The linked conversations changed. Review them and try again.",
        ok: false,
      }
    }
    await touchStoreConversationGuestCredential(tx, {
      credentialId: credential.id,
      guestIdentityId: credential.guestIdentityId,
      now,
    })
    return {
      ok: true,
      result: {
        linkedConversationIds: input.conversationIds,
        replayed: true,
      },
    }
  }

  let conversations = await tx.storeConversation.findMany({
    include: {
      accountAccess: true,
      accountInvitations: {
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take: 1,
      },
    },
    where: {
      id: { in: input.conversationIds },
      lifecycle: StoreConversationLifecycle.ACTIVE,
      OR: [
        { guestIdentityId: credential.guestIdentityId },
        {
          guestAccesses: {
            some: {
              guestIdentityId: credential.guestIdentityId,
              status: StoreConversationGuestAccessStatus.ACTIVE,
            },
          },
        },
      ],
    },
  })
  if (conversations.length !== input.conversationIds.length) {
    await recordDeniedAccountAudit(tx, {
      accountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      credentialId: credential.id,
      guestIdentityId: credential.guestIdentityId,
      payloadHash,
      reasonCode: "account_link_selection_unavailable",
      type: StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED,
    })
    return {
      code: "NOT_FOUND",
      message: "One or more conversations are no longer available to link.",
      ok: false,
    }
  }
  conversations.sort((left, right) => left.id.localeCompare(right.id))
  for (const conversation of conversations) {
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: conversation.storeId,
      tenantId: conversation.tenantId,
    })
  }
  conversations = await tx.storeConversation.findMany({
    include: {
      accountAccess: true,
      accountInvitations: {
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take: 1,
      },
    },
    where: {
      id: { in: input.conversationIds },
      lifecycle: StoreConversationLifecycle.ACTIVE,
      OR: [
        { guestIdentityId: credential.guestIdentityId },
        {
          guestAccesses: {
            some: {
              guestIdentityId: credential.guestIdentityId,
              status: StoreConversationGuestAccessStatus.ACTIVE,
            },
          },
        },
      ],
    },
  })
  if (conversations.length !== input.conversationIds.length) {
    await recordDeniedAccountAudit(tx, {
      accountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      credentialId: credential.id,
      guestIdentityId: credential.guestIdentityId,
      payloadHash,
      reasonCode: "account_link_selection_stale",
      type: StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED,
    })
    return {
      code: "CONFLICT",
      message: "The selected conversations changed. Review them and try again.",
      ok: false,
    }
  }
  conversations.sort((left, right) => left.id.localeCompare(right.id))
  const conflict = conversations.find(
    (conversation) =>
      conversation.accountAccess &&
      conversation.accountAccess.accountUserId !== input.accountUserId,
  )
  if (conflict) {
    await recordDeniedAccountAudit(tx, {
      accountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      credentialId: credential.id,
      guestIdentityId: credential.guestIdentityId,
      payloadHash,
      reasonCode: "account_link_conversation_conflict",
      scope: {
        conversationId: conflict.id,
        invitationId: conflict.accountInvitations[0]?.id,
        storeId: conflict.storeId,
        tenantId: conflict.tenantId,
      },
      type: StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED,
    })
    return {
      code: "CONFLICT",
      message: "One conversation is already linked to another account.",
      ok: false,
    }
  }
  const storeIds = [...new Set(conversations.map((row) => row.storeId))]
  if (storeIds.length !== conversations.length) {
    const duplicateStoreConversation = conversations.find(
      (conversation, index) =>
        conversations.findIndex(
          (candidate) => candidate.storeId === conversation.storeId,
        ) !== index,
    )
    await recordDeniedAccountAudit(tx, {
      accountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      credentialId: credential.id,
      guestIdentityId: credential.guestIdentityId,
      payloadHash,
      reasonCode: "account_link_selected_store_conflict",
      scope: duplicateStoreConversation
        ? {
            conversationId: duplicateStoreConversation.id,
            invitationId: duplicateStoreConversation.accountInvitations[0]?.id,
            storeId: duplicateStoreConversation.storeId,
            tenantId: duplicateStoreConversation.tenantId,
          }
        : undefined,
      type: StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED,
    })
    return {
      code: "CONFLICT",
      message:
        "Choose only one active conversation for each Store before linking.",
      ok: false,
    }
  }
  const existingForStores = await tx.storeConversationAccountAccess.findMany({
    select: { conversationId: true, storeId: true },
    where: {
      accountUserId: input.accountUserId,
      status: StoreConversationAccountAccessStatus.ACTIVE,
      storeId: { in: storeIds },
    },
  })
  const selectedIds = new Set(input.conversationIds)
  const storeConflict = existingForStores.find(
    (access) => !selectedIds.has(access.conversationId),
  )
  if (storeConflict) {
    const scoped = conversations.find(
      (conversation) => conversation.storeId === storeConflict.storeId,
    )
    await recordDeniedAccountAudit(tx, {
      accountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      credentialId: credential.id,
      guestIdentityId: credential.guestIdentityId,
      payloadHash,
      reasonCode: "account_link_store_conflict",
      scope: scoped
        ? {
            conversationId: scoped.id,
            invitationId: scoped.accountInvitations[0]?.id,
            storeId: scoped.storeId,
            tenantId: scoped.tenantId,
          }
        : undefined,
      type: StoreConversationAccountAuditType.ACCOUNT_LINK_DENIED,
    })
    return {
      code: "CONFLICT",
      message:
        "This account already has another active conversation with the Store.",
      ok: false,
    }
  }

  for (const conversation of conversations) {
    if (!conversation.accountAccess) {
      await tx.storeConversationAccountAccess.create({
        data: {
          accountUserId: input.accountUserId,
          conversationId: conversation.id,
          linkedGuestIdentityId: credential.guestIdentityId,
          storeId: conversation.storeId,
          tenantId: conversation.tenantId,
        },
      })
    }
    await tx.storeConversationAccountInvitation.updateMany({
      data: {
        linkedAt: now,
        status: StoreConversationAccountInvitationStatus.LINKED,
      },
      where: {
        conversationId: conversation.id,
        status: {
          in: [
            StoreConversationAccountInvitationStatus.OFFERED,
            StoreConversationAccountInvitationStatus.DISMISSED,
          ],
        },
      },
    })
    await tx.storeConversationAccountAuditEvent.create({
      data: {
        actorAccountUserId: input.accountUserId,
        clientOperationId: input.clientOperationId,
        conversationId: conversation.id,
        credentialId: credential.id,
        guestIdentityId: credential.guestIdentityId,
        invitationId: conversation.accountInvitations[0]?.id,
        outcome: StoreConversationAccountAuditOutcome.ALLOWED,
        payloadHash,
        purpose: StoreConversationAccountAuditPurpose.ACCOUNT_ADOPTION,
        reasonCode: "explicit_guest_account_link",
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
        type: StoreConversationAccountAuditType.ACCOUNT_LINKED,
      },
    })
  }
  await tx.storeConversationAccountLinkCommand.create({
    data: {
      accountUserId: input.accountUserId,
      clientOperationId: input.clientOperationId,
      guestIdentityId: credential.guestIdentityId,
      linkedConversationCount: conversations.length,
      payloadHash,
    },
  })
  await touchStoreConversationGuestCredential(tx, {
    credentialId: credential.id,
    guestIdentityId: credential.guestIdentityId,
    now,
  })
  return {
    ok: true,
    result: {
      linkedConversationIds: input.conversationIds,
      replayed: false,
    },
  }
}

export async function linkGuestStoreConversationsToAccount(
  db: PrismaClient,
  input: {
    accountUserId: string
    clientOperationId: string
    confirmed: true
    conversationIds: string[]
    credentialToken: string
    installationToken?: string
    purpose?: StoreConversationGuestCredentialPurpose
  },
) {
  const parsed = storeConversationAccountLinkInputSchema.parse({
    clientOperationId: input.clientOperationId,
    confirmed: input.confirmed,
    conversationIds: input.conversationIds,
  })
  const outcome = await runStoreConversationActionTransaction(db, (tx) =>
    linkAccountConversationsTransaction(tx, {
      accountUserId: input.accountUserId,
      clientOperationId: parsed.clientOperationId,
      conversationIds: parsed.conversationIds,
      credentialToken: input.credentialToken,
      device: {
        installationToken: input.installationToken,
        purpose:
          input.purpose ?? StoreConversationGuestCredentialPurpose.WEB_DEVICE,
      },
    }),
  )
  if (!outcome.ok) {
    throw new StoreConversationError(outcome.code, outcome.message)
  }
  return outcome.result
}

export async function listStoreConversationAccountDevices(
  db: PrismaClient,
  input: {
    accountUserId: string
    currentGuest?: {
      credentialToken: string
      installationToken?: string
      purpose: StoreConversationGuestCredentialPurpose
    }
  },
): Promise<StoreConversationAccountDeviceProjection[]> {
  const now = new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    await assertAccountUser(tx, input.accountUserId)
    let currentCredentialId: string | undefined
    if (input.currentGuest) {
      try {
        currentCredentialId = (
          await resolveStoreConversationGuestCredential(tx, {
            credentialToken: input.currentGuest.credentialToken,
            installationToken: input.currentGuest.installationToken,
            now,
            purpose: input.currentGuest.purpose,
          })
        ).id
      } catch (error) {
        if (!(error instanceof StoreConversationError)) throw error
      }
    }
    const accesses = await tx.storeConversationAccountAccess.findMany({
      select: {
        linkedGuestIdentityId: true,
        conversation: {
          select: {
            guestAccesses: {
              select: { guestIdentityId: true },
              take: MAX_ACCOUNT_DEVICES + 1,
              where: { status: StoreConversationGuestAccessStatus.ACTIVE },
            },
            guestIdentityId: true,
          },
        },
      },
      take: MAX_ACCOUNT_DEVICES + 1,
      where: {
        accountUserId: input.accountUserId,
        status: StoreConversationAccountAccessStatus.ACTIVE,
      },
    })
    if (accesses.length > MAX_ACCOUNT_DEVICES) {
      throw new StoreConversationError(
        "CONFLICT",
        "This account has too many linked devices to list safely.",
      )
    }
    const eligibleGuestIdentityIds = [
      ...new Set(
        accesses.flatMap((access) => [
          access.linkedGuestIdentityId,
          access.conversation.guestIdentityId,
          ...access.conversation.guestAccesses.map(
            (guestAccess) => guestAccess.guestIdentityId,
          ),
        ]),
      ),
    ]
    if (eligibleGuestIdentityIds.length > MAX_ACCOUNT_DEVICES) {
      throw new StoreConversationError(
        "CONFLICT",
        "This account has too many linked devices to list safely.",
      )
    }
    const credentials = await tx.storeConversationGuestCredential.findMany({
      orderBy: [{ lastUsedAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
        expiresAt: true,
        guestIdentityId: true,
        id: true,
        lastUsedAt: true,
        purpose: true,
        status: true,
      },
      take: MAX_ACCOUNT_DEVICES + 1,
      where: {
        guestIdentityId: {
          in: eligibleGuestIdentityIds,
        },
      },
    })
    if (credentials.length > MAX_ACCOUNT_DEVICES) {
      throw new StoreConversationError(
        "CONFLICT",
        "This account has too many linked devices to list safely.",
      )
    }
    return credentials.map((credential) => ({
      createdAt: credential.createdAt,
      current: credential.id === currentCredentialId,
      deviceId: credential.id,
      lastUsedAt: credential.lastUsedAt,
      purpose:
        credential.purpose ===
        StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
          ? ("mobile" as const)
          : ("web" as const),
      status:
        credential.status === StoreConversationGuestCredentialStatus.REVOKED
          ? ("revoked" as const)
          : credential.status === StoreConversationGuestCredentialStatus.ROTATED
            ? ("rotated" as const)
            : credential.expiresAt <= now
              ? ("expired" as const)
              : ("active" as const),
    }))
  })
}

export async function revokeStoreConversationAccountDevice(
  db: PrismaClient,
  input: {
    accountUserId: string
    clientOperationId: string
    confirmed: true
    deviceId: string
  },
) {
  const parsed = storeConversationAccountDeviceRevokeInputSchema.parse({
    clientOperationId: input.clientOperationId,
    confirmed: input.confirmed,
    deviceId: input.deviceId,
  })
  const outcome = await runStoreConversationActionTransaction(
    db,
    async (tx) => {
      await assertAccountUser(tx, input.accountUserId)
      await lockAccountUser(tx, input.accountUserId)
      const payloadHash = storeConversationPayloadHash({
        accountUserId: input.accountUserId,
        confirmed: true,
        deviceId: parsed.deviceId,
      })
      const prior = await tx.storeConversationAccountDeviceCommand.findUnique({
        where: {
          accountUserId_clientOperationId: {
            accountUserId: input.accountUserId,
            clientOperationId: parsed.clientOperationId,
          },
        },
      })
      if (prior) {
        if (
          prior.credentialId !== parsed.deviceId ||
          prior.payloadHash !== payloadHash
        ) {
          await recordDeniedAccountAudit(tx, {
            accountUserId: input.accountUserId,
            clientOperationId: parsed.clientOperationId,
            payloadHash,
            reasonCode: "device_revoke_operation_conflict",
            type: StoreConversationAccountAuditType.DEVICE_REVOCATION_DENIED,
          })
          return {
            code: "CONFLICT" as const,
            message:
              "This device command was already used with different input.",
            ok: false as const,
          }
        }
        return {
          ok: true as const,
          result: { deviceId: parsed.deviceId, replayed: true },
        }
      }
      await lockGuestCredential(tx, parsed.deviceId)
      const credential = await tx.storeConversationGuestCredential.findUnique({
        select: { guestIdentityId: true, id: true, status: true },
        where: { id: parsed.deviceId },
      })
      if (!credential) {
        await recordDeniedAccountAudit(tx, {
          accountUserId: input.accountUserId,
          clientOperationId: parsed.clientOperationId,
          payloadHash,
          reasonCode: "device_revoke_unavailable",
          type: StoreConversationAccountAuditType.DEVICE_REVOCATION_DENIED,
        })
        return {
          code: "NOT_FOUND" as const,
          message: "This linked device is unavailable.",
          ok: false as const,
        }
      }
      const accesses = await tx.storeConversationAccountAccess.findMany({
        select: {
          conversationId: true,
          storeId: true,
          tenantId: true,
        },
        where: {
          accountUserId: input.accountUserId,
          status: StoreConversationAccountAccessStatus.ACTIVE,
          OR: [
            { linkedGuestIdentityId: credential.guestIdentityId },
            {
              conversation: {
                is: { guestIdentityId: credential.guestIdentityId },
              },
            },
            {
              conversation: {
                is: {
                  guestAccesses: {
                    some: {
                      guestIdentityId: credential.guestIdentityId,
                      status: StoreConversationGuestAccessStatus.ACTIVE,
                    },
                  },
                },
              },
            },
          ],
        },
      })
      if (accesses.length === 0) {
        await recordDeniedAccountAudit(tx, {
          accountUserId: input.accountUserId,
          clientOperationId: parsed.clientOperationId,
          payloadHash,
          reasonCode: "device_revoke_forbidden",
          type: StoreConversationAccountAuditType.DEVICE_REVOCATION_DENIED,
        })
        return {
          code: "FORBIDDEN" as const,
          message: "This linked device is unavailable.",
          ok: false as const,
        }
      }
      if (
        credential.status !== StoreConversationGuestCredentialStatus.REVOKED
      ) {
        await tx.storeConversationGuestCredential.update({
          data: { status: StoreConversationGuestCredentialStatus.REVOKED },
          where: { id: credential.id },
        })
      }
      for (const access of accesses) {
        await tx.storeConversationAccountAuditEvent.create({
          data: {
            actorAccountUserId: input.accountUserId,
            clientOperationId: parsed.clientOperationId,
            conversationId: access.conversationId,
            credentialId: credential.id,
            guestIdentityId: credential.guestIdentityId,
            outcome: StoreConversationAccountAuditOutcome.ALLOWED,
            payloadHash,
            purpose: StoreConversationAccountAuditPurpose.DEVICE_SECURITY,
            reasonCode: "explicit_linked_device_revocation",
            storeId: access.storeId,
            tenantId: access.tenantId,
            type: StoreConversationAccountAuditType.DEVICE_REVOKED,
          },
        })
      }
      await tx.storeConversationAccountDeviceCommand.create({
        data: {
          accountUserId: input.accountUserId,
          clientOperationId: parsed.clientOperationId,
          credentialId: credential.id,
          payloadHash,
        },
      })
      return {
        ok: true as const,
        result: {
          deviceId: credential.id,
          replayed:
            credential.status ===
            StoreConversationGuestCredentialStatus.REVOKED,
        },
      }
    },
  )
  if (!outcome.ok) {
    throw new StoreConversationError(outcome.code, outcome.message)
  }
  return outcome.result
}
